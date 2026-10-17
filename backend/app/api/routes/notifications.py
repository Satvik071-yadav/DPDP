from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import ScanJob, FindingModel, AuditRecordModel
from app.schemas.contracts import NotificationItemSchema

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[NotificationItemSchema])
async def get_notifications(db: AsyncSession = Depends(get_db)):
    """
    Returns an aggregated, real-time audit event stream
    derived from persisted scans, findings, and verification audit records.
    """
    items: List[NotificationItemSchema] = []

    # 1. Recent scans
    scans_res = await db.execute(
        select(ScanJob).order_by(desc(ScanJob.initiated_at)).limit(5)
    )
    for s in scans_res.scalars().all():
        ts_str = s.completed_at.isoformat() if s.completed_at else s.initiated_at.isoformat()
        items.append(
            NotificationItemSchema(
                id=f"notif-scan-{s.id}",
                type="scan_completed" if s.status == "completed" else "scan_activity",
                title=f"Scan {s.status.upper()}: {s.target_url}",
                description=f"Status: {s.status} • Risk score: {s.risk_score}/100 • Findings: {s.findings_count.get('total', 0)}",
                timestamp=ts_str,
                severity="critical" if s.findings_count.get("critical", 0) > 0 else ("high" if s.findings_count.get("high", 0) > 0 else "info"),
                link=f"/scan?scanId={s.id}",
                isSynthetic=bool(s.is_demo or "paysecure-india.in" in s.target_url)
            )
        )

    # 2. Critical & High Findings
    findings_res = await db.execute(
        select(FindingModel)
        .where(FindingModel.severity.in_(["critical", "high"]))
        .order_by(desc(FindingModel.detected_at))
        .limit(5)
    )
    for f in findings_res.scalars().all():
        items.append(
            NotificationItemSchema(
                id=f"notif-find-{f.id}",
                type="finding_detected",
                title=f"Exposure Flagged: {f.title}",
                description=f"{f.dpdp_section} on {f.endpoint}",
                timestamp=f.detected_at.isoformat(),
                severity=f.severity,
                link=f"/findings?id={f.id}",
                isSynthetic=bool(f.is_demo)
            )
        )

    # 3. Verified Audit Records
    audits_res = await db.execute(
        select(AuditRecordModel).order_by(desc(AuditRecordModel.timestamp)).limit(5)
    )
    for a in audits_res.scalars().all():
        items.append(
            NotificationItemSchema(
                id=f"notif-audit-{a.id}",
                type="fix_verified",
                title=f"Verification Probe: {a.result}",
                description=f"{a.finding_title} on {a.target_endpoint} (HTTP {a.status_code})",
                timestamp=a.timestamp.isoformat(),
                severity="success" if a.result == "PASS" else "critical",
                link="/fix-verify",
                isSynthetic="testbed" in a.target_endpoint
            )
        )

    # Sort newest first
    items.sort(key=lambda x: x.timestamp, reverse=True)
    return items[:15]
