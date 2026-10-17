from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.auth import get_current_user
from app.core.plans import (
    get_all_plans,
    recommend_plan,
    RecommendationAnswer,
    PlanDefinition
)
from app.services.subscription_service import SubscriptionService
from app.schemas.contracts import (
    PlanDefinitionSchema,
    SubscriptionOverviewResponse,
    ChangePlanRequest,
    PlanRecommendationRequest,
    PlanRecommendationResponse
)

router = APIRouter(tags=["Subscriptions & Plans"])


@router.get("/plans", response_model=List[PlanDefinitionSchema])
async def list_plans():
    """Returns all available subscription plan definitions and limits."""
    plans = get_all_plans()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "tagline": p.tagline,
            "priceInrMonthly": p.price_inr_monthly,
            "priceInrMonth": p.price_inr_monthly,
            "priceInrAnnual": p.price_inr_annual,
            "priceInrAnnualMonthlyEquivalent": p.price_inr_annual_monthly_equivalent,
            "maxWebsites": p.max_websites,
            "scansPerMonth": p.scans_per_month,
            "maxMembers": p.max_members,
            "dataRetentionDays": p.data_retention_days,
            "features": p.features,
            "isPopular": p.is_popular
        }
        for p in plans
    ]


@router.post("/plans/recommend", response_model=PlanRecommendationResponse)
async def get_plan_recommendation(payload: PlanRecommendationRequest):
    """
    Evaluates questionnaire answers to recommend a subscription tier based on
    domain scale, audit frequency, team size, and tracking complexity.
    """
    if payload.answers:
        raw_input = payload.answers
    else:
        raw_input = {
            "website_type": payload.websiteType,
            "domains": payload.domainCount,
            "scan_frequency": payload.scanFrequency,
            "team_size": payload.teamMembers,
            "has_trackers": payload.hasTrackers,
            "has_payments": payload.hasPayments,
            "has_login": payload.hasLogin
        }

    result = recommend_plan(raw_input)
    p = result.plan
    plan_schema = {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "tagline": p.tagline,
        "priceInrMonthly": p.price_inr_monthly,
        "priceInrMonth": p.price_inr_monthly,
        "priceInrAnnual": p.price_inr_annual,
        "priceInrAnnualMonthlyEquivalent": p.price_inr_annual_monthly_equivalent,
        "maxWebsites": p.max_websites,
        "scansPerMonth": p.scans_per_month,
        "maxMembers": p.max_members,
        "dataRetentionDays": p.data_retention_days,
        "features": p.features,
        "isPopular": p.is_popular
    }

    return {
        "recommendedPlanId": result.recommended_plan_id,
        "recommendedPlan": result.recommended_plan_id,
        "recommendedPlanName": p.name,
        "plan": plan_schema,
        "reasoning": result.reasoning,
        "summary": result.summary,
        "decisionFactors": result.decision_factors,
        "suggestedAlternativeId": result.suggested_alternative_id,
        "answersGiven": payload.answers or raw_input
    }


@router.get("/organizations/{org_id}/subscription", response_model=SubscriptionOverviewResponse)
async def get_organization_subscription(
    org_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Provides subscription status, current plan limits, and active quota usage for the organization."""
    user_id = claims.get("sub")
    return await SubscriptionService.get_subscription_overview(org_id, user_id, db)


@router.post("/organizations/{org_id}/subscription/change-plan", response_model=SubscriptionOverviewResponse)
async def change_organization_plan(
    org_id: str,
    payload: ChangePlanRequest,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Transitions organization subscription to a new plan with transactional limit verification."""
    user_id = claims.get("sub")
    return await SubscriptionService.change_plan(org_id, user_id, payload.planId, db)
