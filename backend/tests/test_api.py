import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import engine, Base, AsyncSessionLocal
from app.models.entities import ScanJob
from app.db.init_db import init_db
from app.core.security import validate_and_resolve_url, is_ip_blocked, is_ip_literal, resolve_and_validate_destination
from app.core.redaction import redact_text, redact_headers
from app.scanner.browser_observer import browser_observer
from app.services.scan_service import get_scan_semaphore
from app.core.config import settings
from fastapi import HTTPException


import asyncio
import uvicorn
import socket


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def live_server_port():
    return find_free_port()


@pytest.fixture(scope="session", autouse=True)
def live_server(live_server_port):
    config = uvicorn.Config(app, host="127.0.0.1", port=live_server_port, log_level="warning")
    server = uvicorn.Server(config)
    import threading
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    import time
    time.sleep(1.2)
    yield f"http://127.0.0.1:{live_server_port}"
    server.should_exit = True


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_db()
    yield


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "dpdp-guard-backend"
        assert data["database"] == "healthy"


@pytest.mark.asyncio
async def test_controlled_testbed_browser_observation(live_server):
    """
    Tests live Playwright browser instrumentation against the local controlled testbed.
    Verifies:
    1. Navigation and page load
    2. Interception of first-party and third-party requests
    3. Consent state differences (accepted vs rejected)
    4. Linkage to observation IDs
    """
    testbed_url = f"{live_server}/testbed"
    # Test session with consent accepted
    obs_accepted = await browser_observer.observe_target(testbed_url, "TEST-SCAN-01", consent_action="accept")
    assert len(obs_accepted) > 0
    urls_accepted = [o["url"] for o in obs_accepted]
    assert any("/testbed/api/session" in u for u in urls_accepted)
    assert any("/testbed/api/analytics" in u for u in urls_accepted)

    # Test session with consent rejected
    obs_rejected = await browser_observer.observe_target(testbed_url, "TEST-SCAN-02", consent_action="reject")
    assert len(obs_rejected) > 0
    urls_rejected = [o["url"] for o in obs_rejected]
    assert any("/testbed/api/session" in u for u in urls_rejected)
    assert any("/testbed/api/optout-receipt" in u for u in urls_rejected)
    # Analytics should NOT have been dispatched in reject session
    assert not any("/testbed/api/analytics" in u for u in urls_rejected)


