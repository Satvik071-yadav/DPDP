from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import get_current_user
from app.schemas.contracts import CreateScanRequest, ScanResultSchema, FindingSchema, ScanStatusResponseSchema
from app.schemas.observation_schemas import BrowserObservationSchema, ConsentComparisonSummary
from app.services.scan_service import scan_service
from app.services.finding_service import finding_service
from app.services.observation_service import observation_service
from app.services.organization_service import organization_service
from app.models.entities import BrowserObservationModel, ScanJob

router = APIRouter(prefix="/scans", tags=["Scans"])


async def _ensure_scan_access(scan_id: str, user_id: str, db: AsyncSession) -> ScanResultSchema:
    scan = await scan_service.get_scan_by_id(scan_id, db)
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan with ID '{scan_id}' not found."
        )
    if scan.userId != user_id:
        if scan.organizationId:
            try:
                await organization_service.require_membership(scan.organizationId, user_id, db)
            except HTTPException:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Scan with ID '{scan_id}' not found."
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scan with ID '{scan_id}' not found."
            )
    return scan


@router.post("", response_model=ScanResultSchema, status_code=status.HTTP_201_CREATED)
async def create_scan(
    req: CreateScanRequest,
    asyncMode: bool = False,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Creates and executes a controlled scan scoped to the authenticated user and organization.
    If targeting local testbed or verified customer domain, uses Playwright headless browser observation.
    Persists scan job, findings, and recorded observations in the database.
    """
    if asyncMode:
        req.asyncMode = True
    user_id = claims.get("sub")
    return await scan_service.create_scan(req, db, user_id=user_id)


@router.get("", response_model=List[ScanResultSchema])
async def list_scans(
    org_id: Optional[str] = Query(None, alias="orgId"),
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves history of executed scan jobs for the authenticated user or their organization.
    """
    user_id = claims.get("sub")
    if org_id:
        await organization_service.require_membership(org_id, user_id, db)
        return await scan_service.list_scans(db, organization_id=org_id)
    return await scan_service.list_scans(db, user_id=user_id)


@router.get("/{scan_id}", response_model=ScanResultSchema)
async def get_scan(
    scan_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves a specific scan job and its status belonging to the authenticated user or their organization.
    """
    user_id = claims.get("sub")
    return await _ensure_scan_access(scan_id, user_id, db)


@router.get("/{scan_id}/status", response_model=ScanStatusResponseSchema)
async def get_scan_status(
    scan_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the authoritative lifecycle status and progress of a scan.
    """
    user_id = claims.get("sub")
    scan = await _ensure_scan_access(scan_id, user_id, db)
    status_resp = await scan_service.get_scan_status(scan_id, db)
    if not status_resp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan with ID '{scan_id}' not found."
        )
    return status_resp


@router.post("/{scan_id}/cancel", response_model=ScanStatusResponseSchema)
async def cancel_scan(
    scan_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancels an in-flight scan job belonging to the authenticated user or organization.
    """
    user_id = claims.get("sub")
    await _ensure_scan_access(scan_id, user_id, db)
    cancelled = await scan_service.cancel_scan(scan_id, db)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan with ID '{scan_id}' not found or cannot be cancelled."
        )
    return cancelled


@router.get("/{scan_id}/findings", response_model=List[FindingSchema])
async def get_scan_findings(
    scan_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves all findings detected during a specific scan belonging to the authenticated user or organization.
    """
    user_id = claims.get("sub")
    await _ensure_scan_access(scan_id, user_id, db)
    return await finding_service.get_findings_for_scan(scan_id, db)


@router.get("/{scan_id}/observations", response_model=List[BrowserObservationSchema])
async def get_scan_observations(
    scan_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves all browser network observations recorded during a scan belonging to the authenticated user or organization.
    """
    user_id = claims.get("sub")
    await _ensure_scan_access(scan_id, user_id, db)
    res = await db.execute(
        select(BrowserObservationModel)
        .where(BrowserObservationModel.scan_id == scan_id)
        .order_by(BrowserObservationModel.timestamp.asc())
    )
    models = res.scalars().all()
    return [
        BrowserObservationSchema(
            id=m.id,
            scanId=m.scan_id,
            timestamp=m.timestamp.isoformat() + "Z" if m.timestamp else "",
            url=m.url,
            domain=m.domain,
            method=m.method,
            statusCode=m.status_code,
            isFailed=m.is_failed,
            failureReason=m.failure_reason,
            resourceType=m.resource_type,
            classification=m.classification,
            consentState=m.consent_state,
            headersRedacted=m.headers_redacted or {},
            provenance=m.provenance
        )
        for m in models
    ]


@router.get("/{scan_id}/consent-comparison", response_model=ConsentComparisonSummary)
async def get_consent_comparison(
    scan_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Produces structured comparison of network connections observed across consent states.
    """
    user_id = claims.get("sub")
    scan = await _ensure_scan_access(scan_id, user_id, db)

    res = await db.execute(
        select(BrowserObservationModel).where(BrowserObservationModel.scan_id == scan_id)
    )
    models = list(res.scalars().all())
    return observation_service.compare_consent_sessions(scan_id, scan.targetUrl, models)
