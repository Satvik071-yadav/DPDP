import pytest
import time
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.auth import create_access_token
from app.db.session import engine, Base, AsyncSessionLocal
from app.db.init_db import init_db
from app.models.entities import ScanJob, UserModel, FindingModel, AuditRecordModel
from sqlalchemy import select, delete


@pytest.fixture(autouse=True)
async def setup_test_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_db()


@pytest.mark.asyncio
async def test_public_health_check_unauthenticated():
    """Verify that /api/health remains publicly accessible without any auth token."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_all_private_endpoints_reject_unauthenticated_requests():
    """Verify that all private endpoints return 401 Unauthorized when called without a Bearer token."""
    private_endpoints = [
        ("GET", "/api/v1/scans", None),
        ("POST", "/api/v1/scans", {"targetUrl": "https://paysecure-india.in", "profile": "privacy_audit"}),
        ("GET", "/api/v1/scans/SCAN-2026-1014-01", None),
        ("GET", "/api/v1/scans/SCAN-2026-1014-01/status", None),
        ("POST", "/api/v1/scans/SCAN-2026-1014-01/cancel", None),
        ("GET", "/api/v1/scans/SCAN-2026-1014-01/findings", None),
        ("GET", "/api/v1/scans/SCAN-2026-1014-01/observations", None),
        ("GET", "/api/v1/scans/SCAN-2026-1014-01/consent-comparison", None),
        ("GET", "/api/v1/findings", None),
        ("GET", "/api/v1/findings/DPDP-HIGH-007", None),
        ("PATCH", "/api/v1/findings/DPDP-HIGH-007/status", {"status": "verified_fix"}),
        ("GET", "/api/v1/findings/DPDP-HIGH-007/evidence", None),
        ("POST", "/api/v1/findings/DPDP-HIGH-007/verify", {"isPatched": True}),
        ("GET", "/api/v1/findings/verification/audit-history", None),
        ("DELETE", "/api/v1/findings/verification/audit-history?confirm=true", None),
        ("GET", "/api/v1/settings", None),
        ("PUT", "/api/v1/settings", {"organizationName": "Test Org"}),
        ("GET", "/api/v1/notifications", None),
        ("POST", "/api/v1/copilot/chat", {
            "findingContext": {
                "findingId": "DPDP-HIGH-007",
                "title": "BOLA",
                "severity": "high",
                "confidence": 95,
                "category": "auth",
                "affectedUrl": "https://paysecure-india.in",
                "endpoint": "/api/v1/kyc",
                "dpdpSection": "Section 8(5)",
                "observedEvidence": {}
            },
            "messages": [{"role": "user", "content": "Help"}]
        }),
    ]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for method, path, body in private_endpoints:
            if method == "GET":
                res = await client.get(path)
            elif method == "POST":
                res = await client.post(path, json=body)
            elif method == "PATCH":
                res = await client.patch(path, json=body)
            elif method == "PUT":
                res = await client.put(path, json=body)
            elif method == "DELETE":
                res = await client.delete(path)
            else:
                continue

            assert res.status_code == 401, f"Endpoint {method} {path} should return 401, got {res.status_code}"


@pytest.mark.asyncio
async def test_invalid_expired_and_tampered_tokens_rejected():
    """Verify that expired, tampered, or garbage tokens are rejected with 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Garbage token
        res_garbage = await client.get("/api/v1/scans", headers={"Authorization": "Bearer not_a_real_jwt"})
        assert res_garbage.status_code == 401

        # Expired token (expires_in_minutes = -10)
        expired_token = create_access_token({"sub": "usr_dpo_001", "role": "dpo"}, expires_in_minutes=-10)
        res_expired = await client.get("/api/v1/scans", headers={"Authorization": f"Bearer {expired_token}"})
        assert res_expired.status_code == 401

        # Tampered signature
        valid_token = create_access_token({"sub": "usr_dpo_001", "role": "dpo"})
        tampered_token = valid_token[:-4] + "ABCD"
        res_tampered = await client.get("/api/v1/scans", headers={"Authorization": f"Bearer {tampered_token}"})
        assert res_tampered.status_code == 401


