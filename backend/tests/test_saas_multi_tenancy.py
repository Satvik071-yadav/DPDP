import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import engine, Base, AsyncSessionLocal
from app.db.init_db import init_db

@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_db()
    yield

@pytest.mark.asyncio
async def test_organization_creation_and_membership():
    """
    Verifies that a user can create an organization, becomes its owner,
    and has a default Starter subscription automatically provisioned.
    """
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register user
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": f"founder_{sfx}",
            "email": f"founder_{sfx}@corp.in",
            "password": "FounderPassword2026!",
            "fullName": "Priya Founder"
        })
        assert reg_res.status_code == 201
        token = reg_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create custom organization
        create_res = await client.post(
            "/api/v1/organizations",
            json={"name": f"Priya Analytics {sfx}"},
            headers=headers
        )
        assert create_res.status_code == 201
        org = create_res.json()
        assert org["name"] == f"Priya Analytics {sfx}"
        assert org["role"] == "owner"
        assert org["id"].startswith("org_")
        org_id = org["id"]

        # List organizations for user
        list_res = await client.get("/api/v1/organizations", headers=headers)
        assert list_res.status_code == 200
        org_ids = [o["id"] for o in list_res.json()]
        assert org_id in org_ids

        # Check members
        members_res = await client.get(f"/api/v1/organizations/{org_id}/members", headers=headers)
        assert members_res.status_code == 200
        members = members_res.json()
        assert len(members) == 1
        assert members[0]["role"] == "owner"
        assert members[0]["username"] == f"founder_{sfx}"

        # Check that Starter subscription was auto-provisioned
        sub_res = await client.get(f"/api/v1/organizations/{org_id}/subscription", headers=headers)
        assert sub_res.status_code == 200
        sub = sub_res.json()
        assert sub["plan"]["id"] == "starter"
        assert sub["status"] == "active"
        assert sub["websitesLimit"] == 1
        assert sub["scansLimit"] == 10

@pytest.mark.asyncio
async def test_organization_multi_tenant_isolation():
    """
    Verifies that User A and User B cannot access each other's organizations,
    websites, or subscriptions (returns 403 Forbidden).
    """
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register User A
        res_a = await client.post("/api/v1/auth/register", json={
            "username": f"user_a_{sfx}",
            "email": f"user_a_{sfx}@corp.in",
            "password": "PasswordA2026!",
            "fullName": "Alice Org A"
        })
        token_a = res_a.json()["accessToken"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Register User B
        res_b = await client.post("/api/v1/auth/register", json={
            "username": f"user_b_{sfx}",
            "email": f"user_b_{sfx}@corp.in",
            "password": "PasswordB2026!",
            "fullName": "Bob Org B"
        })
        token_b = res_b.json()["accessToken"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A creates Org A
        org_a_res = await client.post(
            "/api/v1/organizations",
            json={"name": f"Alpha Corp {sfx}"},
            headers=headers_a
        )
        org_a_id = org_a_res.json()["id"]

        # User B cannot list members of Org A
        idor_members = await client.get(f"/api/v1/organizations/{org_a_id}/members", headers=headers_b)
        assert idor_members.status_code == 403

        # User B cannot view Org A's websites
        idor_websites = await client.get(f"/api/v1/organizations/{org_a_id}/websites", headers=headers_b)
        assert idor_websites.status_code == 403

        # User B cannot view Org A's subscription
        idor_sub = await client.get(f"/api/v1/organizations/{org_a_id}/subscription", headers=headers_b)
        assert idor_sub.status_code == 403

        # User B cannot add website to Org A
        idor_add_site = await client.post(
            f"/api/v1/organizations/{org_a_id}/websites",
            json={"hostname": "malicious-target.com"},
            headers=headers_b
        )
        assert idor_add_site.status_code == 403

@pytest.mark.asyncio
async def test_registration_eager_organization_provisioning():
    """
    Verifies Phase 4: User registration immediately provisions an organization,
    owner membership, and active Starter subscription without waiting for a lazy fetch.
    """
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": f"eager_{sfx}",
            "email": f"eager_{sfx}@corp.in",
            "password": "Password2026!",
            "fullName": "Eager Provisioning Test"
        })
        assert reg_res.status_code == 201
        token = reg_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # Check organizations immediately
        orgs_res = await client.get("/api/v1/organizations", headers=headers)
        assert orgs_res.status_code == 200
        orgs = orgs_res.json()
        assert len(orgs) >= 1
        primary_org = orgs[0]
        assert primary_org["role"] == "owner"
        assert primary_org["planId"] == "starter"
        assert primary_org["subscriptionStatus"] == "active"

