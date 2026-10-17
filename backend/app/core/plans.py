from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class PlanDefinition(BaseModel):
    id: str
    name: str
    description: str
    tagline: str = ""
    price_inr_monthly: int
    price_inr_annual: int = 0
    price_inr_annual_monthly_equivalent: int = 0
    max_websites: int
    scans_per_month: int
    max_members: int
    data_retention_days: int = 30
    features: List[str]
    is_popular: bool = False

    @property
    def price_inr_month(self) -> int:
        return self.price_inr_monthly


# Centralized, configurable subscription plans
SUBSCRIPTION_PLANS: Dict[str, PlanDefinition] = {
    "starter": PlanDefinition(
        id="starter",
        name="Starter",
        description="For single-domain compliance audits and small business compliance readiness.",
        tagline="For single-domain compliance audits and small business compliance readiness.",
        price_inr_monthly=4999,
        price_inr_annual=47990,
        price_inr_annual_monthly_equivalent=3999,
        max_websites=1,
        scans_per_month=10,
        max_members=1,
        data_retention_days=30,
        features=[
            "1 Verified Business Domain",
            "10 Automated Compliance Scans / month",
            "Basic Privacy & Consent Findings",
            "Executive PDF Compliance Reports",
            "Single Auditor Account"
        ],
        is_popular=False
    ),
    "growth": PlanDefinition(
        id="growth",
        name="Growth",
        description="For scaling companies with multiple digital properties and active tag audit workflows.",
        tagline="For scaling companies with multiple digital properties and active tag audit workflows.",
        price_inr_monthly=14999,
        price_inr_annual=143990,
        price_inr_annual_monthly_equivalent=11999,
        max_websites=5,
        scans_per_month=100,
        max_members=5,
        data_retention_days=90,
        features=[
            "Up to 5 Verified Business Domains",
            "100 Automated Compliance Scans / month",
            "Full Forensic Evidence & Tracker Graphs",
            "Automated Fix & Verify Verification Sandbox",
            "Up to 5 Team Members (DPO & Auditors)",
            "Priority Audit Logging & Export"
        ],
        is_popular=True
    ),
    "business": PlanDefinition(
        id="business",
        name="Business",
        description="For enterprises, digital agencies, and regulated fiduciaries with deep audit requirements.",
        tagline="For enterprises, digital agencies, and regulated fiduciaries with deep audit requirements.",
        price_inr_monthly=39999,
        price_inr_annual=383990,
        price_inr_annual_monthly_equivalent=31999,
        max_websites=25,
        scans_per_month=500,
        max_members=20,
        data_retention_days=365,
        features=[
            "Up to 25 Verified Business Domains",
            "500 Automated Compliance Scans / month",
            "Continuous Audit Scheduling & Webhooks",
            "Multi-member Collaborative Compliance Workspaces",
            "Up to 20 Team Members with Role-Based Access Control",
            "Custom SLA & Dedicated Compliance Onboarding"
        ],
        is_popular=False
    )
}


def get_plan(plan_id: str) -> PlanDefinition:
    return SUBSCRIPTION_PLANS.get(plan_id, SUBSCRIPTION_PLANS["starter"])


def get_all_plans() -> List[PlanDefinition]:
    return list(SUBSCRIPTION_PLANS.values())


ALL_PLANS: List[PlanDefinition] = list(SUBSCRIPTION_PLANS.values())



class RecommendationAnswer(BaseModel):
    website_type: str = "saas"  # informational, ecommerce, healthcare, fintech, saas, other
    domain_count: int = 1
    scan_frequency: str = "monthly"  # monthly, weekly, daily
    team_members: int = 1
    has_trackers: bool = False
    has_payments: bool = False
    has_login: bool = False


class RecommendationResult(BaseModel):
    recommended_plan: str
    recommended_plan_id: str
    plan: PlanDefinition
    reasoning: List[str]
    summary: str
    decision_factors: List[str]
    suggested_alternative_id: Optional[str] = None


