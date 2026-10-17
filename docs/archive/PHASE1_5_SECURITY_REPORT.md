# Phase 1.5 Security & Reliability Audit Report

**Project:** DPDP-Guard (`D:\DPDP`)  
**Date:** 2026-10-16  
**Auditor / Engineer:** Senior Full-Stack & Application Security Engineer  
**Status:** ALL PHASE 1.5 DEFECTS REMEDIATED & VERIFIED (23/23 Tests Passed, Production Build Clean)

---

## Executive Summary

Phase 1.5 of the DPDP-Guard hardening program successfully resolved the critical security exposures documented in `PHASE1_REVIEW_REPORT.md`:
1. **SSRF and DNS Rebinding (TOCTOU Mitigation):** Playwright Chromium previously resolved DNS independently of the Python application's request interception. We introduced an in-process, authenticated loopback forward proxy (`EgressProxyServer`) with **connection-time IP pinning**. Every outbound TCP socket connection opened by the browser is routed through the proxy, where DNS is resolved, validated against blocked CIDRs/metadata endpoints, and explicitly pinned to numerical IP literals at connection time.
2. **Copilot Prompt Redaction & Database Persistence Sanitization:** Previously, user prompts in the AI Investigation Copilot were persisted directly to `copilot_interactions.user_prompt` prior to redaction, exposing PII (PAN, Aadhaar, phone numbers) to database storage. We instituted pre-persistence prompt redaction, context sanitization, and an automatic historical data cleanup migration (`sanitize_historical_copilot_interactions`) executed on application initialization.
3. **Automated Verification:** Added adversarial regression tests proving egress proxy authentication challenges, SSRF blocks against cloud metadata and RFC 1918 networks, Copilot database sanitization, and historical DB record migration. All 23 backend tests passed and the React/TypeScript frontend built cleanly.

---

## 1. Architectural Changes

### 1.1 In-Process Egress Forward Proxy (`EgressProxyServer`)
- **Location:** `backend/app/scanner/egress_proxy.py`
- **Socket Binding:** Binds strictly to IPv4 loopback (`127.0.0.1`) on an ephemeral port (`port=0`), isolated to the local scanner instance.
- **Per-Session Authentication:** Generates a cryptographically random token (`secrets.token_urlsafe(24)`). Every request from the browser requires `Proxy-Authorization: Basic <credentials>`. Unauthenticated or invalid requests receive `HTTP/1.1 407 Proxy Authentication Required` and are immediately closed.
- **Connection-Time IP Pinning:**
  - For HTTPS traffic (`CONNECT host:port`) and plain HTTP traffic (`GET/POST http://host/path`), the proxy resolves all A and AAAA DNS records.
  - If any resolved IP belongs to a blocked subnet (RFC 1918, RFC 3927 link-local, cloud metadata `169.254.169.254`, GCP/AWS metadata hostnames) or fails DNS resolution, the request is terminated with `403 Forbidden` or `502 Bad Gateway`.
  - The proxy opens the outbound TCP socket directly to the validated numerical IP literal (`asyncio.open_connection(pinned_ip, dest_port)`), preventing DNS rebinding TOCTOU attacks between check and connection time.
- **Browser Launch Configuration (`browser_observer.py`):**
  - Configures Playwright `browser.new_context` with `proxy={"server": proxy.proxy_url, "username": ..., "password": ...}`.
  - Passes `--proxy-bypass-list=<-loopback>` in Chromium launch arguments, ensuring that Chromium cannot bypass the proxy even when accessing local testbed endpoints.
  - Removed the unsafe, long-lived `dest_cache`.

### 1.2 Copilot Prompt Redaction Pipeline
- **Location:** `backend/app/api/routes/copilot.py`
- Before storing user queries in `CopilotInteractionModel.user_prompt`, `redact_text()` is applied.
- PAN (`[A-Z]{5}[0-9]{4}[A-Z]{1}`), Aadhaar (`\b\d{4}\s\d{4}\s\d{4}\b`), phone numbers, emails, JWT tokens, and API credentials are substituted with masked representations (e.g. `XXXXX1234F`, `XXXX-XXXX-7777`, `+91 XXXXX 43210`) prior to database insertion.
- Evidence payload, endpoint URL, and affected URL contexts are sanitized before analytical prompt construction.

