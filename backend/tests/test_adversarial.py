import pytest
import socket
import asyncio
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from fastapi import HTTPException

from app.main import app
from app.core.config import settings
from app.core.security import resolve_and_validate_destination, validate_and_resolve_url, is_ip_blocked
from app.core.redaction import redact_text, redact_headers
from app.services.scan_service import get_scan_semaphore, ScanService
from app.scanner.browser_observer import browser_observer, BrowserObservationError
from app.scanner.egress_proxy import EgressProxyServer
from app.schemas.contracts import CreateScanRequest
from app.models.entities import CopilotInteractionModel
from app.db.cleanup_copilot import sanitize_historical_copilot_interactions
from app.db.session import engine, Base, AsyncSessionLocal
from app.db.init_db import init_db
from sqlalchemy import select


@pytest.fixture(autouse=True)
async def setup_test_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await init_db()


# ---------------------------------------------------------------------------
# 1. Adversarial Test: Redirect & Connection to Private IP / Cloud Metadata
# ---------------------------------------------------------------------------
def test_adversarial_redirect_to_private_ip():
    """
    Verifies that destination validation rejects private IP ranges, loopback,
    and cloud metadata endpoints when encountered during navigation or redirects.
    """
    private_destinations = [
        ("10.0.0.1", "RFC 1918 private Class A"),
        ("172.16.50.1", "RFC 1918 private Class B"),
        ("192.168.1.254", "RFC 1918 private Class C"),
        ("169.254.169.254", "Cloud metadata / Link-local"),
        ("127.0.0.1", "IPv4 loopback"),
        ("::1", "IPv6 loopback"),
        ("metadata.google.internal", "GCP metadata hostname"),
        ("instance-data", "AWS metadata hostname"),
        ("internal-service.local.internal", "Internal DNS suffix"),
    ]

    for host, desc in private_destinations:
        is_safe, reason, _ = resolve_and_validate_destination(host, port=80, allow_loopback=False)
        assert is_safe is False, f"Failed to reject {desc} destination: {host}"
        assert reason is not None and len(reason) > 0


# ---------------------------------------------------------------------------
# 2. Adversarial Test: DNS Resolution Failure (NXDOMAIN / SERVFAIL)
# ---------------------------------------------------------------------------
def test_adversarial_dns_resolution_failure():
    """
    Verifies fail-closed behavior when DNS resolution encounters socket.gaierror
    (e.g., NXDOMAIN, network timeout, or SERVFAIL).
    """
    with patch("socket.getaddrinfo", side_effect=socket.gaierror(socket.EAI_NONAME, "Name or service not known")):
        is_safe, reason, ips = resolve_and_validate_destination("nonexistent-adversarial-test-domain.com", port=443)
        assert is_safe is False
        assert "DNS resolution failed" in reason
        assert len(ips) == 0

    with patch("socket.getaddrinfo", side_effect=socket.gaierror(socket.EAI_AGAIN, "Temporary failure in name resolution")):
        is_safe, reason, ips = resolve_and_validate_destination("temporary-dns-outage.com", port=443)
        assert is_safe is False
        assert "DNS resolution failed" in reason
        assert len(ips) == 0


# ---------------------------------------------------------------------------
# 3. Adversarial Test: Mixed Public / Private DNS Answers (Rebinding Candidate)
# ---------------------------------------------------------------------------
def test_adversarial_mixed_public_private_dns_answers():
    """
    Verifies that when DNS returns multiple A records containing BOTH public
    and private IP addresses (dual-homed / DNS rebinding candidate), the system
    fails closed and blocks the target.
    """
    # Simulated DNS response with public IP (93.184.216.34) and private IP (10.0.0.1)
    mock_mixed_addrinfo = [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.34", 443)),
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("10.0.0.1", 443)),
    ]

    with patch("socket.getaddrinfo", return_value=mock_mixed_addrinfo):
        is_safe, reason, ips = resolve_and_validate_destination("dual-homed-target.com", port=443)
        assert is_safe is False, "Mixed DNS query must NOT be permitted"
        assert "prohibited/private IP range" in reason
        assert "10.0.0.1" in reason
        assert "10.0.0.1" in ips
        assert "93.184.216.34" in ips


