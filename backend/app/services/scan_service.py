import datetime
import uuid
import asyncio
import logging
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status

logger = logging.getLogger("dpdp_guard.scan_service")
_active_scan_tasks: Dict[str, asyncio.Task] = {}

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.entities import ScanJob, FindingModel, BrowserObservationModel
from app.schemas.contracts import (
    CreateScanRequest,
    ScanResultSchema,
    FindingSchema,
    FindingsCountSchema,
    ObservedEvidenceSchema,
    CodeDiffSchema,
    VerificationHistoryItemSchema,
    ScanStatusResponseSchema
)
from app.db.fixtures import INITIAL_FIXTURE_FINDINGS
from app.scanner.browser_observer import browser_observer, BrowserObservationError
from app.core.redaction import redact_text


def get_now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def safe_duration_seconds(t1: datetime.datetime, t2: Optional[datetime.datetime]) -> int:
    if not t2:
        return 0
    if t1.tzinfo is not None and t2.tzinfo is None:
        t2 = t2.replace(tzinfo=datetime.timezone.utc)
    elif t1.tzinfo is None and t2.tzinfo is not None:
        t1 = t1.replace(tzinfo=datetime.timezone.utc)
    return max(1, int((t1 - t2).total_seconds()))


def convert_finding_to_schema(f: FindingModel) -> FindingSchema:
    obs = f.observed_evidence or {}
    cd = f.code_diff
    vh = f.verification_history or []

    return FindingSchema(
        id=f.id,
        title=f.title,
        severity=f.severity,
        category=f.category,
        status=f.status,
        confidence=f.confidence,
        affectedUrl=f.affected_url,
        endpoint=f.endpoint,
        detectedAt=f.detected_at.isoformat() if f.detected_at else get_now_utc().isoformat(),
        evidenceAvailable=f.evidence_available,
        scanId=f.scan_id,
        dpdpSection=f.dpdp_section,
        summary=f.summary,
        description=f.description,
        impactExplanation=f.impact_explanation,
        legalRiskScore=f.legal_risk_score,
        observedEvidence=ObservedEvidenceSchema(
            method=obs.get("method", "GET"),
            url=obs.get("url", f.affected_url),
            initiatorScript=obs.get("initiatorScript"),
            requestHeaders=obs.get("requestHeaders", {}),
            responseHeaders=obs.get("responseHeaders", {}),
            sanitizedPayload=obs.get("sanitizedPayload", ""),
            detectedFields=obs.get("detectedFields", [])
        ),
        remediationSteps=f.remediation_steps or [],
        codeDiff=CodeDiffSchema(**cd) if cd else None,
        verificationHistory=[VerificationHistoryItemSchema(**v) for v in vh] if vh else [],
        isDemo=f.is_demo
    )


def convert_scanjob_to_schema(job: ScanJob, findings: List[FindingModel]) -> ScanResultSchema:
    counts = job.findings_count or {}
    return ScanResultSchema(
        id=job.id,
        targetUrl=job.target_url,
        profile=job.profile,
        initiatedAt=job.initiated_at.isoformat() if job.initiated_at else get_now_utc().isoformat(),
        completedAt=job.completed_at.isoformat() if job.completed_at else None,
        durationSeconds=job.duration_seconds or 0,
        status=job.status,
        riskScore=job.risk_score if job.risk_score is not None else 0,
        complianceScore=job.compliance_score if job.compliance_score is not None else 100,
        findingsCount=FindingsCountSchema(
            critical=counts.get("critical", 0),
            high=counts.get("high", 0),
            medium=counts.get("medium", 0),
            low=counts.get("low", 0),
            info=counts.get("info", 0),
            total=counts.get("total", len(findings))
        ),
        consentModeEnabled=job.consent_mode_enabled,
        findings=[convert_finding_to_schema(f) for f in findings],
        isDemo=job.is_demo,
        errorMessage=job.error_message,
        provenance=job.provenance,
        progressStage=getattr(job, "progress_stage", "completed") or "completed",
        progressPercent=getattr(job, "progress_percent", 100) or 100,
        logMessage=getattr(job, "log_message", None),
        organizationId=job.organization_id,
        websiteId=job.website_id,
        userId=job.user_id
    )