@pytest.mark.asyncio
async def test_findings_visibility_organization_scoped():
    """
    Verifies Phase 4: Findings visibility across organization teammates:
    - User A in Org 1 runs a scan.
    - Teammate User B in Org 1 CAN see the scan findings.
    - User C in Org 2 CANNOT see Org 1 findings.
    - User C cannot query Org 1 findings by passing ?organizationId (403 Forbidden).
    """
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register User A (Org 1)
        res_a = await client.post("/api/v1/auth/register", json={
            "username": f"usera_find_{sfx}",
            "email": f"usera_find_{sfx}@org1.in",
            "password": "Password2026!",
            "fullName": "Alice Org 1"
        })
        token_a = res_a.json()["accessToken"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Get User A's eager primary organization
        orgs_a = (await client.get("/api/v1/organizations", headers=headers_a)).json()
        org_1_id = orgs_a[0]["id"]

        # User A executes a demo scan in Org 1
        scan_res = await client.post(
            "/api/v1/scans",
            json={
                "targetUrl": "https://paysecure-india.in",
                "profile": "privacy_audit",
                "asyncMode": False,
                "organizationId": org_1_id
            },
            headers=headers_a
        )
        assert scan_res.status_code in (200, 201)
        scan_data = scan_res.json()
        assert len(scan_data["findings"]) > 0
        finding_id = scan_data["findings"][0]["id"]

        # Register User B (will join Org 1)
        res_b = await client.post("/api/v1/auth/register", json={
            "username": f"userb_find_{sfx}",
            "email": f"userb_find_{sfx}@org1.in",
            "password": "Password2026!",
            "fullName": "Bob Teammate"
        })
        token_b = res_b.json()["accessToken"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A upgrades to Growth plan (which allows up to 5 members)
        up_res = await client.post(
            f"/api/v1/organizations/{org_1_id}/subscription/change-plan",
            json={"planId": "growth"},
            headers=headers_a
        )
        assert up_res.status_code == 200

        # User A invites/adds User B to Org 1 as an auditor
        add_b = await client.post(
            f"/api/v1/organizations/{org_1_id}/members",
            json={"email": f"userb_find_{sfx}@org1.in", "role": "auditor"},
            headers=headers_a
        )
        assert add_b.status_code == 201

        # User B queries /api/v1/findings -> MUST see findings from Org 1
        b_findings_res = await client.get("/api/v1/findings", headers=headers_b)
        assert b_findings_res.status_code == 200
        b_finding_ids = [f["id"] for f in b_findings_res.json()]
        assert finding_id in b_finding_ids

        # User B can view specific finding
        b_single_find = await client.get(f"/api/v1/findings/{finding_id}", headers=headers_b)
        assert b_single_find.status_code == 200

        # Register User C (in isolated Org 2)
        res_c = await client.post("/api/v1/auth/register", json={
            "username": f"userc_find_{sfx}",
            "email": f"userc_find_{sfx}@org2.in",
            "password": "Password2026!",
            "fullName": "Charlie Stranger"
        })
        token_c = res_c.json()["accessToken"]
        headers_c = {"Authorization": f"Bearer {token_c}"}

        # User C queries /api/v1/findings -> CANNOT see Org 1 findings
        c_findings_res = await client.get("/api/v1/findings", headers=headers_c)
        assert c_findings_res.status_code == 200
        c_finding_ids = [f["id"] for f in c_findings_res.json()]
        assert finding_id not in c_finding_ids

        # User C attempts to access Org 1 findings via ?organizationId -> 403 Forbidden
        c_idor = await client.get(f"/api/v1/findings?organizationId={org_1_id}", headers=headers_c)
        assert c_idor.status_code == 403