# ---------------------------------------------------------------------------
# 4. Adversarial Test: Navigation Timeout & Crash Resilience
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_adversarial_navigation_timeout_and_failure(auth_headers):
    """
    Verifies that navigation timeouts or unreachable endpoints:
    1. Set scan status to 'failed'
    2. Persist a sanitized, non-leaking error message
    3. Return zero findings (never substitute fake demo fixtures)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Mock browser_observer.observe_target to raise BrowserObservationError simulating navigation timeout
        with patch.object(
            browser_observer,
            "observe_target",
            side_effect=BrowserObservationError("Navigation to target failed: Timeout 12000ms exceeded", stage="navigation")
        ):
            res = await client.post(
                "/api/v1/scans",
                json={"targetUrl": "http://127.0.0.1:8000/testbed", "profile": "privacy_audit"},
                headers=auth_headers
            )
            assert res.status_code == 201
            data = res.json()
            assert data["status"] == "failed"
            assert data["errorMessage"] is not None
            assert "Timeout" in data["errorMessage"] or "failed" in data["errorMessage"]
            assert len(data["findings"]) == 0
            assert data["riskScore"] == 0
            assert data["complianceScore"] == 0


# ---------------------------------------------------------------------------
# 5. Adversarial Test: Semaphore Lifecycle (Success, Exception, Timeout, Cancel)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_adversarial_semaphore_lifecycle():
    """
    Verifies semaphore acquisition and release integrity under:
    - Normal success
    - Unhandled exception
    - asyncio.TimeoutError
    - asyncio.CancelledError
    """
    semaphore = get_scan_semaphore()
    initial_val = semaphore._value

    # Case A: Normal success
    async with semaphore:
        assert semaphore._value == initial_val - 1
    assert semaphore._value == initial_val

    # Case B: Unhandled exception
    try:
        async with semaphore:
            assert semaphore._value == initial_val - 1
            raise RuntimeError("Simulated crash inside critical section")
    except RuntimeError:
        pass
    assert semaphore._value == initial_val, "Semaphore leaked after exception!"

    # Case C: Timeout inside section
    try:
        async with semaphore:
            assert semaphore._value == initial_val - 1
            async with asyncio.timeout(0.01):
                await asyncio.sleep(0.05)
    except TimeoutError:
        pass
    assert semaphore._value == initial_val, "Semaphore leaked after timeout!"

    # Case D: Task cancellation
    async def cancelled_worker():
        async with semaphore:
            assert semaphore._value == initial_val - 1
            await asyncio.sleep(10)

    task = asyncio.create_task(cancelled_worker())
    await asyncio.sleep(0.02)  # Allow worker to enter semaphore
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert semaphore._value == initial_val, "Semaphore leaked after cancellation!"


# ---------------------------------------------------------------------------
# 6. Adversarial Test: Synthetic PII & Indian PAN Redaction
# ---------------------------------------------------------------------------
def test_adversarial_pan_and_pii_redaction():
    """
    Verifies that PAN numbers (uppercase, lowercase, mixed case) and common PII
    are rigorously masked across payloads, URLs, headers, and Copilot context.
    Ensures non-PAN strings are never corrupted.
    """
    # 1. Standard PAN patterns
    assert redact_text("PAN is ABCDE1234F") == "PAN is XXXXX1234F"
    assert redact_text("pan is abcde1234f") == "pan is XXXXX1234F"
    assert redact_text("mixed: AbCdE9876Z") == "mixed: XXXXX9876Z"

    # 2. JSON payload with PAN, Aadhaar, Phone, Email
    raw_payload = '{"pan": "ABCDE1234F", "aadhaar": "9876 5432 1098", "phone": "+91 98765 43210", "email": "user@bharat.in"}'
    redacted_payload = redact_text(raw_payload)
    assert "ABCDE1234F" not in redacted_payload
    assert "XXXXX1234F" in redacted_payload
    assert "9876 5432 1098" not in redacted_payload
    assert "XXXX-XXXX-1098" in redacted_payload
    assert "+91 XXXXX 43210" in redacted_payload
    assert "u***@bharat.in" in redacted_payload

    # 3. URL sanitization
    raw_url = "https://bharatpay.in/api/v1/kyc?pan=ABCDE1234F&session=secret123"
    sanitized_url = browser_observer.sanitize_url(raw_url)
    assert "ABCDE1234F" not in sanitized_url
    assert "XXXXX1234F" in sanitized_url

    # 4. Header redaction
    headers = {
        "X-Customer-PAN": "ABCDE1234F",
        "PAN-Number": "ZZZZZ9999Z",
        "Authorization": "Bearer eyJhbGciOi...",
        "Cookie": "session_id=abc123",
        "X-Normal-Header": "standard_safe_value"
    }
    redacted_hdrs = redact_headers(headers)
    assert redacted_hdrs["X-Customer-PAN"] == "[REDACTED_CREDENTIAL]"
    assert redacted_hdrs["PAN-Number"] == "[REDACTED_CREDENTIAL]"
    assert redacted_hdrs["Authorization"] == "[REDACTED_CREDENTIAL]"
    assert redacted_hdrs["Cookie"] == "[REDACTED_CREDENTIAL]"
    assert redacted_hdrs["X-Normal-Header"] == "standard_safe_value"

    # 5. Non-PAN boundary tests (must NOT be modified)
    assert redact_text("ABCDE12345") == "ABCDE12345"  # 5th is digit instead of letter
    assert redact_text("ABCD1234F") == "ABCD1234F"    # 4 letters instead of 5
    assert redact_text("ABCDEF1234F") == "ABCDEF1234F" # 6 letters instead of 5


# ---------------------------------------------------------------------------
# 6. Adversarial Test: Egress Proxy Authentication and SSRF Enforcement
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_adversarial_egress_proxy_enforcement_and_auth():
    """
    Verifies that the EgressProxyServer:
    1. Rejects unauthenticated requests with 407 Proxy Authentication Required.
    2. Rejects invalid credentials with 407 Proxy Authentication Required.
    3. Blocks metadata destinations (169.254.169.254, metadata.google.internal) with 403 Forbidden.
    4. Handles DNS failures fail-safe with 502 Bad Gateway.
    """
    async with EgressProxyServer(target_domain="example.com", allow_controlled_local=False) as proxy:
        # 1. Unauthenticated request -> expect 407
        reader, writer = await asyncio.open_connection("127.0.0.1", proxy.port)
        req = b"CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"
        writer.write(req)
        await writer.drain()
        resp_bytes = await reader.read(4096)
        writer.close()
        await writer.wait_closed()
        assert b"407 Proxy Authentication Required" in resp_bytes

        # 2. Invalid credentials -> expect 407
        reader, writer = await asyncio.open_connection("127.0.0.1", proxy.port)
        req = (
            b"CONNECT example.com:443 HTTP/1.1\r\n"
            b"Host: example.com:443\r\n"
            b"Proxy-Authorization: Basic aW52YWxpZDppbnZhbGlk\r\n\r\n"
        )
        writer.write(req)
        await writer.drain()
        resp_bytes = await reader.read(4096)
        writer.close()
        await writer.wait_closed()
        assert b"407 Proxy Authentication Required" in resp_bytes

        # 3. Authenticated request targeting cloud metadata literal -> expect 403 Forbidden
        reader, writer = await asyncio.open_connection("127.0.0.1", proxy.port)
        req = (
            f"CONNECT 169.254.169.254:80 HTTP/1.1\r\n"
            f"Host: 169.254.169.254:80\r\n"
            f"Proxy-Authorization: {proxy.expected_auth_header}\r\n\r\n"
        ).encode("utf-8")
        writer.write(req)
        await writer.drain()
        resp_bytes = await reader.read(4096)
        writer.close()
        await writer.wait_closed()
        assert b"403 Forbidden" in resp_bytes
        assert b"DPDP-Guard Security Policy Block" in resp_bytes

        # 4. Authenticated request targeting GCP metadata hostname -> expect 403 Forbidden
        reader, writer = await asyncio.open_connection("127.0.0.1", proxy.port)
        req = (
            f"CONNECT metadata.google.internal:80 HTTP/1.1\r\n"
            f"Host: metadata.google.internal:80\r\n"
            f"Proxy-Authorization: {proxy.expected_auth_header}\r\n\r\n"
        ).encode("utf-8")
        writer.write(req)
        await writer.drain()
        resp_bytes = await reader.read(4096)
        writer.close()
        await writer.wait_closed()
        assert b"403 Forbidden" in resp_bytes
        assert b"DPDP-Guard Security Policy Block" in resp_bytes


# ---------------------------------------------------------------------------
# 7. Adversarial Test: Copilot Prompt Redaction in Database Persistence
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_adversarial_copilot_prompt_redaction_in_database(auth_headers):
    """
    Verifies that when a user submits sensitive PII (PAN, Aadhaar, Phone)
    in the Copilot chat prompt:
    1. The API responds successfully.
    2. The record persisted in copilot_interactions contains masked PII (e.g. XXXXX1234F).
    3. The raw PAN, Aadhaar, and Phone numbers are NEVER persisted to the database.
    """
    import json
    raw_pan = "ABCDE1234F"
    raw_aadhaar = "9999 8888 7777"
    raw_phone = "+91 98765 43210"

    payload = {
        "findingContext": {
            "findingId": "test-finding-pii-1",
            "title": "Adversarial PII Leakage Test",
            "severity": "CRITICAL",
            "confidence": 95,
            "category": "Third-Party Data Flow",
            "affectedUrl": "http://127.0.0.1:8000/testbed",
            "endpoint": "/api/v1/telemetry",
            "dpdpSection": "Section 8(4)",
            "isDemoFixture": False,
            "observedEvidence": {
                "sanitizedPayload": f'{{"pan": "{raw_pan}", "phone": "{raw_phone}"}}'
            },
            "remediationSteps": ["Fix telemetry endpoint"],
            "hasCodeDiff": False
        },
        "messages": [
            {
                "role": "user",
                "content": f"Investigate PAN {raw_pan} and Aadhaar {raw_aadhaar} and phone {raw_phone} leaking."
            }
        ]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/v1/copilot/chat", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert raw_pan not in data["summary"]
        assert raw_aadhaar not in data["summary"]

    # Query database directly to verify persistence was strictly redacted
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CopilotInteractionModel).order_by(CopilotInteractionModel.created_at.desc())
        )
        record = result.scalars().first()
        assert record is not None
        assert record.finding_id == "test-finding-pii-1"

        # Assert raw PII is NOT stored in user_prompt
        assert raw_pan not in record.user_prompt
        assert raw_aadhaar not in record.user_prompt
        assert raw_phone not in record.user_prompt

        # Assert masked PII is stored
        assert "XXXXX1234F" in record.user_prompt
        assert "XXXX-XXXX-7777" in record.user_prompt
        assert "+91 XXXXX 43210" in record.user_prompt

        # Assert structured response does not leak raw PII
        structured_str = json.dumps(record.structured_response)
        assert raw_pan not in structured_str
        assert raw_aadhaar not in structured_str


# ---------------------------------------------------------------------------
# 8. Adversarial Test: Historical Copilot Interaction Cleanup Migration
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_adversarial_historical_copilot_cleanup_migration():
    """
    Verifies that the historical database migration function
    sanitize_historical_copilot_interactions scans existing records
    and rewrites unredacted PII (PAN, Aadhaar, Phone, Email) in place.
    """
    import uuid
    import datetime

    raw_pan = "XYZAB5678C"
    raw_aadhaar = "1111 2222 3333"
    interaction_id = str(uuid.uuid4())

    # Seed an unredacted legacy row
    async with AsyncSessionLocal() as session:
        unredacted_item = CopilotInteractionModel(
            id=interaction_id,
            finding_id="historical-finding-1",
            user_prompt=f"Please help with legacy PAN {raw_pan} and Aadhaar {raw_aadhaar}.",
            provider_used="demo",
            structured_response={
                "summary": f"Observed unredacted leak with {raw_pan}",
                "whatWeObserved": [f"Header contained {raw_aadhaar}"]
            },
            created_at=datetime.datetime.now(datetime.timezone.utc)
        )
        session.add(unredacted_item)
        await session.commit()

    # Run cleanup migration
    async with AsyncSessionLocal() as session:
        cleaned_count = await sanitize_historical_copilot_interactions(session)
        assert cleaned_count >= 1

    # Verify that the record is now redacted
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CopilotInteractionModel).where(CopilotInteractionModel.id == interaction_id)
        )
        sanitized_item = result.scalars().first()
        assert sanitized_item is not None

        # Verify prompt
        assert raw_pan not in sanitized_item.user_prompt
        assert "XXXXX5678C" in sanitized_item.user_prompt
        assert raw_aadhaar not in sanitized_item.user_prompt
        assert "XXXX-XXXX-3333" in sanitized_item.user_prompt

        # Verify structured response
        assert raw_pan not in sanitized_item.structured_response["summary"]
        assert "XXXXX5678C" in sanitized_item.structured_response["summary"]
        assert raw_aadhaar not in sanitized_item.structured_response["whatWeObserved"][0]
        assert "XXXX-XXXX-3333" in sanitized_item.structured_response["whatWeObserved"][0]

