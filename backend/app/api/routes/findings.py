from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import get_current_user, require_role
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
async def list_findings(
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all detected findings scoped to the authenticated user.
    """
    user_id = claims.get("sub")
    return await finding_service.list_findings(db, user_id=user_id)


@router.get("/verification/audit-history", response_model=List[AuditHistoryRecordSchema])
async def list_audit_history(
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve historical probe verification audit records from the database for the authenticated user.
    Retains both before-fix and after-fix outcomes so UI can display a genuine comparison.
    """
    user_id = claims.get("sub")
    res = await db.execute(
        select(AuditRecordModel)
        .where(AuditRecordModel.user_id == user_id)
        .order_by(AuditRecordModel.timestamp.desc())
        .limit(100)
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
    claims: dict = Depends(require_role("dpo", "admin")),
    db: AsyncSession = Depends(get_db)
):
    """
    Clear verification audit history records from the database.
    Requires DPO or Admin privileges and explicit confirmation to prevent accidental loss of accountability records.
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audit history deletion requires explicit confirmation (?confirm=true). Audit trails are required for compliance accountability."
        )
    user_id = claims.get("sub")
    await db.execute(delete(AuditRecordModel).where(AuditRecordModel.user_id == user_id))
    await db.commit()
    return {"cleared": True, "message": "Verification audit history cleared."}


@router.get("/{finding_id}", response_model=FindingSchema)
async def get_finding(
    finding_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve details of a specific finding belonging to the authenticated user.
    """
    user_id = claims.get("sub")
    finding = await finding_service.get_finding_by_id(finding_id, db, user_id=user_id)
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
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update finding status and record verification history entry for the authenticated user.
    """
    user_id = claims.get("sub")
    finding = await finding_service.get_finding_by_id(finding_id, db, user_id=user_id)
    if not finding:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finding with ID '{finding_id}' not found."
        )

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
        "verifiedBy": f"{claims.get('fullName', 'Security Auditor')} ({claims.get('role', 'dpo').upper()})",
        "notes": f"Status updated to {req.status} via API."
    })
    model.verification_history = hist
    await db.commit()
    await db.refresh(model)
    return await finding_service.get_finding_by_id(finding_id, db, user_id=user_id)


@router.get("/{finding_id}/evidence", response_model=ObservedEvidenceSchema)
async def get_finding_evidence(
    finding_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve forensic observed evidence for a specific finding belonging to the authenticated user.
    """
    user_id = claims.get("sub")
    finding = await finding_service.get_finding_by_id(finding_id, db, user_id=user_id)
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
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Executes a deterministic verification probe against the finding test fixture.
    Evaluates PASS or FAIL based on actual status codes and responses.
    Persists audit trail and updates finding status if remediated.
    """
    user_id = claims.get("sub")
    finding = await finding_service.get_finding_by_id(finding_id, db, user_id=user_id)
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
        user_id=user_id,
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
                "verifiedBy": f"{claims.get('fullName', 'Security Auditor')} ({claims.get('role', 'dpo').upper()})",
                "notes": "Automated verification probe confirmed tenant isolation safeguard (HTTP 403 Forbidden)."
            })
            model.verification_history = hist

    await db.commit()

    return probe_result

