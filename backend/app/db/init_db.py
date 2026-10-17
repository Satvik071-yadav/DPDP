import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import Base, engine
from app.models.entities import ScanJob, FindingModel, AuditRecordModel, SettingsModel, UserModel
from app.db.fixtures import INITIAL_FIXTURE_FINDINGS
from app.core.auth import hash_password
from app.db.migrations import run_migrations



def get_utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run schema migrations to ensure indexes and latest columns are present
    await run_migrations(engine)

    # Seed baseline fixtures if table is empty
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(FindingModel))
        existing = result.scalars().first()
        if not existing:
            now = get_utc_now()
            # Seed Scan Job
            scan_job = ScanJob(
                id="SCAN-2026-1014-01",
                target_url="https://paysecure-india.in",
                profile="deep_audit",
                status="completed",
                progress_stage="completed",
                progress_percent=100,
                log_message="Initial deep audit baseline completed.",
                initiated_at=now - datetime.timedelta(minutes=30),
                completed_at=now - datetime.timedelta(minutes=29),
                duration_seconds=57,
                risk_score=78,
                compliance_score=42,
                consent_mode_enabled=True,
                findings_count={
                    "critical": 1, "high": 2, "medium": 0, "low": 0, "info": 0, "total": 3
                },
                is_demo=True
            )
            session.add(scan_job)
            await session.flush()

            # Seed Findings
            for f in INITIAL_FIXTURE_FINDINGS:
                finding = FindingModel(
                    id=f["id"],
                    scan_id=scan_job.id,
                    title=f["title"],
                    severity=f["severity"],
                    category=f["category"],
                    status=f["status"],
                    confidence=f["confidence"],
                    affected_url=f["affected_url"],
                    endpoint=f["endpoint"],
                    dpdp_section=f["dpdp_section"],
                    summary=f["summary"],
                    impact_explanation=f["impact_explanation"],
                    legal_risk_score=f["legal_risk_score"],
                    is_demo=f["is_demo"],
                    observed_evidence=f["observed_evidence"],
                    remediation_steps=f["remediation_steps"],
                    code_diff=f.get("code_diff"),
                    verification_history=f.get("verification_history", [])
                )
                session.add(finding)

            # Seed Initial Audit Record
            audit = AuditRecordModel(
                id="AUDIT-HIST-102",
                finding_id="DPDP-HIGH-007",
                finding_title="Broken Object-Level Authorization (BOLA/IDOR) on Customer KYC Profile API",
                test_case_id="TC-BOLA-AUTH-001",
                timestamp=get_utc_now() - datetime.timedelta(minutes=15),
                result="FAIL",
                remediation_status="open",
                is_patched=False,
                evidence_summary="Account A (usr_demo_custA) retrieved Account B (usr_demo_custB) KYC profile without authorization.",
                target_endpoint="/api/v1/customers/usr_demo_custB/kyc-record",
                status_code=200
            )
            session.add(audit)
            await session.commit()

        # Seed default Settings if not present
        settings_res = await session.execute(select(SettingsModel).where(SettingsModel.id == "default"))
        if not settings_res.scalars().first():
            default_settings = SettingsModel(
                id="default",
                organization_name="Bharat Privacy Labs Ltd.",
                dpo_name="Aditi Deshmukh, CISSP",
                dpo_email="dpo@bharatprivacy.in",
                jurisdiction="Republic of India (DPDP Act 2023)",
                demo_mode=True,
                api_url="http://127.0.0.1:8000",
                scan_rate_limit="standard",
                ruleset_version="DPDP-2023.4-IN (Updated Q4 2026)",
                notifications={
                    "emailAlerts": True,
                    "notifyOnCritical": True,
                    "webhookUrl": "https://hooks.slack.com/services/T00/B00/DPDPAlerts"
                }
            )
            session.add(default_settings)
            await session.commit()

        # Seed default DPO user if not present
        user_res = await session.execute(select(UserModel).where(UserModel.username == "aditi.deshmukh"))
        if not user_res.scalars().first():
            default_user = UserModel(
                id="usr_dpo_001",
                username="aditi.deshmukh",
                email="dpo@bharatprivacy.in",
                full_name="Aditi Deshmukh",
                role="dpo",
                password_hash=hash_password("dpdp_guard_demo_2026"),
                is_active=True
            )
            session.add(default_user)
            await session.commit()

        # Sanitize any historical copilot interactions on startup
        from app.db.cleanup_copilot import sanitize_historical_copilot_interactions
        await sanitize_historical_copilot_interactions(session)

