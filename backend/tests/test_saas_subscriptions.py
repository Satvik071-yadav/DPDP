import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import engine, Base, AsyncSessionLocal
from app.db.init_db import init_db
from app.core.plans import recommend_plan, get_plan, ALL_PLANS

@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_db()
    yield

def test_plan_definitions():
    assert len(ALL_PLANS) == 3
    starter = get_plan("starter")
    growth = get_plan("growth")
    business = get_plan("business")

    assert starter.max_websites == 1
    assert starter.scans_per_month == 10
    assert starter.price_inr_month == 4999
    assert starter.price_inr_annual == 47990
    assert starter.data_retention_days == 30

    assert growth.max_websites == 5
    assert growth.scans_per_month == 100
    assert growth.price_inr_month == 14999
    assert growth.price_inr_annual == 143990
    assert growth.data_retention_days == 90

    assert business.max_websites == 25
    assert business.scans_per_month == 500
    assert business.price_inr_month == 39999
    assert business.price_inr_annual == 383990
    assert business.data_retention_days == 365

@pytest.mark.asyncio
async def test_list_plans_api_serialization():
    """Verifies GET /api/v1/plans serializes all pricing and limit fields correctly."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/plans")
        assert res.status_code == 200
        plans = res.json()
        assert len(plans) == 3

        plan_dict = {p["id"]: p for p in plans}
        for pid in ("starter", "growth", "business"):
            assert pid in plan_dict
            p = plan_dict[pid]
            # Ensure every field consumed by frontend exists and is non-null
            assert "priceInrMonthly" in p and p["priceInrMonthly"] > 0
            assert "priceInrMonth" in p and p["priceInrMonth"] > 0
            assert "priceInrAnnual" in p and p["priceInrAnnual"] > 0
            assert "priceInrAnnualMonthlyEquivalent" in p and p["priceInrAnnualMonthlyEquivalent"] > 0
            assert "tagline" in p and len(p["tagline"]) > 0
            assert "dataRetentionDays" in p and p["dataRetentionDays"] in (30, 90, 365)
            assert "maxWebsites" in p and p["maxWebsites"] >= 1
            assert "scansPerMonth" in p and p["scansPerMonth"] >= 10
            assert "maxMembers" in p and p["maxMembers"] >= 1
            assert "features" in p and len(p["features"]) >= 3

            # Verify 20% discount math: Annual total is approx 80% of 12 * Monthly
            full_annual = p["priceInrMonth"] * 12
            discounted_annual = p["priceInrAnnual"]
            assert discounted_annual < full_annual
            # Effective discount should be between 19.5% and 20.5%
            pct_off = ((full_annual - discounted_annual) / full_annual) * 100
            assert 19.5 <= pct_off <= 20.5

def test_recommendation_engine_logic():
    # 1 domain, 10 scans -> starter
    r1 = recommend_plan({"domains": "1", "scans": "10", "team_size": "1", "retention": "30"})
    assert r1.recommended_plan == "starter"

    # 4 domains -> growth
    r2 = recommend_plan({"domains": "4", "scans": "30", "team_size": "2", "retention": "90"})
    assert r2.recommended_plan == "growth"

    # Significant data fiduciary or 20 domains -> business
    r3 = recommend_plan({"domains": "10", "scans": "200", "team_size": "8", "retention": "365", "data_sensitivity": "significant_data_fiduciary"})
    assert r3.recommended_plan == "business"
    assert any("Significant Data Fiduciary" in item for item in r3.reasoning)

@pytest.mark.asyncio
async def test_subscription_upgrade_and_downgrade_enforcement():
    """
    Tests upgrading a plan, and verifying that downgrade is rejected
    if the number of registered websites exceeds the target plan allowance.
    """
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register user
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": f"planmgr_{sfx}",
            "email": f"planmgr_{sfx}@corp.in",
            "password": "Password2026!",
            "fullName": "Plan Manager"
        })
        token = reg_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create organization
        org_res = await client.post("/api/v1/organizations", json={"name": f"Sub Corp {sfx}"}, headers=headers)
        org_id = org_res.json()["id"]

        # Upgrade to Growth
        up_res = await client.post(
            f"/api/v1/organizations/{org_id}/subscription/change-plan",
            json={"planId": "growth"},
            headers=headers
        )
        assert up_res.status_code == 200
        assert up_res.json()["plan"]["id"] == "growth"
        assert up_res.json()["websitesLimit"] == 5

        # Add 2 websites (which is > Starter limit of 1)
        await client.post(f"/api/v1/organizations/{org_id}/websites", json={"hostname": "app1.subcorp.in"}, headers=headers)
        await client.post(f"/api/v1/organizations/{org_id}/websites", json={"hostname": "app2.subcorp.in"}, headers=headers)

        # Attempt to downgrade to Starter -> Should be blocked with 400 Bad Request
        down_res = await client.post(
            f"/api/v1/organizations/{org_id}/subscription/change-plan",
            json={"planId": "starter"},
            headers=headers
        )
        assert down_res.status_code == 400
        assert "cannot downgrade" in down_res.json()["detail"].lower()

@pytest.mark.asyncio
async def test_recommend_plan_api():
    """Tests the public plan recommendation endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/plans/recommend",
            json={"answers": {"domains": "8", "scans": "150", "team_size": "6", "retention": "365"}}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["recommendedPlan"] == "business"
        assert len(data["reasoning"]) > 0
        assert "Business" in data["recommendedPlanName"]

