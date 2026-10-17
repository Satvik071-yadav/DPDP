import re
import uuid
import datetime
import secrets
from typing import List, Optional, Tuple, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    OrganizationModel,
    OrganizationMemberModel,
    UserModel,
    SubscriptionModel,
    ScanUsageModel,
    WebsiteModel
)
from app.core.plans import get_plan


def get_now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text).strip().lower()
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug or "org"


class OrganizationService:

    @staticmethod
    async def create_organization(
        name: str,
        user_id: str,
        session: AsyncSession
    ) -> Tuple[OrganizationModel, OrganizationMemberModel, SubscriptionModel]:
        """Creates a new organization, binds user as owner, and provisions Starter subscription."""
        clean_name = name.strip()
        if len(clean_name) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Organization name must be at least 2 characters long."
            )

        base_slug = slugify(clean_name)
        slug = f"{base_slug}-{secrets.token_hex(3)}"
        org_id = f"org_{secrets.token_hex(6)}"

        org = OrganizationModel(
            id=org_id,
            name=clean_name,
            slug=slug
        )
        session.add(org)

        # Add user as owner
        member_id = f"mem_{secrets.token_hex(6)}"
        member = OrganizationMemberModel(
            id=member_id,
            organization_id=org_id,
            user_id=user_id,
            role="owner"
        )
        session.add(member)

        # Initialize starter subscription (1-month billing cycle)
        now = get_now_utc()
        period_end = now + datetime.timedelta(days=30)
        sub_id = f"sub_{secrets.token_hex(6)}"
        sub = SubscriptionModel(
            id=sub_id,
            organization_id=org_id,
            plan_id="starter",
            status="active",
            billing_period_start=now,
            billing_period_end=period_end
        )
        session.add(sub)

        # Initialize scan usage counter
        usage_id = f"usg_{secrets.token_hex(6)}"
        usage = ScanUsageModel(
            id=usage_id,
            organization_id=org_id,
            billing_period_start=now,
            billing_period_end=period_end,
            scans_used=0
        )
        session.add(usage)

        await session.commit()
        await session.refresh(org)
        await session.refresh(member)
        await session.refresh(sub)

        return org, member, sub

    @staticmethod
    async def get_user_organizations(
        user_id: str,
        session: AsyncSession
    ) -> List[Dict[str, Any]]:
        """Returns all organizations where the user has active membership."""
        query = (
            select(OrganizationModel, OrganizationMemberModel.role)
            .join(OrganizationMemberModel, OrganizationModel.id == OrganizationMemberModel.organization_id)
            .where(OrganizationMemberModel.user_id == user_id)
            .order_by(OrganizationModel.created_at.desc())
        )
        res = await session.execute(query)
        results: List[Dict[str, Any]] = []

        for org, role in res.all():
            # Get subscription info
            sub_res = await session.execute(
                select(SubscriptionModel).where(SubscriptionModel.organization_id == org.id)
            )
            sub = sub_res.scalars().first()
            plan = get_plan(sub.plan_id if sub else "starter")

            # Get website count
            web_cnt = await session.scalar(
                select(func.count(WebsiteModel.id)).where(WebsiteModel.organization_id == org.id)
            )

            # Get member count
            mem_cnt = await session.scalar(
                select(func.count(OrganizationMemberModel.id)).where(OrganizationMemberModel.organization_id == org.id)
            )

            results.append({
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "role": role,
                "planId": sub.plan_id if sub else "starter",
                "planName": plan.name,
                "subscriptionStatus": sub.status if sub else "active",
                "websiteCount": web_cnt or 0,
                "memberCount": mem_cnt or 0,
                "createdAt": org.created_at.isoformat() if org.created_at else get_now_utc().isoformat()
            })

        return results

    @staticmethod
    async def get_or_create_primary_organization(
        user_id: str,
        session: AsyncSession
    ) -> Tuple[OrganizationModel, str]:
        """Ensures the authenticated user has at least one active organization."""
        # Check existing membership
        query = (
            select(OrganizationModel, OrganizationMemberModel.role)
            .join(OrganizationMemberModel, OrganizationModel.id == OrganizationMemberModel.organization_id)
            .where(OrganizationMemberModel.user_id == user_id)
            .order_by(OrganizationModel.created_at.asc())
        )
        res = await session.execute(query)
        first = res.first()
        if first:
            return first[0], first[1]

        # Fetch user name for personal organization
        user_res = await session.execute(select(UserModel).where(UserModel.id == user_id))
        user = user_res.scalars().first()
        org_name = f"{user.full_name}'s Organization" if user else "Compliance Workspace"

        org, mem, _ = await OrganizationService.create_organization(org_name, user_id, session)
        return org, mem.role

    @staticmethod
    async def get_user_role_in_org(
        org_id: str,
        user_id: str,
        session: AsyncSession
    ) -> Optional[str]:
        """Returns the user's role in the organization, or None if not a member."""
        res = await session.execute(
            select(OrganizationMemberModel.role).where(
                and_(
                    OrganizationMemberModel.organization_id == org_id,
                    OrganizationMemberModel.user_id == user_id
                )
            )
        )
        return res.scalar_one_or_none()

    @staticmethod
    async def require_membership(
        org_id: str,
        user_id: str,
        session: AsyncSession,
        required_roles: Optional[List[str]] = None
    ) -> str:
        """Enforces that the user belongs to the organization with sufficient privileges."""
        role = await OrganizationService.get_user_role_in_org(org_id, user_id, session)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not a member of this organization."
            )
        if required_roles and role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Action requires role in {required_roles} (current role: {role})."
            )
        return role

    @staticmethod
    async def list_members(
        org_id: str,
        user_id: str,
        session: AsyncSession
    ) -> List[Dict[str, Any]]:
        """Lists all members of an organization."""
        await OrganizationService.require_membership(org_id, user_id, session)
        query = (
            select(OrganizationMemberModel, UserModel)
            .join(UserModel, OrganizationMemberModel.user_id == UserModel.id)
            .where(OrganizationMemberModel.organization_id == org_id)
        )
        res = await session.execute(query)
        members = []
        for mem, u in res.all():
            members.append({
                "id": mem.id,
                "userId": u.id,
                "username": u.username,
                "email": u.email,
                "fullName": u.full_name,
                "role": mem.role,
                "joinedAt": mem.created_at.isoformat() if mem.created_at else get_now_utc().isoformat()
            })
        return members

    @staticmethod
    async def add_member_by_email(
        org_id: str,
        inviter_user_id: str,
        target_email: str,
        role: str,
        session: AsyncSession
    ) -> Dict[str, Any]:
        """Adds a registered user to the organization after checking subscription member quota."""
        await OrganizationService.require_membership(org_id, inviter_user_id, session, ["owner", "admin"])

        clean_email = target_email.strip().lower()

        # Check subscription limit for members
        sub_res = await session.execute(
            select(SubscriptionModel).where(SubscriptionModel.organization_id == org_id)
        )
        sub = sub_res.scalars().first()
        plan = get_plan(sub.plan_id if sub else "starter")

        cur_members = await session.scalar(
            select(func.count(OrganizationMemberModel.id)).where(OrganizationMemberModel.organization_id == org_id)
        )
        if cur_members >= plan.max_members:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Member limit reached ({cur_members}/{plan.max_members}). Upgrade to a higher plan to add more team members."
            )

        # Lookup user by email
        u_res = await session.execute(select(UserModel).where(UserModel.email == clean_email))
        target_user = u_res.scalars().first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No registered user found with email '{clean_email}'. User must create an account first."
            )

        # Check existing membership
        existing = await session.execute(
            select(OrganizationMemberModel).where(
                and_(
                    OrganizationMemberModel.organization_id == org_id,
                    OrganizationMemberModel.user_id == target_user.id
                )
            )
        )
        if existing.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User '{clean_email}' is already a member of this organization."
            )

        assigned_role = role if role in ("owner", "admin", "auditor", "member") else "auditor"
        new_mem = OrganizationMemberModel(
            id=f"mem_{secrets.token_hex(6)}",
            organization_id=org_id,
            user_id=target_user.id,
            role=assigned_role
        )
        session.add(new_mem)
        await session.commit()
        await session.refresh(new_mem)

        return {
            "id": new_mem.id,
            "userId": target_user.id,
            "username": target_user.username,
            "email": target_user.email,
            "fullName": target_user.full_name,
            "role": new_mem.role,
            "joinedAt": new_mem.created_at.isoformat() if new_mem.created_at else get_now_utc().isoformat()
        }


organization_service = OrganizationService()