@pytest.mark.asyncio
async def test_user_registration_validation_and_uniqueness():
    """Verify user registration input validation, conflict prevention, and password hashing."""
    import uuid
    suffix = uuid.uuid4().hex[:6]
    test_user = f"priya_{suffix}"
    test_email = f"priya_{suffix}@corp.in"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Short username (< 3 chars)
        res_short_user = await client.post("/api/v1/auth/register", json={
            "username": "ab",
            "email": test_email,
            "password": "ValidPassword123!",
            "fullName": "Test User"
        })
        assert res_short_user.status_code == 422

        # 2. Short password (< 8 chars)
        res_short_pass = await client.post("/api/v1/auth/register", json={
            "username": f"user_{suffix}",
            "email": f"user_{suffix}@corp.in",
            "password": "short",
            "fullName": "Test User"
        })
        assert res_short_pass.status_code == 422

        # 3. Invalid email format
        res_bad_email = await client.post("/api/v1/auth/register", json={
            "username": f"user_{suffix}",
            "email": "not-an-email",
            "password": "ValidPassword123!",
            "fullName": "Test User"
        })
        assert res_bad_email.status_code == 422

        # 4. Successful registration
        res_success = await client.post("/api/v1/auth/register", json={
            "username": test_user,
            "email": test_email,
            "password": "SuperSecretPassword2026!",
            "fullName": "Priya Verma",
            "role": "dpo"
        })
        assert res_success.status_code == 201
        data = res_success.json()
        assert "accessToken" in data
        assert data["user"]["username"] == test_user
        assert data["user"]["email"] == test_email
        assert data["user"]["role"] == "auditor", "Self-service registration must never grant DPO privileges"
        new_token = data["accessToken"]

        # Verify password in database is a PBKDF2 hash, not plaintext
        async with AsyncSessionLocal() as session:
            user_db = (await session.execute(select(UserModel).where(UserModel.username == test_user))).scalar_one()
            assert user_db.password_hash.startswith("pbkdf2:sha256:")
            assert "SuperSecretPassword2026!" not in user_db.password_hash

        # 5. Duplicate registration rejection (same username)
        res_dup_username = await client.post("/api/v1/auth/register", json={
            "username": test_user,
            "email": f"another_{suffix}@corp.in",
            "password": "SuperSecretPassword2026!",
            "fullName": "Priya Verma"
        })
        assert res_dup_username.status_code == 409

        # 6. Duplicate registration rejection (same email)
        res_dup_email = await client.post("/api/v1/auth/register", json={
            "username": f"different_{suffix}",
            "email": test_email,
            "password": "SuperSecretPassword2026!",
            "fullName": "Priya Verma"
        })
        assert res_dup_email.status_code == 409

        # 7. Authenticate via /auth/login with newly registered user
        login_res = await client.post("/api/v1/auth/login", json={
            "username": test_user,
            "password": "SuperSecretPassword2026!"
        })
        assert login_res.status_code == 200
        assert login_res.json()["user"]["username"] == test_user