### 1.3 Historical Data Cleanup Migration
- **Location:** `backend/app/db/cleanup_copilot.py` & `backend/app/db/init_db.py`
- `sanitize_historical_copilot_interactions(session)` queries all records in `copilot_interactions`, recursively inspects `user_prompt` and `structured_response` JSON structures, applies redaction in-place, and commits changes.
- Automatically invoked during database initialization (`init_db()`) on FastAPI startup.

---

## 2. Verified Controls Matrix

| Control | Target / Threat | Defense Mechanism | Verified Outcome |
| :--- | :--- | :--- | :--- |
| **SSRF / Metadata Protection** | `169.254.169.254`, `metadata.google.internal`, `instance-data` | `EgressProxyServer` destination policy blocks metadata literals & suffixes | **PASS** (403 Forbidden with security policy block) |
| **Private IP Isolation** | RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) | Outbound IP validation rejects private ranges unless controlled testbed explicitly enabled | **PASS** (Rejected at proxy and resolver layer) |
| **DNS Rebinding (TOCTOU)** | Dual-homed DNS / TTL expiry between check and connection | Connection-time IP literal socket pinning in proxy | **PASS** (Outbound sockets connect to validated numerical IP) |
| **Open Proxy Prevention** | Rogue local processes abusing scanner proxy | `Proxy-Authorization: Basic` credential challenge | **PASS** (407 Proxy Authentication Required on unauth) |
| **Chromium Proxy Bypass** | Default Chromium localhost bypass | `--proxy-bypass-list=<-loopback>` Chromium launch arg | **PASS** (All loopback/testbed requests routed through proxy) |
| **Fail-Closed DNS Handling** | NXDOMAIN / SERVFAIL / timeout | `socket.gaierror` caught, returns 502 Bad Gateway | **PASS** (No connection initiated) |
| **Copilot Prompt Persistence** | Unredacted PAN/Aadhaar/Phone in database | `redact_text` called before `CopilotInteractionModel` insertion | **PASS** (DB stores `XXXXX1234F`, `XXXX-XXXX-7777`) |
| **Historical Data Exposure** | Legacy unredacted prompts in database | `sanitize_historical_copilot_interactions` migration | **PASS** (Existing rows scanned and sanitized on startup) |

---

## 3. Defense-in-Depth Limitations

While the application-layer egress proxy with connection-time IP pinning provides robust defense against SSRF and DNS rebinding within the scanner process, full defense-in-depth in enterprise deployments requires infrastructure-level guardrails:
1. **Network Egress Filtering:** Container and host environments (Docker/Kubernetes/VM) should enforce kernel-level egress firewall rules (e.g., `iptables`, `nftables`, or AWS/GCP VPC security groups) preventing outbound connections to `169.254.169.254/32` and internal cluster subnets.
2. **Container Network Namespaces:** Running the Playwright browser worker in a dedicated network namespace with restricted routing guarantees that even if a browser zero-day bypassed process flags, network-level egress is physically blocked.
3. **Production Database Considerations:** For SQLite, migration runs synchronously on startup. For large production PostgreSQL deployments, running `sanitize_historical_copilot_interactions` as a standalone Alembic batch migration script is recommended to prevent startup latency.

---

## 4. Modified & Created Files

| File | Type | Description |
| :--- | :--- | :--- |
| `backend/app/scanner/egress_proxy.py` | **Created** | In-process authenticated HTTP/CONNECT forward proxy with connection-time IP pinning and SSRF blocklists. |
| `backend/app/scanner/browser_observer.py` | **Modified** | Integrated with `EgressProxyServer`, added `--proxy-bypass-list=<-loopback>`, removed `dest_cache`, handled proxy error statuses. |
| `backend/app/api/routes/copilot.py` | **Modified** | Applied `redact_text` to user prompts and context payloads before persistence. |
| `backend/app/db/cleanup_copilot.py` | **Created** | Historical cleanup migration utility for `copilot_interactions`. |
| `backend/app/db/init_db.py` | **Modified** | Hooked `sanitize_historical_copilot_interactions` into startup sequence. |
| `backend/tests/test_adversarial.py` | **Modified** | Added tests 6, 7, and 8 for egress proxy authentication, SSRF enforcement, Copilot DB prompt redaction, and migration. |