@pytest.mark.asyncio
async def test_concurrent_scan_quota_atomic_reservation_and_release():
    """
    Verifies Phase 3:
    1. Atomic quota reservation prevents exceeding plan scan quota even under concurrent requests.
    2. Cancellation releases the reserved quota credit so users are not penalized.
    """
    import asyncio
    from app.services.subscription_service import SubscriptionService
    from app.models.entities import ScanUsageModel
    from sqlalchemy import select

    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register user and get org
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": f"quotauser_{sfx}",
            "email": f"quotauser_{sfx}@corp.in",
            "password": "Password2026!",
            "fullName": "Quota Test User"
        })
        token = reg_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        orgs = (await client.get("/api/v1/organizations", headers=headers)).json()
        org_id = orgs[0]["id"]

        # Directly set scans_used to 9 out of 10 in DB
        async with AsyncSessionLocal() as session:
            sub = await SubscriptionService.get_or_create_subscription(org_id, session)
            usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)
            usage.scans_used = 9
            await session.commit()

        # Simulate 5 concurrent scan creations when only 1 credit remains
        async def create_scan_attempt():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                return await c.post(
                    "/api/v1/scans",
                    json={
                        "targetUrl": "https://paysecure-india.in",
                        "profile": "privacy_audit",
                        "asyncMode": True,
                        "organizationId": org_id
                    },
                    headers=headers
                )

        results = await asyncio.gather(*[create_scan_attempt() for _ in range(5)], return_exceptions=True)
        success_scans = [r for r in results if hasattr(r, "status_code") and r.status_code in (200, 201)]
        blocked_scans = [r for r in results if hasattr(r, "status_code") and r.status_code == 403]

        # Exactly 1 scan should succeed in reserving the last credit, and 4 should be rejected with 403
        assert len(success_scans) == 1
        assert len(blocked_scans) == 4
        assert "monthly scan quota reached" in blocked_scans[0].json()["detail"].lower()

        # Check that usage in DB is exactly 10 (never 14 or overcharged)
        async with AsyncSessionLocal() as session:
            usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)
            assert usage.scans_used == 10

        # Now cancel the 1 running scan and verify quota is released back to 9
        scan_id = success_scans[0].json()["id"]
        cancel_res = await client.post(f"/api/v1/scans/{scan_id}/cancel", headers=headers)
        assert cancel_res.status_code == 200

        async with AsyncSessionLocal() as session:
            usage = await SubscriptionService.get_or_create_current_usage(org_id, sub, session)
            assert usage.scans_used == 9
