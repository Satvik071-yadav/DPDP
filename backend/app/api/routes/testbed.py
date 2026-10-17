from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from app.core.config import settings


def verify_testbed_enabled():
    if not settings.is_testbed_enabled:
        raise HTTPException(
            status_code=403,
            detail="Controlled testbed endpoints are disabled in production environment."
        )


router = APIRouter(
    prefix="/testbed",
    tags=["Testbed"],
    dependencies=[Depends(verify_testbed_enabled)]
)


@router.get("", response_class=HTMLResponse)
async def testbed_index():
    """
    Controlled local testbed simulating an e-commerce / fintech checkout flow.
    Contains predictable network behaviors:
    1. Core first-party API calls (/testbed/api/cart)
    2. Optional third-party tracker (/testbed/tracker.js) firing conditionally based on DPDP consent state
    3. Synthetic non-PII form fields
    """
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>BharatPay Sandbox - Controlled Testbed</title>
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; }
            .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; max-width: 600px; margin: auto; }
            .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 0.5rem; }
            .btn-accept { background: #10b981; color: white; }
            .btn-reject { background: #ef4444; color: white; }
            #banner { border: 1px solid #334155; padding: 1rem; margin-bottom: 1rem; border-radius: 6px; }
            #status { font-family: monospace; color: #38bdf8; margin-top: 1rem; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>BharatPay Controlled Testbed</h2>
            <p>Simulating consent-dependent third-party network dispatch.</p>

            <div id="banner">
                <p><strong>DPDP Act 2023 Notice:</strong> We collect operational telemetry. Do you accept marketing tracking?</p>
                <button id="btn-accept" class="btn btn-accept" onclick="acceptConsent()">Accept Marketing</button>
                <button id="btn-reject" class="btn btn-reject" onclick="rejectConsent()">Reject Marketing</button>
            </div>

            <div id="status">Consent status: BEFORE_CONSENT</div>
        </div>

        <script>
            // Always dispatch baseline first-party session check
            fetch('/testbed/api/session', { method: 'GET' })
                .then(r => r.json())
                .then(d => console.log('Session initialized:', d));

            function acceptConsent() {
                document.getElementById('status').innerText = 'Consent status: CONSENT_ACCEPTED';
                // Third-party telemetry dispatched only upon explicit consent
                fetch('/testbed/api/analytics?source=third_party_ad_network&event=opt_in', { method: 'POST' });
            }

            function rejectConsent() {
                document.getElementById('status').innerText = 'Consent status: CONSENT_REJECTED';
                // Non-consensual tracking avoided; only dispatch local opt-out receipt
                fetch('/testbed/api/optout-receipt', { method: 'POST' });
            }
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


@router.get("/api/session")
async def testbed_session():
    return {"status": "active", "service": "bharatpay-core", "party": "first_party"}


@router.post("/api/analytics")
async def testbed_analytics():
    return {"status": "recorded", "destination": "analytics-telemetry-grid.in", "party": "third_party"}


@router.post("/api/optout-receipt")
async def testbed_optout():
    return {"status": "opted_out", "party": "first_party"}


# ---------------------------------------------------------------------------
# Controlled Synthetic KYC Customer Endpoints (BOLA / IDOR Verification)
# Clearly documented under /testbed/api/v1/customers/...
# Isolated, synthetic, and inaccessible to unauthorized external targets.
# ---------------------------------------------------------------------------
from typing import Optional, Dict, Any
from fastapi import Header, Query, Request
from fastapi.responses import JSONResponse
from app.db.fixtures import (
    SYNTHETIC_ACCOUNT_A,
    SYNTHETIC_ACCOUNT_B,
    SYNTHETIC_KYC_RECORD_B
)

_testbed_customer_state = {"is_patched": False}


@router.get("/api/v1/customers/state")
async def get_testbed_customer_state():
    """Returns current default synthetic patch state for the testbed."""
    return {"is_patched": _testbed_customer_state["is_patched"]}


@router.post("/api/v1/customers/state")
async def set_testbed_customer_state(payload: Dict[str, Any]):
    """Configures the server-side synthetic patch state for controlled verification."""
    _testbed_customer_state["is_patched"] = bool(payload.get("is_patched", False))
    return {
        "status": "updated",
        "is_patched": _testbed_customer_state["is_patched"],
        "note": "Controlled testbed state only. Does not alter external infrastructure."
    }


@router.get("/api/v1/customers/{customer_id}/kyc-record")
async def get_testbed_customer_kyc(
    customer_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    x_testbed_patched: Optional[str] = Header(None),
    is_patched: Optional[bool] = Query(None)
):
    """
    Controlled synthetic KYC customer endpoint.
    Simulates:
    - Vulnerable state: Returns Account B's record regardless of caller auth identity (BOLA/IDOR).
    - Patched state: Strictly denies cross-tenant access with HTTP 403 Forbidden and zero PII.
    Headers explicitly mark synthetic testbed provenance: X-DPDP-Synthetic-Testbed: true.
    """
    # Determine effective patch state: query parameter overrides header overrides server state
    if is_patched is not None:
        effective_patched = is_patched
    elif x_testbed_patched is not None:
        effective_patched = x_testbed_patched.strip().lower() in ("true", "1")
    else:
        effective_patched = _testbed_customer_state["is_patched"]

    base_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "X-DPDP-Synthetic-Testbed": "true",
        "X-DPDP-Test-Fixture": "true"
    }

    # Validate auth token format
    if not authorization or not authorization.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={
                "error": "Unauthorized",
                "message": "Missing or malformed Authorization header. Bearer token required."
            },
            headers=base_headers
        )

    # Extract principal from synthetic bearer token
    token = authorization.strip()
    caller_id = None
    if "demo_token_rajesh" in token or "usr_demo_custA" in token:
        caller_id = SYNTHETIC_ACCOUNT_A["id"]
    elif "demo_token_priya" in token or "usr_demo_custB" in token:
        caller_id = SYNTHETIC_ACCOUNT_B["id"]
    else:
        caller_id = "usr_unknown"

    # Scenario 1: Vulnerable state (BOLA/IDOR flaw)
    if not effective_patched:
        # Vulnerability: Does not verify that caller_id matches requested customer_id
        if customer_id == SYNTHETIC_ACCOUNT_B["id"]:
            headers = dict(base_headers)
            headers["X-DPDP-Vulnerability"] = "BOLA_ACTIVE"
            return JSONResponse(
                status_code=200,
                content=dict(SYNTHETIC_KYC_RECORD_B),
                headers=headers
            )
        return JSONResponse(
            status_code=404,
            content={"error": "Not Found", "message": f"Customer '{customer_id}' not found."},
            headers=base_headers
        )

    # Scenario 2: Patched state (Strict object-level authorization check)
    headers = dict(base_headers)
    headers["X-DPDP-Guard-Enforced"] = "true"

    if caller_id != customer_id:
        # Cross-tenant access denied: ZERO customer PII returned
        return JSONResponse(
            status_code=403,
            content={
                "error": "Forbidden",
                "code": "DPDP_AUTH_OBJECT_MISMATCH",
                "message": f"Access Denied: Principal '{caller_id}' is not authorized to access customer record '{customer_id}'. Incident logged to DPDP audit trail.",
                "incidentRef": "INC-DPDP-2026-8819"
            },
            headers=headers
        )

    # Authorized access (caller requested own record)
    if customer_id == SYNTHETIC_ACCOUNT_B["id"]:
        return JSONResponse(
            status_code=200,
            content=dict(SYNTHETIC_KYC_RECORD_B),
            headers=headers
        )

    return JSONResponse(
        status_code=404,
        content={"error": "Not Found", "message": f"Customer '{customer_id}' not found."},
        headers=headers
    )

