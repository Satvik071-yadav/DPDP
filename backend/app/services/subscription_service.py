import datetime
import logging
from typing import Dict, Any, Tuple, Optional
from urllib.parse import urlparse
from fastapi import HTTPException, status
from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("dpdp_guard.subscription_service")

from app.models.entities import (
    SubscriptionModel,
    ScanUsageModel,
    WebsiteModel,
    OrganizationMemberModel,
    ScanJob
)
from app.core.plans import get_plan, SUBSCRIPTION_PLANS, PlanDefinition
from app.services.organization_service import OrganizationService
from app.services.domain_verification_service import normalize_hostname


def get_now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class SubscriptionService:

    @staticmethod
    async def get_or_create_subscription(
        org_id: str,
        session: AsyncSession
    ) -> SubscriptionModel:
        """Retrieves active subscription or creates default Starter tier."""
        res = await session.execute(
            select(SubscriptionModel).where(SubscriptionModel.organization_id == org_id)
        )
        sub = res.scalars().first()
        if not sub:
            now = get_now_utc()
            period_end = now + datetime.timedelta(days=30)
            sub = SubscriptionModel(
                id=f"sub_{org_id.replace('org_', '')}",
                organization_id=org_id,
                plan_id="starter",
                status="active",
                billing_period_start=now,
                billing_period_end=period_end
            )
            session.add(sub)
            await session.commit()
            await session.refresh(sub)
        return sub

    @staticmethod
    async def get_or_create_current_usage(
        org_id: str,
        sub: SubscriptionModel,
        session: AsyncSession
    ) -> ScanUsageModel:
        """Retrieves or creates usage record matching current billing period."""
        now = get_now_utc()
        period_start = sub.billing_period_start
        period_end = sub.billing_period_end
        if period_start.tzinfo is None:
            period_start = period_start.replace(tzinfo=datetime.timezone.utc)
        if period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=datetime.timezone.utc)

        # Roll over billing period if expired
        if now > period_end:
            period_start = now
            period_end = now + datetime.timedelta(days=30)
            sub.billing_period_start = period_start
            sub.billing_period_end = period_end
            await session.commit()
            await session.refresh(sub)

        res = await session.execute(
            select(ScanUsageModel).where(
                and_(
                    ScanUsageModel.organization_id == org_id,
                    ScanUsageModel.billing_period_start == sub.billing_period_start
                )
            )
        )
        usage = res.scalars().first()
        if not usage:
            usage = ScanUsageModel(
                id=f"usg_{org_id.replace('org_', '')}_{int(period_start.timestamp())}",
                organization_id=org_id,
                billing_period_start=sub.billing_period_start,
                billing_period_end=sub.billing_period_end,
                scans_used=0
            )
            session.add(usage)
            await session.commit()
            await session.refresh(usage)

        return usage

    @staticmethod
    async def get_subscription_overview(
        org_id: str,
        user_id: str,
        session: AsyncSession
    ) -> Dict[str, Any]:
        """Provides full subscription status, plan limits, and current utilization."""
        await OrganizationService.require_membership(org_id, user_id, session)

        sub = await SubscriptionService.get_or_create_subscription(org_id, session)
        usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)
        plan = get_plan(sub.plan_id)

        # Count active websites
        total_websites = await session.scalar(
            select(func.count(WebsiteModel.id)).where(WebsiteModel.organization_id == org_id)
        ) or 0

        verified_websites = await session.scalar(
            select(func.count(WebsiteModel.id)).where(
                and_(
                    WebsiteModel.organization_id == org_id,
                    WebsiteModel.verification_status == "verified"
                )
            )
        ) or 0

        # Count organization members
        member_count = await session.scalar(
            select(func.count(OrganizationMemberModel.id)).where(OrganizationMemberModel.organization_id == org_id)
        ) or 0

        scans_used = usage.scans_used or 0
        scans_remaining = max(0, plan.scans_per_month - scans_used)

        return {
            "organizationId": org_id,
            "planId": plan.id,
            "planName": plan.name,
            "description": plan.description,
            "priceInrMonthly": plan.price_inr_monthly,
            "status": sub.status,
            "billingPeriodStart": sub.billing_period_start.isoformat(),
            "billingPeriodEnd": sub.billing_period_end.isoformat(),
            "limits": {
                "maxWebsites": plan.max_websites,
                "scansPerMonth": plan.scans_per_month,
                "maxMembers": plan.max_members,
            },
            "usage": {
                "totalWebsites": total_websites,
                "verifiedWebsites": verified_websites,
                "websiteQuotaUsedPercent": min(100, int((verified_websites / plan.max_websites) * 100)),
                "scansUsed": scans_used,
                "scansRemaining": scans_remaining,
                "scanQuotaUsedPercent": min(100, int((scans_used / plan.scans_per_month) * 100)),
                "memberCount": member_count,
                "memberQuotaUsedPercent": min(100, int((member_count / plan.max_members) * 100))
            },
            "features": plan.features,
            "plan": {
                "id": plan.id,
                "name": plan.name,
                "description": plan.description,
                "tagline": plan.tagline,
                "priceInrMonthly": plan.price_inr_monthly,
                "priceInrMonth": plan.price_inr_monthly,
                "priceInrAnnual": plan.price_inr_annual,
                "priceInrAnnualMonthlyEquivalent": plan.price_inr_annual_monthly_equivalent,
                "maxWebsites": plan.max_websites,
                "scansPerMonth": plan.scans_per_month,
                "maxMembers": plan.max_members,
                "dataRetentionDays": plan.data_retention_days,
                "features": plan.features,
                "isPopular": plan.is_popular
            },
            "websitesCount": total_websites,
            "websitesLimit": plan.max_websites,
            "scansUsed": scans_used,
            "scansLimit": plan.scans_per_month,
            "scansRemaining": scans_remaining,
            "membersCount": member_count,
            "membersLimit": plan.max_members,
            "dataRetentionDays": plan.data_retention_days
        }


    @staticmethod
    async def validate_scan_entitlement(
        org_id: str,
        user_id: str,
        target_url: str,
        session: AsyncSession
    ) -> Tuple[bool, Optional[str], Optional[WebsiteModel], bool]:
        """
        Enforces scan entitlement before launching a scan job:
        1. Confirms authenticated user belongs to org_id.
        2. Distinguishes controlled sandbox testbed vs live external scanning.
        3. For external targets: requires registered, ownership-verified website in this org.
        4. Validates active subscription status.
        5. Validates monthly scan quota is not exceeded.
        Returns: (is_authorized, denial_reason, website_model, is_live_scan)
        """
        await OrganizationService.require_membership(org_id, user_id, session)

        sub = await SubscriptionService.get_or_create_subscription(org_id, session)
        if sub.status not in ("active", "trialing"):
            return False, f"Scan blocked: Organization subscription is {sub.status}. Please renew your plan.", None, False

        usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)
        plan = get_plan(sub.plan_id)

        if (usage.scans_used or 0) >= plan.scans_per_month:
            return (
                False,
                f"Monthly scan quota reached ({usage.scans_used}/{plan.scans_per_month} scans used). "
                f"Upgrade to a higher plan in Subscription Settings to run additional compliance audits.",
                None,
                False
            )

        # Check if controlled demo target
        parsed = urlparse(target_url if target_url.startswith("http") else f"https://{target_url}")
        host = (parsed.hostname or "").lower()

        demo_hosts = {"paysecure-india.in", "apollo-telemed.co.in", "retail-bharat.store", "demo.dpdpguard.in", "localhost", "127.0.0.1"}
        if host in demo_hosts or "/testbed" in target_url:
            # Controlled demo targets are permitted without customer ownership verification
            return True, None, None, False

        # Live external domain requires verified website ownership
        res = await session.execute(
            select(WebsiteModel).where(
                and_(
                    WebsiteModel.organization_id == org_id,
                    WebsiteModel.hostname == host
                )
            )
        )
        website = res.scalars().first()

        if not website:
            return (
                False,
                f"Target domain '{host}' is not in authorized demo scope and is not registered under your organization. "
                f"Add and verify domain ownership in Domain Management before running compliance audits.",
                None,
                False
            )


        if website.verification_status != "verified":
            return (
                False,
                f"Domain '{host}' ownership is unverified (status: {website.verification_status}). "
                f"In compliance with DPDP audit safeguards, complete DNS TXT or HTTP ownership verification before scanning.",
                website,
                False
            )

        if not website.is_active:
            return False, f"Domain '{host}' is currently deactivated in your organization.", website, False

        return True, None, website, True

    @staticmethod
    async def reserve_scan_quota(
        org_id: str,
        session: AsyncSession
    ) -> Tuple[bool, Optional[str]]:
        """
        Atomically reserves 1 scan credit against the organization's monthly quota.
        Uses a conditional UPDATE query compatible with SQLite and PostgreSQL:
        UPDATE scan_usage SET scans_used = scans_used + 1 WHERE id = :usage_id AND scans_used < :limit
        Returns (success: bool, error_message: Optional[str]).
        """
        if not org_id or org_id == "org_default":
            return True, None

        sub = await SubscriptionService.get_or_create_subscription(org_id, session)
        if sub.status not in ("active", "trialing"):
            return False, f"Scan blocked: Organization subscription is {sub.status}. Please renew your plan."

        usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)
        plan = get_plan(sub.plan_id)

        now = get_now_utc()
        stmt = (
            update(ScanUsageModel)
            .where(
                and_(
                    ScanUsageModel.id == usage.id,
                    ScanUsageModel.scans_used < plan.scans_per_month
                )
            )
            .values(
                scans_used=ScanUsageModel.scans_used + 1,
                updated_at=now
            )
        )
        res = await session.execute(stmt)
        await session.commit()
        if res.rowcount == 0:
            return (
                False,
                f"Monthly scan quota reached ({usage.scans_used}/{plan.scans_per_month} scans used). "
                f"Upgrade to a higher plan in Subscription Settings to run additional compliance audits."
            )
        await session.refresh(usage)
        return True, None

    @staticmethod
    async def release_scan_quota(
        org_id: str,
        session: AsyncSession
    ) -> None:
        """
        Rolls back 1 reserved scan credit if a scan job fails, errors, or is cancelled before completion.
        Uses a conditional UPDATE to ensure scans_used never drops below 0:
        UPDATE scan_usage SET scans_used = scans_used - 1 WHERE id = :usage_id AND scans_used > 0
        """
        if not org_id or org_id == "org_default":
            return

        try:
            sub = await SubscriptionService.get_or_create_subscription(org_id, session)
            usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)

            now = get_now_utc()
            stmt = (
                update(ScanUsageModel)
                .where(
                    and_(
                        ScanUsageModel.id == usage.id,
                        ScanUsageModel.scans_used > 0
                    )
                )
                .values(
                    scans_used=ScanUsageModel.scans_used - 1,
                    updated_at=now
                )
            )
            await session.execute(stmt)
            await session.commit()
            await session.refresh(usage)
        except Exception as e:
            logger.warning(f"Failed to release scan quota for org {org_id}: {e}")

    @staticmethod
    async def record_scan_consumed(
        org_id: str,
        website_id: Optional[str],
        session: AsyncSession
    ) -> int:
        """
        Finalizes scan consumption upon completion.
        Updates website.last_scanned_at. Quota was already reserved atomically at scan initiation.
        """
        if website_id:
            w_res = await session.execute(select(WebsiteModel).where(WebsiteModel.id == website_id))
            w = w_res.scalars().first()
            if w:
                w.last_scanned_at = get_now_utc()
                await session.commit()

        if org_id and org_id != "org_default":
            sub = await SubscriptionService.get_or_create_subscription(org_id, session)
            usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)
            return usage.scans_used or 0
        return 0

    @staticmethod
    async def change_plan(
        org_id: str,
        user_id: str,
        new_plan_id: str,
        session: AsyncSession
    ) -> Dict[str, Any]:
        """Upgrades or downgrades plan with transactional entitlement validation."""
        await OrganizationService.require_membership(org_id, user_id, session, ["owner", "admin"])

        if new_plan_id not in SUBSCRIPTION_PLANS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid plan ID '{new_plan_id}'. Available plans: {', '.join(SUBSCRIPTION_PLANS.keys())}"
            )

        new_plan = SUBSCRIPTION_PLANS[new_plan_id]

        # Verify downgrade constraints
        registered_websites = await session.scalar(
            select(func.count(WebsiteModel.id)).where(
                and_(WebsiteModel.organization_id == org_id, WebsiteModel.is_active == True)
            )
        ) or 0

        if registered_websites > new_plan.max_websites:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot downgrade to {new_plan.name}: You have {registered_websites} registered website(s), "
                    f"but {new_plan.name} allows a maximum of {new_plan.max_websites}. "
                    f"Please remove {registered_websites - new_plan.max_websites} website(s) in Domain Management first."
                )
            )

        member_count = await session.scalar(
            select(func.count(OrganizationMemberModel.id)).where(OrganizationMemberModel.organization_id == org_id)
        ) or 0

        if member_count > new_plan.max_members:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot downgrade to {new_plan.name}: You have {member_count} team members, "
                    f"but {new_plan.name} allows a maximum of {new_plan.max_members}. "
                    f"Please remove {member_count - new_plan.max_members} member(s) first."
                )
            )

        sub = await SubscriptionService.get_or_create_subscription(org_id, session)
        sub.plan_id = new_plan_id
        sub.status = "active"
        sub.updated_at = get_now_utc()
        await session.commit()
        await session.refresh(sub)
        return await SubscriptionService.get_subscription_overview(org_id, user_id, session)


subscription_service = SubscriptionService()
