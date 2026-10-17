from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import FindingModel
from app.schemas.contracts import FindingSchema
from app.services.scan_service import convert_finding_to_schema


class FindingService:
    @staticmethod
    async def list_findings(session: AsyncSession) -> List[FindingSchema]:
        result = await session.execute(
            select(FindingModel).order_by(FindingModel.detected_at.desc())
        )
        findings = result.scalars().all()
        return [convert_finding_to_schema(f) for f in findings]

    @staticmethod
    async def get_finding_by_id(finding_id: str, session: AsyncSession) -> Optional[FindingSchema]:
        result = await session.execute(
            select(FindingModel).where(FindingModel.id == finding_id)
        )
        finding = result.scalar_one_or_none()
        if not finding:
            return None
        return convert_finding_to_schema(finding)

    @staticmethod
    async def get_findings_for_scan(scan_id: str, session: AsyncSession) -> List[FindingSchema]:
        result = await session.execute(
            select(FindingModel).where(FindingModel.scan_id == scan_id)
        )
        findings = result.scalars().all()
        return [convert_finding_to_schema(f) for f in findings]


finding_service = FindingService()
