from typing import List, Optional
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import FindingModel, ScanJob, OrganizationMemberModel
from app.schemas.contracts import FindingSchema
from app.services.scan_service import convert_finding_to_schema


class FindingService:
    @staticmethod
    async def list_findings(
        session: AsyncSession,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None
    ) -> List[FindingSchema]:
        query = select(FindingModel).join(ScanJob, FindingModel.scan_id == ScanJob.id)
        if organization_id:
            query = query.where(ScanJob.organization_id == organization_id)
        elif user_id:
            user_orgs = await session.execute(
                select(OrganizationMemberModel.organization_id).where(OrganizationMemberModel.user_id == user_id)
            )
            org_ids = [row[0] for row in user_orgs.fetchall()]
            conditions = [ScanJob.user_id == user_id]
            if org_ids:
                conditions.append(ScanJob.organization_id.in_(org_ids))
            query = query.where(or_(*conditions))
        query = query.order_by(FindingModel.detected_at.desc())
        result = await session.execute(query)
        findings = result.scalars().all()
        return [convert_finding_to_schema(f) for f in findings]

    @staticmethod
    async def get_finding_by_id(
        finding_id: str,
        session: AsyncSession,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None
    ) -> Optional[FindingSchema]:
        query = select(FindingModel).join(ScanJob, FindingModel.scan_id == ScanJob.id).where(FindingModel.id == finding_id)
        if organization_id:
            query = query.where(ScanJob.organization_id == organization_id)
        elif user_id:
            user_orgs = await session.execute(
                select(OrganizationMemberModel.organization_id).where(OrganizationMemberModel.user_id == user_id)
            )
            org_ids = [row[0] for row in user_orgs.fetchall()]
            conditions = [ScanJob.user_id == user_id]
            if org_ids:
                conditions.append(ScanJob.organization_id.in_(org_ids))
            query = query.where(or_(*conditions))
        result = await session.execute(query)
        finding = result.scalar_one_or_none()
        if not finding:
            return None
        return convert_finding_to_schema(finding)

    @staticmethod
    async def get_findings_for_scan(
        scan_id: str,
        session: AsyncSession,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None
    ) -> List[FindingSchema]:
        query = select(FindingModel).join(ScanJob, FindingModel.scan_id == ScanJob.id).where(FindingModel.scan_id == scan_id)
        if organization_id:
            query = query.where(ScanJob.organization_id == organization_id)
        elif user_id:
            user_orgs = await session.execute(
                select(OrganizationMemberModel.organization_id).where(OrganizationMemberModel.user_id == user_id)
            )
            org_ids = [row[0] for row in user_orgs.fetchall()]
            conditions = [ScanJob.user_id == user_id]
            if org_ids:
                conditions.append(ScanJob.organization_id.in_(org_ids))
            query = query.where(or_(*conditions))
        result = await session.execute(query)
        findings = result.scalars().all()
        return [convert_finding_to_schema(f) for f in findings]


finding_service = FindingService()