---

## 5. Verification Evidence

### 5.1 Backend Pytest Suite
**Command:** `backend\venv\Scripts\pytest -c backend\pytest.ini -v backend\tests`  
**Result:** **23 passed, 36 warnings in 17.41s (Exit Code: 0)**

```
backend\tests\test_adversarial.py::test_adversarial_redirect_to_private_ip PASSED [  4%]
backend\tests\test_adversarial.py::test_adversarial_dns_resolution_failure PASSED [  8%]
backend\tests\test_adversarial.py::test_adversarial_mixed_public_private_dns_answers PASSED [ 13%]
backend\tests\test_adversarial.py::test_adversarial_navigation_timeout_and_failure PASSED [ 17%]
backend\tests\test_adversarial.py::test_adversarial_semaphore_lifecycle PASSED [ 21%]
backend\tests\test_adversarial.py::test_adversarial_pan_and_pii_redaction PASSED [ 26%]
backend\tests\test_adversarial.py::test_adversarial_egress_proxy_enforcement_and_auth PASSED [ 30%]
backend\tests\test_adversarial.py::test_adversarial_copilot_prompt_redaction_in_database PASSED [ 34%]
backend\tests\test_adversarial.py::test_adversarial_historical_copilot_cleanup_migration PASSED [ 39%]
backend\tests\test_api.py::test_health_endpoint PASSED                   [ 43%]
backend\tests\test_api.py::test_controlled_testbed_browser_observation PASSED [ 47%]
backend\tests\test_api.py::test_create_and_get_scan PASSED               [ 52%]
backend\tests\test_api.py::test_unauthorized_target_rejected PASSED      [ 56%]
backend\tests\test_api.py::test_ssrf_and_ip_validation PASSED            [ 60%]
backend\tests\test_api.py::test_redaction_pipeline PASSED                [ 65%]
backend\tests\test_api.py::test_verify_finding_vulnerable_and_patched PASSED [ 69%]
backend\tests\test_api.py::test_copilot_chat PASSED                      [ 73%]
backend\tests\test_api.py::test_hostname_vs_ip_validation PASSED         [ 78%]
backend\tests\test_api.py::test_testbed_telemetry_classification PASSED  [ 82%]
backend\tests\test_api.py::test_pan_redaction_pipeline PASSED            [ 86%]
backend\tests\test_api.py::test_scan_concurrency_semaphore PASSED        [ 91%]
backend\tests\test_api.py::test_live_testbed_scan_findings_and_no_fixture_substitution PASSED [ 95%]
backend\tests\test_api.py::test_scan_failure_handling PASSED             [100%]
====================== 23 passed, 36 warnings in 17.41s =======================
```

### 5.2 Frontend Production Build
**Command:** `npm run build`  
**Result:** **Exit Code: 0 (Built in 16.85s)**

```
> dpdp-guard@1.0.0 build
> tsc && vite build

vite v6.4.4 building for production...
transforming...
✓ 2352 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.95 kB │ gzip:   0.53 kB
dist/assets/index-CKWJ-lc0.css     62.63 kB │ gzip:  10.90 kB
dist/assets/index-BA1iZs3r.js   1,068.58 kB │ gzip: 298.41 kB
✓ built in 16.85s
```

---

## 6. Conclusion
The Phase 1.5 objectives have been completed in full. DNS rebinding TOCTOU risks are neutralized via connection-time IP pinning in an authenticated forward proxy; Copilot prompts and persistent records are strictly sanitized against PAN and PII leaks; and regression tests confirm that all security controls fail closed without impacting existing features or user interface contracts.
