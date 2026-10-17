# Phase 1 Implementation Report: Observation Engine & Security Hardening

**Target Project:** DPDP-Guard (`D:\DPDP`)  
**Audit Reference:** `AUDIT_REPORT.md`  
**Date:** October 15, 2026  
**Status:** Completed & Verified (14/14 automated tests passing, frontend production build clean)

---

## 1. Executive Summary

Phase 1 addresses critical security, reliability, and observation fidelity defects identified during the comprehensive system audit. The core observation engine was hardened against SSRF and cloud metadata access, hostname parsing was decoupled from IP literal evaluation, testbed network telemetry was accurately classified into first-party vs third-party destinations, live testbed scans were anchored strictly to real browser observations (eliminating fake demo fixture substitution), PAN redaction was introduced to protect Indian financial identifiers, scan concurrency was throttled via an asynchronous semaphore, and fail-safe cleanup/error propagation was established across Playwright routines.

---

## 2. Detailed Technical Fixes

### Task 1: Hostname vs. IP Literal Handling & SSRF Hardening
* **Files Modified:**
  - `backend/app/core/security.py`
  - `backend/app/scanner/browser_observer.py`
* **Defect Resolved:** `is_ip_blocked()` previously caught parsing failures on non-IP hostnames (e.g., `analytics.google.com`) and returned `True`, improperly treating legitimate domains as blocked IPs.
* **Implementation:**
  - Added `is_ip_literal(host)` to strictly distinguish IPv4/IPv6 literals from DNS domain names.
  - Updated `is_ip_blocked(ip_str)` to evaluate only valid IP literals. For non-literal strings, it returns `False`, leaving domain safety checks to DNS resolution routines.
  - Implemented `resolve_and_validate_destination(hostname, port, allow_loopback)`:
    - Rejects cloud metadata hosts explicitly (`169.254.169.254`, `metadata.google.internal`, `instance-data`, `metadata`, and `*.internal`).
    - Resolves hostnames via `socket.getaddrinfo()` using `IPPROTO_TCP`.
    - Inspects all resolved destination IP addresses against `BLOCKED_IP_NETWORKS` (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `127.0.0.0/8`, `::1/128`, `fc00::/7`, `fe80::/10`).
    - Fails closed if any resolved address belongs to a prohibited network or if DNS resolution fails.
  - Hardened route interception in Playwright (`page.route("**/*", ...)`): Destination hostnames are validated and cached before permitting traffic.

### Task 2: Testbed Telemetry Classification & Fixture Substitution Prevention
* **Files Modified:**
  - `backend/app/scanner/browser_observer.py`
  - `backend/app/services/scan_service.py`
* **Defect Resolved:**
  - On the local controlled testbed (`127.0.0.1:8000`), simulated third-party analytics calls (`/testbed/api/analytics`) were mistakenly classified as first-party because their network host matched the origin (`127.0.0.1`).
  - Scan execution previously fell back to static hardcoded demo fixtures when scans completed or when targets were local.
* **Implementation:**
  - In `BrowserObservationService.classify_domain(url, target_domain)`: explicitly identifies `/testbed/api/analytics` or requests carrying `source=third_party` as `third_party` telemetry, while maintaining `/testbed/api/session` and `/testbed/api/optout-receipt` as `first_party`.
  - In `ScanService.create_scan`:
    - For live targets (including the local testbed), findings are generated purely from observed network evidence (`DPDP-LIVE-...`).
    - Demo fixtures are only loaded if the scan target is an explicit synthetic demo domain (e.g. `paysecure-india.in`).
    - If a live scan yields zero violations or fails, findings remain an empty list `[]`; static fixtures are never silently substituted.

### Task 3: Robust Playwright Browser Observation & Lifecycle Cleanup
* **Files Modified:**
  - `backend/app/scanner/browser_observer.py`
  - `backend/app/services/scan_service.py`
