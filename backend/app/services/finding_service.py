from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import FindingModel, ScanJob
from app.schemas.contracts import FindingSchema
from app.services.scan_service import convert_finding_to_schema


class FindingService:
    @staticmethod
    async def list_findings(session: AsyncSession, user_id: Optional[str] = None) -> List[FindingSchema]:
        query = select(FindingModel)
        if user_id:
            query = query.join(ScanJob, FindingModel.scan_id == ScanJob.id).where(ScanJob.user_id == user_id)
        query = query.order_by(FindingModel.detected_at.desc())
        result = await session.execute(query)
        findings = result.scalars().all()
        return [convert_finding_to_schema(f) for f in findings]

    @staticmethod
    async def get_finding_by_id(
        finding_id: str,
        session: AsyncSession,
        user_id: Optional[str] = None
    ) -> Optional[FindingSchema]:
        query = select(FindingModel).where(FindingModel.id == finding_id)
        if user_id:
            query = query.join(ScanJob, FindingModel.scan_id == ScanJob.id).where(ScanJob.user_id == user_id)
        result = await session.execute(query)
        finding = result.scalar_one_or_none()
        if not finding:
            return None
        return convert_finding_to_schema(finding)

    @staticmethod
    async def get_findings_for_scan(
        scan_id: str,
        session: AsyncSession,
        user_id: Optional[str] = None
    ) -> List[FindingSchema]:
        query = select(FindingModel).where(FindingModel.scan_id == scan_id)
        if user_id:
            query = query.join(ScanJob, FindingModel.scan_id == ScanJob.id).where(ScanJob.user_id == user_id)
        result = await session.execute(query)
        findings = result.scalars().all()
        return [convert_finding_to_schema(f) for f in findings]


finding_service = FindingService()

