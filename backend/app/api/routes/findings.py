from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.contracts import (
    FindingSchema,
    ObservedEvidenceSchema,
    VerifyFindingRequest,
    VerificationProbeResultSchema,
    AuditHistoryRecordSchema
)
from app.schemas.patch_schema import UpdateFindingStatusRequest
from app.services.finding_service import finding_service
from app.services.verification_service import verification_service
from app.models.entities import FindingModel, AuditRecordModel
import datetime

router = APIRouter(prefix="/findings", tags=["Findings"])


def get_utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


@router.get("", response_model=List[FindingSchema])
async def list_findings(db: AsyncSession = Depends(get_db)):
    """
    List all detected findings.
    """
    return await finding_service.list_findings(db)


@router.get("/verification/audit-history", response_model=List[AuditHistoryRecordSchema])
async def list_audit_history(db: AsyncSession = Depends(get_db)):
    """
    Retrieve historical probe verification audit records from the database.
    Retains both before-fix and after-fix outcomes so UI can display a genuine comparison.
    """
    res = await db.execute(
        select(AuditRecordModel).order_by(AuditRecordModel.timestamp.desc()).limit(100)
    )
    records = res.scalars().all()
    return [
        AuditHistoryRecordSchema(
            id=r.id,
            findingId=r.finding_id or "",
            findingTitle=r.finding_title,
            testCaseId=r.test_case_id,
            timestamp=r.timestamp.isoformat() if r.timestamp else "",
            result=r.result,
            remediationStatus=r.remediation_status,
            isPatched=r.is_patched,
            evidenceSummary=r.evidence_summary,
            targetEndpoint=r.target_endpoint,
            statusCode=r.status_code
        )
        for r in records
    ]


@router.delete("/verification/audit-history")
async def clear_audit_history(
    confirm: bool = Query(False, description="Explicit confirmation required to clear audit records"),
    db: AsyncSession = Depends(get_db)
):
    """
    Clear verification audit history records from the database.
    Requires explicit confirmation to prevent accidental loss of accountability records.
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audit history deletion requires explicit confirmation (?confirm=true). Audit trails are required for compliance accountability."
        )
    await db.execute(delete(AuditRecordModel))
    await db.commit()
    return {"cleared": True, "message": "Verification audit history cleared."}


@router.get("/{finding_id}", response_model=FindingSchema)
async def get_finding(finding_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieve details of a specific finding.
    """
    finding = await finding_service.get_finding_by_id(finding_id, db)
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finding with ID '{finding_id}' not found."
        )
    return finding


@router.patch("/{finding_id}/status", response_model=FindingSchema)
async def update_finding_status(
    finding_id: str,
    req: UpdateFindingStatusRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Update finding status and record verification history entry.
    """
    model = await db.get(FindingModel, finding_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finding with ID '{finding_id}' not found."
        )
    model.status = req.status
    now = get_utc_now()
    hist = list(model.verification_history or [])
    hist.append({
        "id": f"VER-{int(now.timestamp())}",
        "timestamp": now.isoformat(),
        "status": "passed" if req.status == "verified_fix" else "pending",
        "verifiedBy": "Security Auditor (API action)",
        "notes": f"Status updated to {req.status} via API."
    })
    model.verification_history = hist
    await db.commit()
    await db.refresh(model)
    return await finding_service.get_finding_by_id(finding_id, db)


@router.get("/{finding_id}/evidence", response_model=ObservedEvidenceSchema)
async def get_finding_evidence(finding_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieve forensic observed evidence for a specific finding.
    """
    finding = await finding_service.get_finding_by_id(finding_id, db)
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finding with ID '{finding_id}' not found."
        )
    return finding.observedEvidence


@router.post("/{finding_id}/verify", response_model=VerificationProbeResultSchema)
async def verify_finding(
    finding_id: str,
    req: VerifyFindingRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Executes a deterministic verification probe against the finding test fixture.
    Evaluates PASS or FAIL based on actual status codes and responses.
    Persists audit trail and updates finding status if remediated.
    """
    finding = await finding_service.get_finding_by_id(finding_id, db)
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finding with ID '{finding_id}' not found."
        )

    probe_result = await verification_service.execute_verification(finding_id, req.isPatched)
    now = get_utc_now()

    # Persist audit record in database
    audit_id = f"AUDIT-HIST-{int(now.timestamp() * 1000)}"
    audit_entry = AuditRecordModel(
        id=audit_id,
        finding_id=finding_id,
        finding_title=finding.title,
        test_case_id=probe_result.testCaseId,
        timestamp=now,
        result=probe_result.outcome,
        remediation_status="verified_fix" if (req.isPatched and probe_result.outcome == "PASS") else "open",
        is_patched=req.isPatched,
        evidence_summary=probe_result.summary,
        target_endpoint=probe_result.request.url,
        status_code=probe_result.response.statusCode,
        probe_details=probe_result.model_dump()
    )
    db.add(audit_entry)

    # If patched and verified PASS, update finding model in database
    if req.isPatched and probe_result.outcome == "PASS":
        model = await db.get(FindingModel, finding_id)
        if model:
            model.status = "verified_fix"
            hist = list(model.verification_history or [])
            hist.append({
                "id": f"VER-{int(now.timestamp())}",
                "timestamp": now.isoformat(),
                "status": "passed",
                "verifiedBy": "DPDP-Guard Automated Sandbox",
                "notes": "Automated verification probe confirmed tenant isolation safeguard (HTTP 403 Forbidden)."
            })
            model.verification_history = hist

    await db.commit()

    return probe_result

