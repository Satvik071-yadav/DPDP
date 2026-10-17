import pytest
import uuid
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import engine, Base
from app.db.init_db import init_db
from app.services.domain_verification_service import (
    normalize_hostname,
    generate_verification_token,
    verify_token_hash
)

@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_db()
    yield

def test_hostname_normalization():
    assert normalize_hostname("https://example.com/path?query=1") == "example.com"
    assert normalize_hostname("http://APP.Company.IN/") == "app.company.in"
    assert normalize_hostname("my-domain.co.in") == "my-domain.co.in"

def test_token_generation_and_hashing():
    raw_token, token_hash, expiry = generate_verification_token()
    assert raw_token.startswith("dpdp-verify-")
    assert verify_token_hash(raw_token, token_hash) is True
    assert verify_token_hash("dpdp-verify-wrongtoken", token_hash) is False

@pytest.mark.asyncio
async def test_website_registration_and_verification_lifecycle():
    """
    Tests registering a website, inspecting DNS TXT challenge attributes,
    simulating DNS verification probe, and token regeneration.
    """
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Register user and get token
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": f"webmaster_{sfx}",
            "email": f"webmaster_{sfx}@corp.in",
            "password": "WebMaster2026!",
            "fullName": "Karan Webmaster"
        })
        token = reg_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create Organization
        org_res = await client.post(
            "/api/v1/organizations",
            json={"name": f"Karan Tech {sfx}"},
            headers=headers
        )
        org_id = org_res.json()["id"]

        # Register website with DNS TXT method
        site_res = await client.post(
            f"/api/v1/organizations/{org_id}/websites",
            json={"hostname": "myportal.karan-tech.in", "verificationMethod": "dns_txt"},
            headers=headers
        )
        assert site_res.status_code == 201
        site = site_res.json()
        assert site["hostname"] == "myportal.karan-tech.in"
        assert site["verificationStatus"] == "pending"
        assert site["verificationMethod"] == "dns_txt"
        assert "dnsTxtHost" in site
        assert "dnsTxtExpectedValue" in site
        assert site["dnsTxtExpectedValue"].startswith("dpdp-verify-")
        website_id = site["id"]
        initial_token = site["dnsTxtExpectedValue"]

        # Attempt verification with mock DNS returning the expected token
        with patch("app.services.domain_verification_service.DomainVerificationService._verify_dns_txt", return_value=(True, "Matched TXT token")):
            verify_res = await client.post(
                f"/api/v1/organizations/{org_id}/websites/{website_id}/verify",
                headers=headers
            )
            assert verify_res.status_code == 200
            verify_data = verify_res.json()
            assert verify_data["success"] is True
            assert verify_data["verificationStatus"] == "verified"
            assert "verified" in verify_data["message"].lower()

        # Check website list shows verified
        list_res = await client.get(f"/api/v1/organizations/{org_id}/websites", headers=headers)
        sites = list_res.json()
        target_site = next(s for s in sites if s["id"] == website_id)
        assert target_site["verificationStatus"] == "verified"
        assert target_site["verifiedAt"] is not None

        # Regenerate token
        regen_res = await client.post(
            f"/api/v1/organizations/{org_id}/websites/{website_id}/regenerate-token",
            headers=headers
        )
        assert regen_res.status_code == 200
        new_site = regen_res.json()
        assert new_site["verificationStatus"] == "pending"
        assert new_site["dnsTxtExpectedValue"] != initial_token

        # Delete website
        del_res = await client.delete(
            f"/api/v1/organizations/{org_id}/websites/{website_id}",
            headers=headers
        )
        assert del_res.status_code == 204

