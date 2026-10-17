from typing import Dict, Any, Tuple
from app.db.fixtures import (
    SYNTHETIC_ACCOUNT_A,
    SYNTHETIC_ACCOUNT_B,
    SYNTHETIC_KYC_RECORD_B
)


def run_synthetic_customer_kyc_endpoint(
    customer_id: str,
    auth_header: str,
    is_patched: bool
) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
    """
    Controlled authorization test fixture.
    Simulates:
    - Vulnerable route: Returns Account B's record regardless of caller auth identity (BOLA/IDOR).
    - Corrected route: Verifies that caller token matches requested customer_id or returns 403 Forbidden.
    """
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "X-DPDP-Test-Fixture": "true"
    }

    # Validate auth token format
    if not auth_header or not auth_header.startswith("Bearer "):
        return 401, {"error": "Unauthorized", "message": "Missing or malformed Authorization header."}, headers

    # Extract principal from synthetic token
    caller_id = None
    if "demo_token_rajesh" in auth_header or "usr_demo_custA" in auth_header:
        caller_id = SYNTHETIC_ACCOUNT_A["id"]
    elif "demo_token_priya" in auth_header or "usr_demo_custB" in auth_header:
        caller_id = SYNTHETIC_ACCOUNT_B["id"]
    else:
        caller_id = "usr_unknown"

    # If vulnerable (unpatched)
    if not is_patched:
        # BOLA flaw: Does not check caller_id == customer_id!
        if customer_id == SYNTHETIC_ACCOUNT_B["id"]:
            return 200, dict(SYNTHETIC_KYC_RECORD_B), headers
        return 404, {"error": "Not Found", "message": "Customer record not found."}, headers

    # If patched: Strict Object-Level Authorization Check
    headers["X-DPDP-Guard-Enforced"] = "true"
    if caller_id != customer_id:
        return 403, {
            "error": "Forbidden",
            "code": "DPDP_AUTH_OBJECT_MISMATCH",
            "message": f"Access Denied: Principal '{caller_id}' is not authorized to access customer record '{customer_id}'. Incident logged to DPDP audit trail.",
            "incidentRef": "INC-DPDP-2026-8819"
        }, headers

    if customer_id == SYNTHETIC_ACCOUNT_B["id"]:
        return 200, dict(SYNTHETIC_KYC_RECORD_B), headers
    return 404, {"error": "Not Found", "message": "Customer record not found."}, headers