_scan_semaphore: Optional[asyncio.Semaphore] = None


def get_scan_semaphore() -> asyncio.Semaphore:
    global _scan_semaphore
    if _scan_semaphore is None:
        _scan_semaphore = asyncio.Semaphore(settings.MAX_SCAN_CONCURRENCY)
    return _scan_semaphore


class ScanService:
    _active_scan_tasks: Dict[str, asyncio.Task] = _active_scan_tasks

    @staticmethod
    def validate_target_url(raw_url: str) -> str:
        from app.core.security import validate_and_resolve_url
        validated_url, _ = validate_and_resolve_url(raw_url)
        return validated_url

    @staticmethod
    async def create_scan(
        req: CreateScanRequest,
        session: AsyncSession,
        user_id: Optional[str] = None
    ) -> ScanResultSchema:
        # 1. Determine and enforce organization tenancy
        if req.organizationId:
            org_id = req.organizationId
            if user_id:
                from app.services.organization_service import OrganizationService
                await OrganizationService.require_membership(org_id, user_id, session)
        else:
            if user_id:
                from app.services.organization_service import OrganizationService
                org, _ = await OrganizationService.get_or_create_primary_organization(user_id, session)
                org_id = org.id
            else:
                org_id = "org_default"

        # 2. Enforce scan entitlements (Subscription status, Domain verification, Scan quotas)
        from app.services.subscription_service import SubscriptionService
        is_entitled, error_msg, website_obj, is_live_scan = await SubscriptionService.validate_scan_entitlement(
            org_id=org_id,
            user_id=user_id or "usr_anonymous",
            target_url=req.targetUrl,
            session=session
        )
        if not is_entitled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=error_msg
            )

        # Reserve scan quota atomically before queueing or launching execution
        reserved, reserve_err = await SubscriptionService.reserve_scan_quota(org_id, session)
        if not reserved:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=reserve_err
            )

        try:
            # 3. Validate URL with SSRF protection, authorizing verified domain if applicable
            from app.core.security import validate_and_resolve_url
            verified_host = website_obj.hostname if website_obj else None
            validated_url, _ = validate_and_resolve_url(
                req.targetUrl,
                allow_controlled_local=True,
                verified_hostname=verified_host
            )
            now = get_now_utc()
            scan_id = f"SCAN-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"

            # 4. Enforce duplicate check
            owner_filter = []
            if org_id:
                owner_filter.append(ScanJob.organization_id == org_id)
            if user_id:
                owner_filter.append(ScanJob.user_id == user_id)

            dup_conditions = [
                ScanJob.target_url == validated_url,
                ScanJob.status.in_(["queued", "running"])
            ]
            if owner_filter:
                dup_conditions.append(or_(*owner_filter))

            active_res = await session.execute(
                select(ScanJob).where(*dup_conditions)
            )
            active_scan = active_res.scalar_one_or_none()
            if active_scan:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A scan is already in progress for target '{validated_url}' (Scan ID: {active_scan.id})."
                )

            # Check execution profile
            is_testbed_target = "/testbed" in validated_url or "localhost" in validated_url or "127.0.0.1" in validated_url
            is_real_execution = is_live_scan or is_testbed_target
            website_id = website_obj.id if website_obj else None

            # Persist initial scan record in DB immediately so status endpoint and duplicate check work
            scan_job = ScanJob(
                id=scan_id,
                organization_id=org_id,
                website_id=website_id,
                user_id=user_id,
                target_url=validated_url,
                profile=req.profile,
                status="running",
                progress_stage="preparing_env",
                progress_percent=15,
                log_message=f"Initializing scanner environment for {validated_url}",
                initiated_at=now,
                consent_mode_enabled=req.consentModeEnabled,
                is_demo=not is_real_execution,
                provenance="live_browser_observation" if is_real_execution else "controlled_demo",
                quota_reserved=True
            )
            session.add(scan_job)
            await session.commit()
        except Exception:
            await SubscriptionService.release_scan_quota(org_id, session)
            raise

        if req.asyncMode:
            # Launch background execution task and track it
            task = asyncio.create_task(
                ScanService._execute_scan_stages(
                    scan_id=scan_id,
                    validated_url=validated_url,
                    profile=req.profile,
                    consent_mode_enabled=req.consentModeEnabled,
                    is_real_execution=is_real_execution,
                    org_id=org_id,
                    website_id=website_id,
                    now=now
                )
            )
            _active_scan_tasks[scan_id] = task
            return convert_scanjob_to_schema(scan_job, [])
        else:
            # Synchronous execution for test suites or synchronous callers
            await ScanService._execute_scan_stages(
                scan_id=scan_id,
                validated_url=validated_url,
                profile=req.profile,
                consent_mode_enabled=req.consentModeEnabled,
                is_real_execution=is_real_execution,
                org_id=org_id,
                website_id=website_id,
                now=now,
                session=session
            )
            result = await ScanService.get_scan_by_id(scan_id, session)
            if not result:
                raise HTTPException(status_code=500, detail="Failed to retrieve completed scan job.")
            return result

    @staticmethod
    async def _execute_scan_stages(
        scan_id: str,
        validated_url: str,
        profile: str,
        consent_mode_enabled: bool,
        is_real_execution: bool,
        org_id: str,
        website_id: Optional[str],
        now: datetime.datetime,
        session: Optional[AsyncSession] = None
    ) -> None:
        try:
            if session is not None:
                await ScanService._run_stages_logic(
                    session, scan_id, validated_url, profile, consent_mode_enabled, is_real_execution, org_id, website_id, now
                )
            else:
                async with AsyncSessionLocal() as bg_session:
                    await ScanService._run_stages_logic(
                        bg_session, scan_id, validated_url, profile, consent_mode_enabled, is_real_execution, org_id, website_id, now
                    )
        finally:
            _active_scan_tasks.pop(scan_id, None)

    @staticmethod
    async def _run_stages_logic(
        session: AsyncSession,
        scan_id: str,
        validated_url: str,
        profile: str,
        consent_mode_enabled: bool,
        is_real_execution: bool,
        org_id: str,
        website_id: Optional[str],
        now: datetime.datetime
    ) -> None:
        res = await session.execute(select(ScanJob).where(ScanJob.id == scan_id))
        scan_job = res.scalar_one_or_none()
        if not scan_job or scan_job.status == "cancelled":
            return

        semaphore = get_scan_semaphore()
        async with semaphore:
            if is_real_execution:
                try:
                    # Stage 2: Checking Endpoints
                    scan_job.progress_stage = "checking_endpoints"
                    scan_job.progress_percent = 35
                    scan_job.log_message = "Navigating to testbed target and inspecting public DOM endpoints"
                    await session.commit()

                    # Check for cancellation
                    await session.refresh(scan_job)
                    if scan_job.status == "cancelled":
                        return

                    # Stage 3: Running Auth & Consent Tests
                    scan_job.progress_stage = "running_auth_tests"
                    scan_job.progress_percent = 60
                    scan_job.log_message = "Executing comparative consent observation sessions (Accept vs Reject)"
                    await session.commit()

                    obs_accepted = await browser_observer.observe_target(validated_url, scan_id, consent_action="accept")
                    obs_rejected = await browser_observer.observe_target(validated_url, scan_id, consent_action="reject")
                    raw_observations = obs_accepted + obs_rejected

                    # Check for cancellation
                    await session.refresh(scan_job)
                    if scan_job.status == "cancelled":
                        return

                    # Stage 4: Inspecting Network
                    scan_job.progress_stage = "inspecting_network"
                    scan_job.progress_percent = 80
                    scan_job.log_message = f"Recorded {len(raw_observations)} network telemetry events; checking tracking tags"
                    await session.commit()

                    observations_to_persist: List[BrowserObservationModel] = []
                    for ro in raw_observations:
                        obs_entity = BrowserObservationModel(
                            id=ro["id"],
                            scan_id=scan_id,
                            timestamp=ro["timestamp"],
                            url=ro["url"],
                            domain=ro["domain"],
                            method=ro["method"],
                            status_code=ro["status_code"],
                            is_failed=ro["is_failed"],
                            failure_reason=ro["failure_reason"],
                            resource_type=ro["resource_type"],
                            classification=ro["classification"],
                            consent_state=ro["consent_state"],
                            headers_redacted=ro["headers_redacted"],
                            provenance="live_browser_observation"
                        )
                        session.add(obs_entity)
                        observations_to_persist.append(obs_entity)

                    # Stage 5: Preparing Findings and Evidence
                    scan_job.progress_stage = "preparing_evidence"
                    scan_job.progress_percent = 95
                    scan_job.log_message = "Correlating network telemetry against DPDP Act 2023 statutory obligations"
                    await session.commit()

                    persisted_findings: List[FindingModel] = []
                    tp_obs = [o for o in raw_observations if o["classification"] == "third_party"]
                    if tp_obs:
                        f_id = f"DPDP-LIVE-001-{scan_id.split('-')[-1]}"
                        first_tp = tp_obs[0]
                        tp_finding = FindingModel(
                            id=f_id,
                            scan_id=scan_id,
                            title="Third-Party Telemetry Dispatch Observed in Controlled Browser Session",
                            severity="medium",
                            category="tracker_consent_audit",
                            status="open",
                            confidence=94,
                            affected_url=validated_url,
                            endpoint=first_tp["url"],
                            detected_at=now,
                            evidence_available=True,
                            dpdp_section="Section 6(1) - Affirmative Consent Verification",
                            summary=f"Headless browser observed {first_tp['method']} request to third-party endpoint '{first_tp['url']}' during controlled testbed interaction.",
                            impact_explanation="Personal data or telemetry dispatched to third-party services must adhere to purpose limitation and explicit user consent under Section 6 of the DPDP Act 2023.",
                            legal_risk_score=5.5,
                            is_demo=False,
                            provenance="live_browser_observation",
                            observed_evidence={
                                "method": first_tp["method"],
                                "url": first_tp["url"],
                                "initiatorScript": "playwright_browser_observer",
                                "requestHeaders": first_tp["headers_redacted"],
                                "responseHeaders": {},
                                "sanitizedPayload": f"Status: {first_tp['status_code'] or 'Blocked/Failed'}, State: {first_tp['consent_state']}",
                                "detectedFields": ["third_party_telemetry_beacon"]
                            },
                            evidence_observation_ids=[first_tp["id"]],
                            remediation_steps=[
                                "Verify whether tag manager blocks marketing telemetry before affirmative consent is granted.",
                                "Audit third-party network egress rules in client-side bundles."
                            ]
                        )
                        session.add(tp_finding)
                        persisted_findings.append(tp_finding)

                    crit = sum(1 for f in persisted_findings if f.severity == "critical")
                    hi = sum(1 for f in persisted_findings if f.severity == "high")
                    med = sum(1 for f in persisted_findings if f.severity == "medium")
                    low = sum(1 for f in persisted_findings if f.severity == "low")
                    total = len(persisted_findings)

                    risk_score = min(95, crit * 25 + hi * 18 + med * 10 + (10 if total > 0 else 0))
                    compliance_score = max(15, 100 - risk_score)
                    completed_at = get_now_utc()
                    duration_sec = safe_duration_seconds(completed_at, now)

                    # Check if scan was cancelled during observation
                    chk = await session.execute(select(ScanJob.status).where(ScanJob.id == scan_id))
                    if chk.scalar_one_or_none() == "cancelled":
                        logger.info(f"Scan {scan_id} was cancelled before completion commit; discarding results.")
                        return

                    scan_job.status = "completed"
                    scan_job.progress_stage = "completed"
                    scan_job.progress_percent = 100
                    scan_job.completed_at = completed_at
                    scan_job.duration_seconds = duration_sec
                    scan_job.risk_score = risk_score
                    scan_job.compliance_score = compliance_score
                    scan_job.findings_count = {
                        "critical": crit, "high": hi, "medium": med, "low": low, "info": 0, "total": total
                    }
                    scan_job.error_message = None
                    scan_job.log_message = f"Scan completed successfully with {total} findings in {duration_sec}s."
                    await session.commit()

                    try:
                        from app.services.subscription_service import SubscriptionService
                        await SubscriptionService.record_scan_consumed(org_id, website_id, session)
                    except Exception as usg_err:
                        logger.warning(f"Could not update scan usage for org {org_id}: {usg_err}")

                except asyncio.CancelledError:
                    logger.info(f"Scan {scan_id} task was cancelled; releasing resources and ensuring terminal status.")
                    try:
                        curr_res = await session.execute(select(ScanJob).where(ScanJob.id == scan_id))
                        curr_job = curr_res.scalar_one_or_none()
                        if curr_job and curr_job.status != "cancelled":
                            now_c = get_now_utc()
                            curr_job.status = "cancelled"
                            curr_job.progress_stage = "cancelled"
                            curr_job.completed_at = now_c
                            curr_job.duration_seconds = safe_duration_seconds(now_c, curr_job.initiated_at)
                            curr_job.log_message = "Scan cancelled by user."
                            if getattr(curr_job, "quota_reserved", False) and curr_job.organization_id:
                                from app.services.subscription_service import SubscriptionService
                                await SubscriptionService.release_scan_quota(curr_job.organization_id, session)
                                curr_job.quota_reserved = False
                            await session.commit()
                    except Exception:
                        pass
                    return
                except Exception as exc:
                    chk = await session.execute(select(ScanJob.status).where(ScanJob.id == scan_id))
                    if chk.scalar_one_or_none() == "cancelled":
                        logger.info(f"Scan {scan_id} is already cancelled; skipping failure overwrite.")
                        return

                    sanitized_err = redact_text(str(exc))
                    completed_at = get_now_utc()
                    duration_sec = safe_duration_seconds(completed_at, now)

                    scan_job.status = "failed"
                    scan_job.progress_stage = "failed"
                    scan_job.progress_percent = 100
                    scan_job.completed_at = completed_at
                    scan_job.duration_seconds = duration_sec
                    scan_job.risk_score = 0
                    scan_job.compliance_score = 0
                    scan_job.findings_count = {
                        "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0
                    }
                    scan_job.error_message = sanitized_err
                    scan_job.log_message = f"Scan failed: {sanitized_err}"
                    if getattr(scan_job, "quota_reserved", False) and scan_job.organization_id:
                        from app.services.subscription_service import SubscriptionService
                        await SubscriptionService.release_scan_quota(scan_job.organization_id, session)
                        scan_job.quota_reserved = False
                    await session.commit()

            else:
                # Controlled demo fixtures for simulated scenario domains (e.g. paysecure-india.in)
                try:
                    scan_job.progress_stage = "checking_endpoints"
                    scan_job.progress_percent = 35
                    scan_job.log_message = "Inspecting simulated target endpoints and scripts"
                    await session.commit()
                    await asyncio.sleep(0.3)

                    await session.refresh(scan_job)
                    if scan_job.status == "cancelled":
                        return

                    scan_job.progress_stage = "running_auth_tests"
                    scan_job.progress_percent = 60
                    scan_job.log_message = "Evaluating simulated consent boundaries"
                    await session.commit()
                    await asyncio.sleep(0.3)

                    await session.refresh(scan_job)
                    if scan_job.status == "cancelled":
                        return

                    scan_job.progress_stage = "inspecting_network"
                    scan_job.progress_percent = 80
                    scan_job.log_message = "Auditing network egress fixtures"
                    await session.commit()
                    await asyncio.sleep(0.3)

                    await session.refresh(scan_job)
                    if scan_job.status == "cancelled":
                        return

                    if profile == "quick_scan":
                        selected_fixtures = [INITIAL_FIXTURE_FINDINGS[1]]
                    elif profile == "auth_tests":
                        selected_fixtures = [INITIAL_FIXTURE_FINDINGS[2]]
                    else:
                        selected_fixtures = INITIAL_FIXTURE_FINDINGS

                    persisted_findings: List[FindingModel] = []
                    for f in selected_fixtures:
                        new_finding_id = f"{f['id']}-{scan_id.split('-')[-1]}"
                        finding_entity = FindingModel(
                            id=new_finding_id,
                            scan_id=scan_id,
                            title=f["title"],
                            severity=f["severity"],
                            category=f["category"],
                            status="open",
                            confidence=f["confidence"],
                            affected_url=f"{validated_url}/path" if not f["affected_url"].startswith(validated_url) else f["affected_url"],
                            endpoint=f["endpoint"],
                            detected_at=now,
                            evidence_available=True,
                            dpdp_section=f["dpdp_section"],
                            summary=f["summary"],
                            impact_explanation=f["impact_explanation"],
                            legal_risk_score=f["legal_risk_score"],
                            is_demo=True,
                            provenance="controlled_fixture",
                            observed_evidence=f["observed_evidence"],
                            remediation_steps=f["remediation_steps"],
                            code_diff=f.get("code_diff"),
                            verification_history=f.get("verification_history", [])
                        )
                        session.add(finding_entity)
                        persisted_findings.append(finding_entity)

                    crit = sum(1 for f in persisted_findings if f.severity == "critical")
                    hi = sum(1 for f in persisted_findings if f.severity == "high")
                    med = sum(1 for f in persisted_findings if f.severity == "medium")
                    low = sum(1 for f in persisted_findings if f.severity == "low")
                    total = len(persisted_findings)

                    risk_score = min(95, crit * 25 + hi * 18 + med * 10 + 10)
                    compliance_score = max(15, 100 - risk_score)
                    completed_at = get_now_utc()
                    duration_sec = 4

                    # Check if scan was cancelled concurrently
                    chk = await session.execute(select(ScanJob.status).where(ScanJob.id == scan_id))
                    if chk.scalar_one_or_none() == "cancelled":
                        logger.info(f"Scan {scan_id} was cancelled before demo completion commit; discarding.")
                        return

                    scan_job.status = "completed"
                    scan_job.progress_stage = "completed"
                    scan_job.progress_percent = 100
                    scan_job.completed_at = completed_at
                    scan_job.duration_seconds = duration_sec
                    scan_job.risk_score = risk_score
                    scan_job.compliance_score = compliance_score
                    scan_job.findings_count = {
                        "critical": crit, "high": hi, "medium": med, "low": low, "info": 0, "total": total
                    }
                    scan_job.error_message = None
                    scan_job.log_message = f"Controlled scenario scan finished with {total} findings."
                    await session.commit()

                    try:
                        from app.services.subscription_service import SubscriptionService
                        await SubscriptionService.record_scan_consumed(org_id, website_id, session)
                    except Exception as usg_err:
                        logger.warning(f"Could not update scan usage for org {org_id}: {usg_err}")

                except asyncio.CancelledError:
                    logger.info(f"Demo scan {scan_id} task was cancelled; releasing resources.")
                    try:
                        curr_res = await session.execute(select(ScanJob).where(ScanJob.id == scan_id))
                        curr_job = curr_res.scalar_one_or_none()
                        if curr_job and curr_job.status != "cancelled":
                            now_c = get_now_utc()
                            curr_job.status = "cancelled"
                            curr_job.progress_stage = "cancelled"
                            curr_job.completed_at = now_c
                            curr_job.duration_seconds = safe_duration_seconds(now_c, curr_job.initiated_at)
                            curr_job.log_message = "Scan cancelled by user."
                            if getattr(curr_job, "quota_reserved", False) and curr_job.organization_id:
                                from app.services.subscription_service import SubscriptionService
                                await SubscriptionService.release_scan_quota(curr_job.organization_id, session)
                                curr_job.quota_reserved = False
                            await session.commit()
                    except Exception:
                        pass
                    return
                except Exception as exc:
                    chk = await session.execute(select(ScanJob.status).where(ScanJob.id == scan_id))
                    if chk.scalar_one_or_none() == "cancelled":
                        logger.info(f"Scan {scan_id} is already cancelled; skipping demo failure overwrite.")
                        return

                    sanitized_err = redact_text(str(exc))
                    scan_job.status = "failed"
                    scan_job.progress_stage = "failed"
                    scan_job.progress_percent = 100
                    scan_job.completed_at = get_now_utc()
                    scan_job.error_message = sanitized_err
                    scan_job.log_message = f"Scan failed: {sanitized_err}"
                    if getattr(scan_job, "quota_reserved", False) and scan_job.organization_id:
                        from app.services.subscription_service import SubscriptionService
                        await SubscriptionService.release_scan_quota(scan_job.organization_id, session)
                        scan_job.quota_reserved = False
                    await session.commit()

    @staticmethod
    async def get_scan_status(
        scan_id: str,
        session: AsyncSession,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None
    ) -> Optional[ScanStatusResponseSchema]:
        query = select(ScanJob).where(ScanJob.id == scan_id)
        if organization_id:
            query = query.where(ScanJob.organization_id == organization_id)
        elif user_id:
            query = query.where(ScanJob.user_id == user_id)
        result = await session.execute(query)
        job = result.scalar_one_or_none()
        if not job:
            return None
        return ScanStatusResponseSchema(
            scanId=job.id,
            status=job.status,
            stage=job.progress_stage or "completed",
            progress=job.progress_percent if job.progress_percent is not None else 100,
            log=job.log_message or "",
            initiatedAt=job.initiated_at.isoformat() if job.initiated_at else "",
            completedAt=job.completed_at.isoformat() if job.completed_at else None,
            errorMessage=job.error_message
        )

    @staticmethod
    async def cancel_scan(
        scan_id: str,
        session: AsyncSession,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None
    ) -> Optional[ScanStatusResponseSchema]:
        query = select(ScanJob).where(ScanJob.id == scan_id)
        if organization_id:
            query = query.where(ScanJob.organization_id == organization_id)
        elif user_id:
            query = query.where(ScanJob.user_id == user_id)
        result = await session.execute(query)
        job = result.scalar_one_or_none()
        if not job:
            return None
        if job.status not in ["queued", "running"]:
            return None

        now = get_now_utc()
        job.status = "cancelled"
        job.progress_stage = "cancelled"
        job.completed_at = now
        job.duration_seconds = safe_duration_seconds(now, job.initiated_at)
        job.log_message = "Scan cancelled by user."
        if getattr(job, "quota_reserved", False) and job.organization_id:
            from app.services.subscription_service import SubscriptionService
            await SubscriptionService.release_scan_quota(job.organization_id, session)
            job.quota_reserved = False
        await session.commit()

        # Safely terminate in-flight background task
        task = _active_scan_tasks.pop(scan_id, None)
        if task and not task.done():
            task.cancel()

        return ScanStatusResponseSchema(
            scanId=job.id,
            status=job.status,
            stage=job.progress_stage,
            progress=job.progress_percent if job.progress_percent is not None else 100,
            log=job.log_message,
            initiatedAt=job.initiated_at.isoformat() if job.initiated_at else "",
            completedAt=job.completed_at.isoformat() if job.completed_at else None,
            errorMessage=job.error_message
        )

    @staticmethod
    async def get_scan_by_id(
        scan_id: str,
        session: AsyncSession,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None
    ) -> Optional[ScanResultSchema]:
        query = select(ScanJob).where(ScanJob.id == scan_id)
        if organization_id:
            query = query.where(ScanJob.organization_id == organization_id)
        elif user_id:
            query = query.where(ScanJob.user_id == user_id)
        result = await session.execute(query)
        job = result.scalar_one_or_none()
        if not job:
            return None

        findings_res = await session.execute(
            select(FindingModel).where(FindingModel.scan_id == scan_id)
        )
        findings = list(findings_res.scalars().all())
        return convert_scanjob_to_schema(job, findings)

    @staticmethod
    async def list_scans(
        session: AsyncSession,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None
    ) -> List[ScanResultSchema]:
        query = select(ScanJob)
        if organization_id:
            query = query.where(ScanJob.organization_id == organization_id)
        elif user_id:
            query = query.where(ScanJob.user_id == user_id)
        query = query.order_by(ScanJob.initiated_at.desc())
        result = await session.execute(query)
        jobs = result.scalars().all()
        schemas = []
        for job in jobs:
            findings_res = await session.execute(
                select(FindingModel).where(FindingModel.scan_id == job.id)
            )
            findings = list(findings_res.scalars().all())
            schemas.append(convert_scanjob_to_schema(job, findings))
        return schemas


scan_service = ScanService()