@pytest.mark.asyncio
async def test_verification_rate_limiting():
    """
    Verifies that domain verification attempts are rate limited to a maximum of 10/hour.
    """
    sfx = uuid.uuid4().hex[:6]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        reg_res = await client.post("/api/v1/auth/register", json={
            "username": f"ratelimit_{sfx}",
            "email": f"ratelimit_{sfx}@corp.in",
            "password": "Password2026!",
            "fullName": "Rate Limit Test"
        })
        token = reg_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        org_res = await client.post("/api/v1/organizations", json={"name": f"Rate Corp {sfx}"}, headers=headers)
        org_id = org_res.json()["id"]

        site_res = await client.post(
            f"/api/v1/organizations/{org_id}/websites",
            json={"hostname": "ratelimit-target.in"},
            headers=headers
        )
        website_id = site_res.json()["id"]

        # Run 10 failed verification checks
        with patch("app.services.domain_verification_service.DomainVerificationService._verify_dns_txt", return_value=(False, "TXT record not found")):
            for _ in range(10):
                res = await client.post(f"/api/v1/organizations/{org_id}/websites/{website_id}/verify", headers=headers)
                assert res.status_code == 200
                assert res.json()["success"] is False

            # 11th check should be blocked by rate limiting (429)
            res_11 = await client.post(f"/api/v1/organizations/{org_id}/websites/{website_id}/verify", headers=headers)
            assert res_11.status_code == 429
            assert "rate limit exceeded" in res_11.json()["detail"].lower()

@pytest.mark.asyncio
async def test_http_file_verification_and_dns_rebinding_defense():
    """
    Verifies that HTTP file verification:
    1. Blocks private/link-local/carrier-grade NAT destinations (DNS rebinding defense).
    2. Succeeds when token matches on a valid external target.
    3. Fails when token does not match.
    """
    from app.services.domain_verification_service import DomainVerificationService
    import hashlib

    # Test 1: Private/internal IP resolution is blocked immediately
    with patch("app.services.domain_verification_service.resolve_and_validate_destination", return_value=(False, "SSRF protection: prohibited IP range (169.254.169.254)", ["169.254.169.254"])):
        verified, msg = await DomainVerificationService._verify_http_file("rebinding-target.com", "dummyhash")
        assert verified is False
        assert "Verification aborted for security reasons" in msg

    # Test 2: Successful verification with matching token
    test_token = "dpdp-verify-testtoken12345"
    token_hash = hashlib.sha256(test_token.encode("utf-8")).hexdigest()

    class MockResponse:
        status_code = 200
        text = f"{test_token}\n"

    class MockClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url, headers=None):
            return MockResponse()

    with patch("app.services.domain_verification_service.resolve_and_validate_destination", return_value=(True, "OK", ["93.184.216.34"])):
        with patch("httpx.AsyncClient", MockClient):
            verified, msg = await DomainVerificationService._verify_http_file("example.com", token_hash)
            assert verified is True
            assert "verified at" in msg

    # Test 3: Token mismatch
    class MismatchResponse:
        status_code = 200
        text = "dpdp-verify-wrongtoken"

    class MockMismatchClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url, headers=None):
            return MismatchResponse()

    with patch("app.services.domain_verification_service.resolve_and_validate_destination", return_value=(True, "OK", ["93.184.216.34"])):
        with patch("httpx.AsyncClient", MockMismatchClient):
            verified, msg = await DomainVerificationService._verify_http_file("example.com", token_hash)
            assert verified is False
            assert "did not contain the expected token" in msg


def test_subdomain_authorization_exact_match():
    """
    Verifies Phase 5: Verified root domain does NOT automatically authorize unverified subdomains.
    Each subdomain must be independently registered and verified.
    """
    from fastapi import HTTPException
    from app.core.security import validate_and_resolve_url

    # Exact match on verified root domain succeeds
    with patch("app.core.security.resolve_and_validate_destination", return_value=(True, "OK", ["93.184.216.34"])):
        url, ip = validate_and_resolve_url("https://corp.in/privacy", verified_hostname="corp.in")
        assert "corp.in" in url

    # Subdomain of verified domain is NOT authorized unless independently verified
    with pytest.raises(HTTPException) as exc_info:
        validate_and_resolve_url("https://subdomain.corp.in/privacy", verified_hostname="corp.in")
    assert exc_info.value.status_code == 403
    assert "not an authorized domain" in exc_info.value.detail