* **Implementation:**
  - Defined custom exception `BrowserObservationError(Exception)` with `failure_reason`.
  - Configured Chromium launch arguments with hardened flags (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`).
  - Structured observation within strict `try...except...finally` blocks ensuring that `page.close()`, `context.close()`, and `browser.close()` are reliably invoked even upon unhandled navigation crashes or connection timeouts.
  - Added URL parameter sanitization (`sanitize_url`) to redact sensitive credentials from intercepted URLs.
  - In `scan_service.py`, navigation crashes and connection failures (e.g. unreachable servers) set `status="failed"`, persist a sanitized, non-leaking error message (`"Browser observation failed: Navigation failed or connection refused"`), and avoid returning partial or corrupted findings.

### Task 4: Indian Permanent Account Number (PAN) Redaction
* **Files Modified:**
  - `backend/app/core/redaction.py`
* **Implementation:**
  - Added regex `INDIAN_PAN_REGEX = re.compile(r'\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b')`.
  - Implemented `mask_pan(match)`: preserves the last 5 characters (4 digits + 1 check letter) while masking the leading 5 alphabetic characters with `XXXXX` (e.g., `ABCDE1234F` -> `XXXXX1234F`).
  - Integrated `INDIAN_PAN_REGEX` into `redact_text()`, complementing existing redactions for Aadhaar numbers, Indian mobile numbers, emails, JWT tokens, and Bearer headers.
  - Added `"pan"` and `"pannumber"` to `CREDENTIAL_KEY_REGEX` to ensure request/response headers containing PAN data are fully masked to `[REDACTED_CREDENTIAL]`.

### Task 5: Scan Concurrency Throttling
* **Files Modified:**
  - `backend/app/services/scan_service.py`
* **Implementation:**
  - Created global singleton `asyncio.Semaphore` bound to `settings.MAX_SCAN_CONCURRENCY` (configured to 2 concurrent browser sessions).
  - Wrapped `create_scan()` inside `async with semaphore:` to prevent thread exhaustion, browser context thrashing, and out-of-memory crashes during concurrent scan requests.

### Task 6: Foreign Key Enforcement & Model Integrity
* **Files Modified:**
  - `backend/app/db/session.py`
  - `backend/app/schemas/contracts.py`
* **Implementation:**
  - Enabled SQLite foreign key constraints via `PRAGMA foreign_keys = ON;` connection listener on `engine.sync_engine`.
  - Extended `ScanResultSchema` with `errorMessage: Optional[str]` and `provenance: Optional[str]` to support non-leaking diagnostic state reporting to clients.

---

## 3. Security Decisions & Known Technical Limitations

### DNS Rebinding & TOCTOU (Time-of-Check to Time-of-Use)
* **Playwright Architecture Limitation:** Playwright manages socket-level connections through Chromium's internal network stack. While HTTP request routing (`page.route()`) intercepts requests at the URL level, the low-level TCP socket connect does not expose an IP pinning API directly to Python without a dedicated forward egress proxy.
* **Mitigation Deployed:**
  1. Primary DNS resolution and validation occur prior to launching the browser target (`validate_and_resolve_url`).
  2. Every intercepted HTTP request during navigation is resolved and inspected against `BLOCKED_IP_NETWORKS` via `resolve_and_validate_destination()` before route continuation.
  3. Prohibited schemes, credentials in URLs, and non-whitelisted ports are strictly rejected.

---

## 4. Verification & Automated Test Results

### Backend Automated Test Suite
Command:
```powershell
backend\venv\Scripts\pytest -c backend\pytest.ini -v backend\tests
```
Result: **14 passed, 0 failed in 12.39s**

### Frontend Production Build
Command:
```powershell
npm run build
```
Result: **Clean production build in 7.93s, 0 errors**

---

## 5. Summary of Files Changed

| File Path | Description of Changes |
| :--- | :--- |
| `backend/app/core/redaction.py` | Added `INDIAN_PAN_REGEX`, `mask_pan()`, and header redaction for PANs |
| `backend/app/core/security.py` | Separated IP literal checking from hostnames, added metadata blocking and `resolve_and_validate_destination()` |
| `backend/app/scanner/browser_observer.py` | Fixed testbed telemetry classification, added `BrowserObservationError`, route checks, lifecycle cleanup |
| `backend/app/services/scan_service.py` | Added concurrency semaphore, error redaction, fail-safe scan handling, and zero fixture substitution |
| `backend/app/schemas/contracts.py` | Added `errorMessage` and `provenance` fields to `ScanResultSchema` |
| `backend/app/db/session.py` | Enabled SQLite `PRAGMA foreign_keys = ON;` connection hook |
| `backend/tests/test_api.py` | Added 6 new regression tests covering all Phase 1 fixes |