@pytest.mark.asyncio
async def test_create_and_get_scan(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        payload = {
            "targetUrl": "https://paysecure-india.in",
            "profile": "privacy_audit",
            "consentModeEnabled": True
        }
        res = await client.post("/api/v1/scans", json=payload)
        assert res.status_code == 201
        scan_data = res.json()
        assert scan_data["targetUrl"] == "https://paysecure-india.in"
        assert scan_data["status"] == "completed"
        assert len(scan_data["findings"]) > 0

        scan_id = scan_data["id"]

        get_res = await client.get(f"/api/v1/scans/{scan_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == scan_id

        findings_res = await client.get(f"/api/v1/scans/{scan_id}/findings")
        assert findings_res.status_code == 200
        findings = findings_res.json()
        assert len(findings) > 0


@pytest.mark.asyncio
async def test_unauthorized_target_rejected(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        payload = {
            "targetUrl": "https://unauthorized-evil-target.com",
            "profile": "privacy_audit"
        }
        res = await client.post("/api/v1/scans", json=payload)
        assert res.status_code == 403
        assert "not in authorized demo scope" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_ssrf_and_ip_validation():
    # Loopback IP blocked
    assert is_ip_blocked("127.0.0.1") is True
    # Cloud metadata IP (AWS/GCP/Azure) blocked
    assert is_ip_blocked("169.254.169.254") is True
    # Private RFC 1918 networks blocked
    assert is_ip_blocked("10.0.0.1") is True
    assert is_ip_blocked("192.168.1.1") is True
    assert is_ip_blocked("172.16.0.1") is True

    # Embedded credentials in URL rejected
    with pytest.raises(HTTPException) as exc:
        validate_and_resolve_url("http://admin:secret@paysecure-india.in")
    assert exc.value.status_code == 400

    # Non-standard port rejected
    with pytest.raises(HTTPException) as exc:
        validate_and_resolve_url("https://paysecure-india.in:9999")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_redaction_pipeline():
    raw_text = (
        "Customer Rajesh Kumar (rajesh.sharma@fictional-mail.in) with Aadhaar 4920 1948 2019 "
        "and mobile +91 98201 55667 authenticated with JWT "
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.do_not_leak"
    )
    redacted = redact_text(raw_text)
    assert "4920 1948 2019" not in redacted
    assert "XXXX-XXXX-2019" in redacted
    assert "98201 55667" not in redacted
    assert "+91 XXXXX 55667" in redacted
    assert "rajesh.sharma@" not in redacted
    assert "r***@fictional-mail.in" in redacted
    assert "[REDACTED_JWT_TOKEN]" in redacted

    headers = {
        "Authorization": "Bearer secret_token",
        "Cookie": "session_id=abc123xyz",
        "X-Custom-Header": "safe_value"
    }
    redacted_hdrs = redact_headers(headers)
    assert redacted_hdrs["Authorization"] == "[REDACTED_CREDENTIAL]"
    assert redacted_hdrs["Cookie"] == "[REDACTED_CREDENTIAL]"
    assert redacted_hdrs["X-Custom-Header"] == "safe_value"


@pytest.mark.asyncio
async def test_verify_finding_vulnerable_and_patched(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # Unpatched probe: BOLA reproduces -> FAIL with HTTP 200 exposing PII
        unpatched_res = await client.post("/api/v1/findings/DPDP-HIGH-007/verify", json={"isPatched": False})
        assert unpatched_res.status_code == 200
        data = unpatched_res.json()
        assert data["outcome"] == "FAIL"
        assert data["response"]["statusCode"] == 200
        assert "panNumber" in data["response"]["leakedPiiFields"]

        # Patched probe: Object-level guard triggers -> PASS with HTTP 403 Forbidden zero PII
        patched_res = await client.post("/api/v1/findings/DPDP-HIGH-007/verify", json={"isPatched": True})
        assert patched_res.status_code == 200
        patched_data = patched_res.json()
        assert patched_data["outcome"] == "PASS"
        assert patched_data["response"]["statusCode"] == 403
        assert len(patched_data["response"]["leakedPiiFields"]) == 0

        # Verify audit history records were persisted for both attempts
        audit_res = await client.get("/api/v1/findings/verification/audit-history")
        assert audit_res.status_code == 200
        audit_history = audit_res.json()
        assert len(audit_history) >= 2
        # Check that both unpatched (FAIL, 200) and patched (PASS, 403) records exist
        results = [a["result"] for a in audit_history]
        assert "FAIL" in results
        assert "PASS" in results
        status_codes = [a["statusCode"] for a in audit_history]
        assert 200 in status_codes
        assert 403 in status_codes

        # Finding status update
        patch_status_res = await client.patch("/api/v1/findings/DPDP-HIGH-007/status", json={"status": "verified_fix"})
        assert patch_status_res.status_code == 200
        assert patch_status_res.json()["status"] == "verified_fix"


@pytest.mark.asyncio
async def test_audit_history_clear_requires_explicit_confirmation(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # First ensure an audit record exists
        await client.post("/api/v1/findings/DPDP-HIGH-007/verify", json={"isPatched": True})

        # Attempt deletion without confirmation parameter -> 400 Bad Request
        delete_unconfirmed = await client.delete("/api/v1/findings/verification/audit-history")
        assert delete_unconfirmed.status_code == 400
        assert "explicit confirmation" in delete_unconfirmed.json()["detail"].lower()

        # Audit records still exist
        get_res = await client.get("/api/v1/findings/verification/audit-history")
        assert len(get_res.json()) > 0

        # Attempt deletion with ?confirm=true -> 200 OK
        delete_confirmed = await client.delete("/api/v1/findings/verification/audit-history?confirm=true")
        assert delete_confirmed.status_code == 200
        assert delete_confirmed.json()["cleared"] is True

        # Audit records successfully purged
        get_res_empty = await client.get("/api/v1/findings/verification/audit-history")
        assert len(get_res_empty.json()) == 0


@pytest.mark.asyncio
async def test_fix_verify_malformed_and_unrelated_responses_cannot_produce_false_pass():
    """
    Verifies that HTTP 403 alone cannot produce PASS without expected authorization
    enforcement signatures and absence of unauthorized PII.
    """
    from app.services.verification_service import verification_service
    from unittest.mock import AsyncMock, patch
    import httpx

    # 1. 403 with leaked PII in body -> MUST produce FAIL
    resp_pii = httpx.Response(
        status_code=403,
        headers={"x-dpdp-guard-enforced": "true"},
        json={"error": "Forbidden", "leaked": "Priya Patel"}
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = resp_pii
        result_pii = await verification_service.execute_verification(
            finding_id="DPDP-HIGH-007",
            is_patched=True
        )
        assert result_pii.outcome == "FAIL"
        assert "pii_detected_in_error_body" in result_pii.response.leakedPiiFields

    # 2. Unrelated generic 403 (e.g. cloud WAF or proxy block missing authorization guard signature) -> MUST produce FAIL
    resp_generic = httpx.Response(
        status_code=403,
        headers={},
        json={"msg": "Generic gateway block"}
    )
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = resp_generic
        result_generic = await verification_service.execute_verification(
            finding_id="DPDP-HIGH-007",
            is_patched=True
        )
        assert result_generic.outcome == "FAIL"
        assert "Unverified HTTP 403" in result_generic.explanation

    # 3. Connection error / timeout -> MUST produce FAIL
    with patch("httpx.AsyncClient.get", side_effect=Exception("Connection reset by peer")):
        result_conn_err = await verification_service.execute_verification(
            finding_id="DPDP-HIGH-007",
            is_patched=True
        )
        assert result_conn_err.outcome == "FAIL"
        assert result_conn_err.response.statusCode == 500


@pytest.mark.asyncio
async def test_copilot_chat(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        req = {
            "findingContext": {
                "findingId": "DPDP-HIGH-007",
                "title": "Broken Object-Level Authorization (BOLA/IDOR)",
                "severity": "high",
                "confidence": 97,
                "category": "pii_exposure",
                "affectedUrl": "https://paysecure-india.in/api/v1/customers/usr_demo_custB/kyc-record",
                "endpoint": "/api/v1/customers/{customerId}/kyc-record",
                "dpdpSection": "Section 8(5)",
                "observedEvidence": {
                    "method": "GET",
                    "url": "https://paysecure-india.in/api/v1/customers/usr_demo_custB/kyc-record",
                    "sanitizedPayload": "{\"customerId\": \"usr_demo_custB\"}"
                },
                "remediationSteps": ["Enforce tenant check."],
                "hasCodeDiff": True
            },
            "messages": [
                {"role": "user", "content": "Explain this finding in simple language."}
            ]
        }
        res = await client.post("/api/v1/copilot/chat", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["isDemoResponse"] is True
        assert "whatWeObserved" in data["structuredResponse"]
        assert "whyItMatters" in data["structuredResponse"]
        assert "whatRemainsUncertain" in data["structuredResponse"]
        assert "recommendedActions" in data["structuredResponse"]
        assert "howToVerify" in data["structuredResponse"]


def test_hostname_vs_ip_validation():
    # IP literal detection
    assert is_ip_literal("127.0.0.1") is True
    assert is_ip_literal("169.254.169.254") is True
    assert is_ip_literal("analytics.google.com") is False
    assert is_ip_literal("subdomain.example.co.in") is False

    # Blocked IP check must not treat DNS hostnames as blocked IPs
    assert is_ip_blocked("analytics.google.com") is False
    assert is_ip_blocked("169.254.169.254") is True
    assert is_ip_blocked("10.0.0.1") is True

    # Cloud metadata hostnames and link-local literals must be blocked
    safe1, reason1, _ = resolve_and_validate_destination("metadata.google.internal")
    assert safe1 is False
    assert "metadata" in reason1.lower()

    safe2, reason2, _ = resolve_and_validate_destination("169.254.169.254")
    assert safe2 is False

    # validate_and_resolve_url blocks SSRF targets
    with pytest.raises(HTTPException) as exc3:
        validate_and_resolve_url("http://169.254.169.254/latest/meta-data/")
    assert exc3.value.status_code in (400, 403)

    with pytest.raises(HTTPException) as exc4:
        validate_and_resolve_url("http://metadata.google.internal/computeMetadata/v1/")
    assert exc4.value.status_code in (400, 403)


def test_testbed_telemetry_classification():
    # Testbed analytics must be classified as third_party
    assert browser_observer.classify_domain(
        url="http://127.0.0.1:8000/testbed/api/analytics",
        target_domain="127.0.0.1"
    ) == "third_party"

    # Testbed session and opt-out receipt must be first_party
    assert browser_observer.classify_domain(
        url="http://127.0.0.1:8000/testbed/api/session",
        target_domain="127.0.0.1"
    ) == "first_party"
    assert browser_observer.classify_domain(
        url="http://127.0.0.1:8000/testbed/api/optout-receipt",
        target_domain="127.0.0.1"
    ) == "first_party"

    # External domain classification
    assert browser_observer.classify_domain(
        url="https://analytics.google.com/collect",
        target_domain="paysecure-india.in"
    ) == "third_party"
    assert browser_observer.classify_domain(
        url="https://api.paysecure-india.in/v1/auth",
        target_domain="paysecure-india.in"
    ) == "first_party"


def test_pan_redaction_pipeline():
    # Valid uppercase Indian PAN
    raw = "Customer KYC record has PAN ABCDE1234F verified."
    redacted = redact_text(raw)
    assert "XXXXX1234F" in redacted
    assert "ABCDE1234F" not in redacted

    # Lowercase & mixed case PAN
    raw_mixed = "pan: abcde1234f and alt: AbCdE9876Z"
    redacted_mixed = redact_text(raw_mixed)
    assert "XXXXX1234F" in redacted_mixed
    assert "XXXXX9876Z" in redacted_mixed

    # Non-PAN patterns must not be altered
    non_pan = "Ref code ABCDE12345 or short ABCD1234F"
    assert redact_text(non_pan) == non_pan

    # Sensitive PAN header redaction
    headers = {
        "X-Customer-PAN": "ABCDE1234F",
        "X-Request-ID": "req-987654"
    }
    redacted_hdrs = redact_headers(headers)
    assert redacted_hdrs["X-Customer-PAN"] == "[REDACTED_CREDENTIAL]"
    assert redacted_hdrs["X-Request-ID"] == "req-987654"


@pytest.mark.asyncio
async def test_scan_concurrency_semaphore():
    semaphore = get_scan_semaphore()
    assert semaphore._value <= settings.MAX_SCAN_CONCURRENCY
    async with semaphore:
        # Inside lock, value should be decremented
        assert semaphore._value == settings.MAX_SCAN_CONCURRENCY - 1


@pytest.mark.asyncio
async def test_live_testbed_scan_findings_and_no_fixture_substitution(live_server, auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # Run real scan on local testbed
        res = await client.post(
            "/api/v1/scans",
            json={"targetUrl": f"{live_server}/testbed", "profile": "privacy_audit"}
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "completed"
        assert data["provenance"] == "live_browser_observation"
        assert data["errorMessage"] is None
        scan_id = data["id"]

        # Findings must be observation-linked, not demo fixtures
        findings = data["findings"]
        assert len(findings) > 0
        for f in findings:
            assert f["isDemo"] is False
            assert f["id"].startswith("DPDP-LIVE-")

        # Verify observations endpoint reflects live network telemetry
        obs_res = await client.get(f"/api/v1/scans/{scan_id}/observations")
        assert obs_res.status_code == 200
        obs_list = obs_res.json()
        assert len(obs_list) >= 2
        # Verify /testbed/api/analytics observation is classified as third_party
        analytics_obs = [o for o in obs_list if "/testbed/api/analytics" in o["url"]]
        assert len(analytics_obs) >= 1
        assert analytics_obs[0]["classification"] == "third_party"

        # Verify consent comparison endpoint
        cmp_res = await client.get(f"/api/v1/scans/{scan_id}/consent-comparison")
        assert cmp_res.status_code == 200
        cmp_data = cmp_res.json()
        assert cmp_data["scanId"] == scan_id
        assert len(cmp_data["observedOnlyInAccepted"]) >= 1


@pytest.mark.asyncio
async def test_scan_failure_handling(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # Target an unreachable port on allowed localhost
        res = await client.post(
            "/api/v1/scans",
            json={"targetUrl": "http://127.0.0.1:59998/offline", "profile": "privacy_audit"}
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "failed"
        assert data["errorMessage"] is not None
        assert "failed" in data["errorMessage"].lower() or "connection" in data["errorMessage"].lower()
        # Ensure zero demo fixtures are substituted on failure
        assert len(data["findings"]) == 0


@pytest.mark.asyncio
async def test_scan_lifecycle_and_status_endpoint(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # Create a scan
        res = await client.post(
            "/api/v1/scans",
            json={"targetUrl": "https://paysecure-india.in", "profile": "privacy_audit"}
        )
        assert res.status_code == 201
        scan_id = res.json()["id"]

        # Check status endpoint
        status_res = await client.get(f"/api/v1/scans/{scan_id}/status")
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["scanId"] == scan_id
        assert status_data["status"] == "completed"
        assert status_data["stage"] == "completed"
        assert status_data["progress"] == 100
        assert status_data["completedAt"] is not None


@pytest.mark.asyncio
async def test_scan_duplicate_submission_prevention(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # Manually create a running scan in DB scoped to the same user
        async with AsyncSessionLocal() as session:
            running_job = ScanJob(
                id="SCAN-IN-FLIGHT-TEST",
                user_id="usr_dpo_001",
                target_url="https://paysecure-india.in",
                status="running",
                progress_stage="inspecting_network",
                progress_percent=75,
                log_message="Scanning in progress..."
            )
            session.add(running_job)
            await session.commit()

        try:
            # Attempt to submit duplicate scan for the same targetUrl
            dup_res = await client.post(
                "/api/v1/scans",
                json={"targetUrl": "https://paysecure-india.in", "profile": "privacy_audit"}
            )
            assert dup_res.status_code == 409
            assert "already in progress" in dup_res.json()["detail"].lower()
        finally:
            # Clean up test in-flight scan
            async with AsyncSessionLocal() as session:
                job_to_del = await session.get(ScanJob, "SCAN-IN-FLIGHT-TEST")
                if job_to_del:
                    await session.delete(job_to_del)
                    await session.commit()


@pytest.mark.asyncio
async def test_scan_cancellation_lifecycle(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # Create an in-flight scan scoped to user
        async with AsyncSessionLocal() as session:
            job = ScanJob(
                id="SCAN-CANCEL-TEST",
                user_id="usr_dpo_001",
                target_url="https://retail-bharat.store",
                status="running",
                progress_stage="running_auth_tests",
                progress_percent=50,
                log_message="Simulating auth tests..."
            )
            session.add(job)
            await session.commit()

        try:
            # Cancel the scan
            cancel_res = await client.post("/api/v1/scans/SCAN-CANCEL-TEST/cancel")
            assert cancel_res.status_code == 200
            cancel_data = cancel_res.json()
            assert cancel_data["scanId"] == "SCAN-CANCEL-TEST"
            assert cancel_data["status"] == "cancelled"
            assert cancel_data["stage"] == "cancelled"
            assert "cancelled by user" in cancel_data["log"].lower()

            # Status endpoint reflects cancelled
            status_res = await client.get("/api/v1/scans/SCAN-CANCEL-TEST/status")
            assert status_res.status_code == 200
            assert status_res.json()["status"] == "cancelled"
        finally:
            async with AsyncSessionLocal() as session:
                del_job = await session.get(ScanJob, "SCAN-CANCEL-TEST")
                if del_job:
                    await session.delete(del_job)
                    await session.commit()


@pytest.mark.asyncio
async def test_active_background_task_cancellation_preserves_terminal_cancelled_status(auth_headers):
    """
    Verifies that cancelling an active in-flight background scan task:
    1. Cancels the underlying asyncio.Task
    2. Persists terminal 'cancelled' status
    3. Prevents background completion logic from overwriting 'cancelled' to 'completed'
    4. Cleans up task registry
    """
    from app.services.scan_service import scan_service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # Create an async scan on paysecure (demo target with simulated delay)
        create_res = await client.post(
            "/api/v1/scans?asyncMode=true",
            json={"targetUrl": "https://paysecure-india.in", "profile": "deep_audit", "asyncMode": True}
        )
        assert create_res.status_code == 201
        scan_id = create_res.json()["id"]

        # Confirm task is registered
        assert scan_id in scan_service._active_scan_tasks

        # Cancel while running
        cancel_res = await client.post(f"/api/v1/scans/{scan_id}/cancel")
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"

        # Wait for any background coroutine yield
        await asyncio.sleep(0.5)

        # Check DB status is permanently 'cancelled'
        status_res = await client.get(f"/api/v1/scans/{scan_id}/status")
        assert status_res.status_code == 200
        assert status_res.json()["status"] == "cancelled"

        # Task registry cleaned up
        assert scan_id not in scan_service._active_scan_tasks


@pytest.mark.asyncio
async def test_security_headers_middleware():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert res.headers.get("X-Content-Type-Options") == "nosniff"
        assert res.headers.get("X-Frame-Options") == "DENY"
        assert res.headers.get("X-XSS-Protection") == "1; mode=block"
        assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


@pytest.mark.asyncio
async def test_settings_get_and_update(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # 1. GET settings
        get_res = await client.get("/api/v1/settings")
        assert get_res.status_code == 200
        data = get_res.json()
        assert "organizationName" in data
        assert "dpoEmail" in data

        # 2. PUT updated settings
        data["organizationName"] = "Updated Bharat Privacy Enterprise Ltd."
        data["scanRateLimit"] = "conservative"
        put_res = await client.put("/api/v1/settings", json=data)
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["organizationName"] == "Updated Bharat Privacy Enterprise Ltd."
        assert updated["scanRateLimit"] == "conservative"

        # 3. GET verifies persistence
        verify_res = await client.get("/api/v1/settings")
        assert verify_res.status_code == 200
        assert verify_res.json()["organizationName"] == "Updated Bharat Privacy Enterprise Ltd."


@pytest.mark.asyncio
async def test_auth_login_success_and_failure():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Invalid login
        bad_res = await client.post(
            "/api/v1/auth/login",
            json={"username": "aditi.deshmukh", "password": "wrong_password"}
        )
        assert bad_res.status_code == 401

        # Valid login with seeded user
        good_res = await client.post(
            "/api/v1/auth/login",
            json={"username": "aditi.deshmukh", "password": "dpdp_guard_demo_2026"}
        )
        assert good_res.status_code == 200
        auth_data = good_res.json()
        assert "accessToken" in auth_data
        assert auth_data["user"]["username"] == "aditi.deshmukh"
        assert auth_data["user"]["role"] == "dpo"

        token = auth_data["accessToken"]

        # Access /auth/me with valid Bearer token
        me_res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_res.status_code == 200
        assert me_res.json()["email"] == "dpo@bharatprivacy.in"

        # Access /auth/me without token
        unauth_res = await client.get("/api/v1/auth/me")
        assert unauth_res.status_code == 401


@pytest.mark.asyncio
async def test_notifications_endpoint(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        res = await client.get("/api/v1/notifications")
        assert res.status_code == 200
        items = res.json()
        assert isinstance(items, list)
        assert len(items) > 0
        first = items[0]
        assert "title" in first
        assert "severity" in first
        assert "timestamp" in first




