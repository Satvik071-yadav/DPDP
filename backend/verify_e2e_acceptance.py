"""
End-to-end acceptance and reliability verification script for DPDP-Guard.
Executes live probes covering all six review areas and outputs structured evidence.
"""
import asyncio
import json
import socket
import threading
import time
import uvicorn
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import engine, Base, AsyncSessionLocal
from app.db.init_db import init_db
from app.models.entities import ScanJob, FindingModel, BrowserObservationModel, AuditRecordModel
from app.services.scan_service import scan_service, get_scan_semaphore
from app.services.verification_service import verification_service
from app.core.redaction import redact_text
from sqlalchemy import select


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


async def run_full_acceptance_verification():
    port = find_free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    await asyncio.sleep(1.2)
    base_url = f"http://127.0.0.1:{port}"

    results = {}

    try:
        # Initialize database
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await init_db()

        async with AsyncClient(base_url=base_url, timeout=30.0) as client:
            # 1. Health & Database Readiness
            health_res = await client.get("/api/health")
            results["health_check"] = {
                "statusCode": health_res.status_code,
                "body": health_res.json()
            }

            # 2. Complete User Workflow: Submit live testbed scan
            testbed_url = f"{base_url}/testbed"
            create_scan_res = await client.post(
                "/api/v1/scans",
                json={
                    "targetUrl": testbed_url,
                    "profile": "privacy_audit",
                    "consentModeEnabled": True,
                    "asyncMode": False
                }
            )
            results["scan_creation"] = {
                "statusCode": create_scan_res.status_code,
                "scan": create_scan_res.json()
            }
            scan_id = create_scan_res.json()["id"]

            # 3. Status endpoint verification
            status_res = await client.get(f"/api/v1/scans/{scan_id}/status")
            results["scan_status"] = {
                "statusCode": status_res.status_code,
                "body": status_res.json()
            }

            # 4. Check Observations & Findings (No fixtures substituted)
            obs_res = await client.get(f"/api/v1/scans/{scan_id}/observations")
            findings_res = await client.get(f"/api/v1/scans/{scan_id}/findings")
            obs_data = obs_res.json()
            findings_data = findings_res.json()

            results["observations_and_findings"] = {
                "observationsCount": len(obs_data),
                "findingsCount": len(findings_data),
                "observationsSample": obs_data[:3],
                "findings": findings_data,
                "zeroFixturesConfirmed": not any("paysecure" in json.dumps(f).lower() for f in findings_data)
            }

            # 5. Scan History Check
            history_res = await client.get("/api/v1/scans")
            history_data = history_res.json()
            scan_in_history = any(s["id"] == scan_id for s in history_data)
            results["scan_history"] = {
                "totalScans": len(history_data),
                "scanPersisted": scan_in_history
            }

            # 6. Copilot Analysis with Redacted Evidence
            finding_to_analyze = findings_data[0] if findings_data else None
            if finding_to_analyze:
                copilot_req = {
                    "findingContext": {
                        "findingId": finding_to_analyze["id"],
                        "title": finding_to_analyze["title"],
                        "severity": finding_to_analyze["severity"],
                        "category": finding_to_analyze["category"],
                        "confidence": finding_to_analyze["confidence"],
                        "affectedUrl": finding_to_analyze["affectedUrl"],
                        "endpoint": finding_to_analyze["endpoint"],
                        "dpdpSection": finding_to_analyze["dpdpSection"],
                        "observedEvidence": {
                            "sanitizedPayload": "Account customer PAN: ABCDE1234F token=sec_live_99238"
                        },
                        "remediationSteps": ["Implement strict object authorization"]
                    },
                    "messages": [
                        {"role": "user", "content": "How does PAN ABCDE1234F impact compliance?"}
                    ]
                }
                copilot_res = await client.post("/api/v1/copilot/chat", json=copilot_req)
                results["copilot_analysis"] = {
                    "statusCode": copilot_res.status_code,
                    "response": copilot_res.json()
                }

            # 7. Fix & Verify: Vulnerable (FAIL) Probe
            verify_vuln_res = await client.post(
                "/api/v1/findings/DPDP-HIGH-007/verify",
                json={
                    "isPatched": False,
                    "callerIdentity": "usr_demo_custA",
                    "targetCustomerId": "usr_demo_custB"
                }
            )
            results["fix_verify_vulnerable"] = {
                "statusCode": verify_vuln_res.status_code,
                "body": verify_vuln_res.json()
            }

            # 8. Fix & Verify: Patched (PASS) Probe
            verify_patch_res = await client.post(
                "/api/v1/findings/DPDP-HIGH-007/verify",
                json={
                    "isPatched": True,
                    "callerIdentity": "usr_demo_custA",
                    "targetCustomerId": "usr_demo_custB"
                }
            )
            results["fix_verify_patched"] = {
                "statusCode": verify_patch_res.status_code,
                "body": verify_patch_res.json()
            }

            # 9. Audit History Persistence
            audit_res = await client.get("/api/v1/findings/verification/audit-history")
            results["audit_history"] = {
                "statusCode": audit_res.status_code,
                "recordCount": len(audit_res.json()),
                "records": audit_res.json()[:2]
            }

            # 10. Failure & Cancellation Paths
            # A: Duplicate scan submission prevention (409)
            async with AsyncSessionLocal() as session:
                dummy_job = ScanJob(
                    id="SCAN-DUP-TEST",
                    target_url="https://paysecure-india.in",
                    status="running",
                    progress_stage="inspecting_network",
                    progress_percent=60,
                    log_message="Scanning..."
                )
                session.add(dummy_job)
                await session.commit()

            dup_res = await client.post(
                "/api/v1/scans",
                json={"targetUrl": "https://paysecure-india.in", "profile": "privacy_audit"}
            )
            results["duplicate_prevention_409"] = {
                "statusCode": dup_res.status_code,
                "detail": dup_res.json().get("detail")
            }

            # Clean dummy job
            async with AsyncSessionLocal() as session:
                dj = await session.get(ScanJob, "SCAN-DUP-TEST")
                if dj:
                    await session.delete(dj)
                    await session.commit()

            # B: Prohibited target (unauthorized external target)
            unauth_res = await client.post(
                "/api/v1/scans",
                json={"targetUrl": "https://attacker.evil.com", "profile": "privacy_audit"}
            )
            results["unauthorized_target_rejected"] = {
                "statusCode": unauth_res.status_code,
                "detail": unauth_res.json().get("detail")
            }

            # C: Cloud metadata SSRF target
            metadata_res = await client.post(
                "/api/v1/scans",
                json={"targetUrl": "http://169.254.169.254/latest/meta-data/", "profile": "privacy_audit"}
            )
            results["metadata_ssrf_blocked"] = {
                "statusCode": metadata_res.status_code,
                "detail": metadata_res.json().get("detail")
            }

    finally:
        server.should_exit = True

    print("ALL_E2E_VERIFICATION_RESULTS_JSON_START")
    print(json.dumps(results, indent=2, default=str))
    print("ALL_E2E_VERIFICATION_RESULTS_JSON_END")


if __name__ == "__main__":
    asyncio.run(run_full_acceptance_verification())