def recommend_plan(answers: Any) -> RecommendationResult:
    """
    Transparent, deterministic rule-based recommendation engine based on operational requirements.
    Never infers legal liability or coerces unnecessary upgrades.
    """
    factors: List[str] = []
    recommended_id = "starter"

    if isinstance(answers, dict):
        d_count = int(answers.get("domains") or answers.get("domain_count") or answers.get("domainCount") or 1)
        scans_count = int(answers.get("scans") or answers.get("scans_needed") or 10)
        team_size = int(answers.get("team_size") or answers.get("team_members") or answers.get("teamMembers") or 1)
        retention = int(answers.get("retention") or answers.get("retention_days") or 30)
        sensitivity = str(answers.get("data_sensitivity") or answers.get("dataSensitivity") or answers.get("website_type") or "saas")

        freq = "daily" if scans_count >= 100 else ("weekly" if scans_count >= 20 else "monthly")
        ans = RecommendationAnswer(
            website_type="fintech" if "fiduciary" in sensitivity else "saas",
            domain_count=d_count,
            scan_frequency=freq,
            team_members=team_size,
            has_trackers=scans_count > 10,
            has_payments="fiduciary" in sensitivity,
            has_login=True
        )
    else:
        ans = answers
        retention = 30
        sensitivity = ans.website_type

    # Factor 1: Domain scale
    if ans.domain_count > 5:
        recommended_id = "business"
        factors.append(f"Managing {ans.domain_count} domains exceeds Growth tier's 5-website ceiling.")
    elif ans.domain_count > 1:
        recommended_id = "growth"
        factors.append(f"Managing {ans.domain_count} domains requires multi-domain tracking (Growth allows 5 websites).")
    else:
        factors.append("Single website matches Starter tier's 1-domain limit.")

    # Factor 2: Team collaboration scale
    if ans.team_members > 5:
        recommended_id = "business"
        factors.append(f"Team size of {ans.team_members} members requires Business tier (supports up to 20 members).")
    elif ans.team_members > 1 and recommended_id == "starter":
        recommended_id = "growth"
        factors.append(f"Team size of {ans.team_members} members benefits from multi-user collaboration in Growth.")

    # Factor 3: Scan frequency and complexity
    monthly_scans_needed = ans.domain_count * (
        30 if ans.scan_frequency == "daily" else (4 if ans.scan_frequency == "weekly" else 1)
    )
    if monthly_scans_needed > 100:
        recommended_id = "business"
        factors.append(f"Expected scan volume (~{monthly_scans_needed}/month) exceeds Growth tier's 100 scans.")
    elif monthly_scans_needed > 10 and recommended_id == "starter":
        recommended_id = "growth"
        factors.append(f"Expected scan volume (~{monthly_scans_needed}/month) exceeds Starter tier's 10 scans.")

    # Factor 4: High regulatory complexity / Significant Data Fiduciary
    if "significant_data_fiduciary" in sensitivity or retention >= 365:
        recommended_id = "business"
        factors.append("Significant Data Fiduciary obligations & 1-year retention mandate Business tier.")
    elif "children" in sensitivity:
        if recommended_id == "starter":
            recommended_id = "growth"
            factors.append("Processing Children's personal data requires enhanced continuous consent verification.")

    plan = get_plan(recommended_id)

    # Determine alternative suggestion
    alt_id = None
    if recommended_id == "starter":
        alt_id = "growth"
    elif recommended_id == "growth":
        alt_id = "business" if monthly_scans_needed > 50 or ans.domain_count >= 4 else "starter"
    elif recommended_id == "business":
        alt_id = "growth"

    summary = (
        f"Based on your requirements for {ans.domain_count} domain(s), {ans.team_members} team member(s), "
        f"and {ans.scan_frequency} audit workflows, the {plan.name} plan is the optimal statutory fit."
    )

    return RecommendationResult(
        recommended_plan=recommended_id,
        recommended_plan_id=recommended_id,
        plan=plan,
        reasoning=factors,
        summary=summary,
        decision_factors=factors,
        suggested_alternative_id=alt_id
    )