@pytest.mark.asyncio
async def test_multi_tenant_isolation_user_a_vs_user_b():
    """
    CRITICAL MULTI-TENANT ISOLATION TEST:
    Verifies that User A and User B operate in strict isolation:
    1. User A creates scans and generates findings.
    2. User B cannot see User A's scans or findings (empty list).
    3. User B cannot access User A's scan details directly (returns 404).
    4. User B cannot access User A's findings directly (returns 404).
    5. User B's settings and notifications are completely independent.
    """
    import uuid
    sfx = uuid.uuid4().hex[:6]
    # 1. Register User A and User B
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_a = await client.post("/api/v1/auth/register", json={
            "username": f"tenant_a_{sfx}",
            "email": f"tenant_a_{sfx}@domain.com",
            "password": "TenantASecret2026!",
            "fullName": "Alice Tenant A",
            "role": "dpo"
        })
        assert res_a.status_code == 201
        token_a = res_a.json()["accessToken"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        res_b = await client.post("/api/v1/auth/register", json={
            "username": f"tenant_b_{sfx}",
            "email": f"tenant_b_{sfx}@domain.com",
            "password": "TenantBSecret2026!",
            "fullName": "Bob Tenant B",
            "role": "dpo"
        })
        assert res_b.status_code == 201
        token_b = res_b.json()["accessToken"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 2. Check fresh tenant state: User B starts with 0 scans, 0 findings, 0 notifications
        b_scans = await client.get("/api/v1/scans", headers=headers_b)
        assert b_scans.status_code == 200
        assert len(b_scans.json()) == 0

        b_findings = await client.get("/api/v1/findings", headers=headers_b)
        assert b_findings.status_code == 200
        assert len(b_findings.json()) == 0

        b_notifs = await client.get("/api/v1/notifications", headers=headers_b)
        assert b_notifs.status_code == 200
        assert len(b_notifs.json()) == 0

        # 3. User A creates a scan
        scan_a_res = await client.post(
            "/api/v1/scans",
            json={"targetUrl": "https://paysecure-india.in", "profile": "privacy_audit"},
            headers=headers_a
        )
        assert scan_a_res.status_code == 201
        scan_a_id = scan_a_res.json()["id"]

        # User A sees 1 scan
        a_scans = await client.get("/api/v1/scans", headers=headers_a)
        assert len(a_scans.json()) == 1
        assert a_scans.json()[0]["id"] == scan_a_id

        # User B still sees 0 scans
        b_scans_after = await client.get("/api/v1/scans", headers=headers_b)
        assert len(b_scans_after.json()) == 0

        # User B attempts direct IDOR access to User A's scan -> MUST receive 404
        idor_scan = await client.get(f"/api/v1/scans/{scan_a_id}", headers=headers_b)
        assert idor_scan.status_code == 404

        idor_status = await client.get(f"/api/v1/scans/{scan_a_id}/status", headers=headers_b)
        assert idor_status.status_code == 404

        idor_findings = await client.get(f"/api/v1/scans/{scan_a_id}/findings", headers=headers_b)
        assert idor_findings.status_code == 404

        idor_cancel = await client.post(f"/api/v1/scans/{scan_a_id}/cancel", headers=headers_b)
        assert idor_cancel.status_code == 404

        # 4. User A's findings vs User B
        a_findings = await client.get("/api/v1/findings", headers=headers_a)
        assert len(a_findings.json()) > 0
        finding_a_id = a_findings.json()[0]["id"]

        # User B attempting direct access to User A's finding -> MUST receive 404
        idor_finding_get = await client.get(f"/api/v1/findings/{finding_a_id}", headers=headers_b)
        assert idor_finding_get.status_code == 404

        idor_finding_patch = await client.patch(
            f"/api/v1/findings/{finding_a_id}/status",
            json={"status": "verified_fix"},
            headers=headers_b
        )
        assert idor_finding_patch.status_code == 404

        # 5. User A settings vs User B settings
        a_settings = await client.get("/api/v1/settings", headers=headers_a)
        assert a_settings.status_code == 200
        assert "Alice Tenant A" in a_settings.json()["organizationName"]

        b_settings = await client.get("/api/v1/settings", headers=headers_b)
        assert b_settings.status_code == 200
        assert "Bob Tenant B" in b_settings.json()["organizationName"]


@pytest.mark.asyncio
async def test_role_based_access_control():
    """Verify that role restrictions are enforced (e.g. non-dpo/admin cannot purge audit history)."""
    import uuid
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register a user with role 'auditor'
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": f"auditor_{sfx}",
            "email": f"auditor_{sfx}@cert-in.gov.in",
            "password": "AuditorPassword2026!",
            "fullName": "External Auditor",
            "role": "auditor"
        })
        assert reg_res.status_code == 201
        auditor_token = reg_res.json()["accessToken"]
        auditor_headers = {"Authorization": f"Bearer {auditor_token}"}

        # Auditor cannot delete audit history -> 403 Forbidden
        del_res = await client.delete(
            "/api/v1/findings/verification/audit-history?confirm=true",
            headers=auditor_headers
        )
        assert del_res.status_code == 403
        assert "insufficient privileges" in del_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_self_service_registration_privilege_escalation_prevented():
    """Verify that attempting to register with role 'dpo' or 'admin' is strictly forced to 'auditor'."""
    import uuid
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for attempted_role in ["dpo", "admin", "superadmin", "root"]:
            reg_res = await client.post("/api/v1/auth/register", json={
                "username": f"hacker_{attempted_role}_{sfx}",
                "email": f"hacker_{attempted_role}_{sfx}@attack.net",
                "password": "Password12345!",
                "fullName": "Malicious User",
                "role": attempted_role
            })
            assert reg_res.status_code == 201
            assert reg_res.json()["user"]["role"] == "auditor"
