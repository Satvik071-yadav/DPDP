# DPDP-Guard: Comprehensive Platform Audit Report

**Audit Date:** October 15, 2026  
**Auditor Roles:** Senior Full-Stack Engineer, Application Security Engineer, QA Engineer  
**Workspace:** `D:\DPDP`  
**Target Architecture:** FastAPI (Python 3.12) + SQLite (SQLAlchemy) + React 18 (TypeScript, Vite, Tailwind CSS) + Playwright (Chromium)

---

## 1. Architecture and Component Map

### 1.1 Overview

DPDP-Guard is designed as an India DPDP Act 2023 privacy investigation platform providing website scanning, network observation, consent integrity auditing, authorization verification, and evidence-grounded AI copilot analysis.

```
+---------------------------------------------------------------------------------------+
|                                    REACT FRONTEND                                     |
|  (Vite @ localhost:5173 | Tailwind | React Router | @xyflow/react | Recharts)         |
|                                                                                       |
|  Pages:                                                                               |
|  - Overview.tsx (Dashboard KPIs, Severity Donut, Exposure Trend, Activities)          |
|  - Scan.tsx (5-Stage Scanner Console, Profile Selector, Consent Mode Toggle)          |
|  - Findings.tsx (Multi-Filter Explorer, Search, Forensic Detail Drawer)                |
|  - PrivacyFlow.tsx (@xyflow/react Topology Graph, Consent-State Comparison)           |
|  - FixVerify.tsx (BOLA / PII Remediation Workbench, Diff Viewer, Probe Runner)       |
|  - Copilot.tsx (Evidence-Grounded AI Investigation Workspace)                         |
|  - History.tsx (Archival Scan Explorer, JSON Exporter, Report Modal)                  |
|  - Settings.tsx (DPO Designation, Rulesets, FastAPI Ping Tester)                      |
|                                                                                       |
|  Service Layer:                                                                       |
|  - api.ts (Backend HTTP Client + LocalStorage Fallback Adapter)                       |
|  - scanService.ts (Target Validation + Scanner UI State Machine)                      |
|  - privacyFlowService.ts (Graph Topology Constructor: Dynamic vs Fixture)             |
|  - remediationService.ts (Probe Runner + Audit History Manager)                       |
|  - copilotService.ts (Context Sanitizer + Demo Fixture vs Backend Dispatcher)         |
+-------------------------------------------+-------------------------------------------+
                                            | HTTP (JSON / REST)
                                            v
+---------------------------------------------------------------------------------------+
|                                    FASTAPI BACKEND                                    |
|  (Uvicorn @ 127.0.0.1:8000 | Pydantic v2 | SQLAlchemy 2.0 Async | Playwright)         |
|                                                                                       |
|  API Routes:                                                                          |
|  - /api/health (Readiness / Liveness Probe)                                           |
|  - /api/v1/scans (Create Scan, List Scans, Get Scan, Get Findings, Get Observations)  |
|  - /api/v1/scans/{id}/consent-comparison (Consent Differential Analyzer)              |
|  - /api/v1/findings (List, Get, Status Patch, Evidence)                               |
|  - /api/v1/findings/{id}/verify (Automated Verification Probe Runner)                 |
|  - /api/v1/copilot/chat (Context-Grounded 5-Section Copilot Endpoint)                |
|  - /testbed (Local Controlled Testbed HTML + Core API + Analytics + Opt-Out)          |
|                                                                                       |
|  Core Services & Security:                                                            |
|  - scan_service.py (Scan Lifecycle Orchestrator)                                      |
|  - browser_observer.py (Playwright Headless Browser Network Interceptor)             |
|  - verification_service.py (Deterministic Authorization & Safeguard Evaluator)        |
|  - observation_service.py (Consent Comparison Differential Engine)                    |
|  - security.py (SSRF Protection, IP Network Blocklists, Domain Allowlisting)          |
|  - redaction.py (Aadhaar, Mobile, Email, and JWT Redaction Pipeline)                 |
|  - authorization_tests.py (Controlled BOLA/IDOR KYC Endpoint Simulator)               |
|                                                                                       |
|  Persistence Layer (SQLite: dpdp_guard.db):                                           |
|  - scan_jobs (Audit Jobs, Target URLs, Scores, Timestamps, Provenance)                |
|  - browser_observations (Intercepted HTTP Requests, Redacted Headers, Consent States)  |
|  - findings (Correlated Statutory Violations, Impact Explanations, Code Diffs)        |
|  - audit_records (Historical Probe Verification Runs: Unpatched vs Patched)            |
|  - copilot_interactions (Audit Trail of User Prompts and Structured Analyses)         |
+---------------------------------------------------------------------------------------+
```

---

## 2. Feature-by-Feature Status

| Feature / Subsystem | Integration Status | Data Source Description | Working Aspects | Mocked / Broken / Unverified Aspects |
|---|:---:|---|---|---|
| **Overview Dashboard** | **PARTIAL** | Hybrid (Backend `GET /api/v1/findings` + `GET /api/v1/scans` merged with localStorage; static mock trend & activities) | - Dynamic count of Critical/High/Medium findings from DB.<br>- Working status indicators.<br>- Quick scan prefill. | - **Trend Chart** (`trendData`, lines 94–102) is hardcoded Monday–Sunday numbers.<br>- **Activity Feed** (`DEMO_ACTIVITIES`, line 579) is static hardcoded text.<br>- LocalStorage caching masks whether new scans actually alter historical KPIs. |
| **Website Scanning** | **PARTIAL** | Client-side timer state machine + backend persistence | - Target domain scope validation.<br>- Persists `ScanJob` record in SQLite (`dpdp_guard.db`).<br>- Real Playwright Chromium launched if target is `/testbed`. | - **Scanner Console Logs & Stage Timers** in `Scan.tsx` are 100% simulated client-side `setTimeout` delays.<br>- Scans for simulated domains (`paysecure-india.in`) bypass browser observation and generate static fixture clones.<br>- If backend is offline, `api.ts` silently creates a fake scan in `localStorage` without alerting the user. |
| **Findings Explorer** | **WORKING** | Backend `GET /api/v1/findings` + `PATCH /status` | - Full multi-filter (Severity, Category, Status, ScanId).<br>- Detail drawer displays observed facts vs legal rationale.<br>- Status transitions persist to SQLite. | - `evidenceAvailable` and `evidence_observation_ids` are empty `[]` for all fixture findings.<br>- Finding search operates client-side on loaded records rather than server-side pagination. |
| **Fix & Verify Workbench** | **WORKING (WITH SYNTHETIC TEST ROUTE)** | `POST /api/v1/findings/DPDP-HIGH-007/verify` + `audit_records` DB | - Evaluates real unpatched vs patched states.<br>- Unpatched yields FAIL (HTTP 200, 5 leaked PII fields).<br>- Patched yields PASS (HTTP 403 Forbidden, 0 leaked PII).<br>- Both audit results are persisted in `audit_records` table and independently inspectable. | - Target endpoint `/api/v1/customers/usr_demo_custB/kyc-record` is **simulated in Python memory** via `authorization_tests.py`; it is **not a real HTTP route** on the server.<br>- Audit history is stored both in SQLite and `localStorage` (`remediationService.ts`), creating potential sync drift. |
| **Privacy Flow** | **PARTIAL** | Hybrid: `@xyflow/react` reads `GET /api/v1/scans/{id}/observations` when scan starts with `SCAN-`, else `privacyFlowFixtures.ts` | - Dynamic graph generation from real Playwright observations.<br>- Consent state toggle filters edges (accepted vs rejected).<br>- Node detail inspection drawer. | - **Layout Defect**: Dynamic observations have node IDs like `node-127-0-0-1`, which are missing from `NODE_LAYOUT_COORDINATES`. All dynamic nodes default to `{x: 300, y: 200}`, causing visual overlap.<br>- If scan has no observations, falls back to `PAYSECURE_FLOW_GRAPH` static fixture. |
| **AI Investigation Copilot** | **WORKING (DUAL MODE)** | Backend `POST /api/v1/copilot/chat` + client fallback `copilotFixtures.ts` | - Grounded 5-section responses (`whatWeObserved`, `whyItMatters`, `whatRemainsUncertain`, `recommendedActions`, `howToVerify`).<br>- Context sanitizer scrubs tokens and PII before dispatch.<br>- Interactions persisted in `copilot_interactions` table. | - UI defaults to `demo` mode (`Copilot.tsx` line 51); does not call FastAPI unless the user explicitly switches the toggle.<br>- In demo mode, matches keyword prompts to static fixture dictionaries. |
| **Scan History** | **WORKING** | Backend `GET /api/v1/scans` + localStorage cache | - Lists historical scans from SQLite.<br>- Search by URL or scan ID.<br>- Working JSON export and report preview modal. | - Scans created while backend was offline appear in the table with no visual distinction from verified backend scans. |
| **Settings & Connectivity** | **PARTIAL** | `localStorage` only (`DEFAULT_USER_SETTINGS`) | - Live backend health ping (`/api/health`) with latency measurement. | - `settings.apiUrl` is **never used by `api.ts`**; `api.ts` hardcodes `API_BASE_URL` from Vite env. Changing the URL in Settings has zero effect on the rest of the application. |
| **Controlled Testbed** | **WORKING** | FastAPI route `/testbed` | - Realistic HTML testbed with consent banner.<br>- Dispatches session check (`/api/session`), analytics (`/api/analytics`), and opt-out (`/api/optout-receipt`). | - Analytics endpoint is hosted on the same origin (`127.0.0.1`), causing domain classifier to misclassify it as `first_party`. |

---

## 3. Critical and High-Priority Defects

### Defect 1: External Hostname Classification Bug Aborts All Real Third-Party Observations
- **File:** `backend/app/scanner/browser_observer.py` (Lines 75–94) & `backend/app/core/security.py` (Lines 26–35)
- **Severity:** CRITICAL
- **Description:** In `security.py`, `is_ip_blocked(ip_str)` attempts `ipaddress.ip_address(ip_str)` and catches `ValueError` by returning `True`. In `browser_observer.py`, the network route interceptor checks:
  ```python
  is_target_host = host in (target_domain, "localhost", "127.0.0.1")
  if host == "169.254.169.254" or (not is_target_host and is_ip_blocked(host)):
      await route.abort("blockedbyclient")
  ```
  If a webpage requests an external third-party domain (e.g. `connect.facebook.net` or `analytics.google.com`), `host` is `"connect.facebook.net"`. `is_target_host` is `False`. Because `"connect.facebook.net"` is not a valid IP literal, `is_ip_blocked` raises `ValueError` and returns `True`! As a result, **every single real third-party script or external API is aborted by the client**, making it impossible for the browser observer to inspect real third-party network egress.
- **Remediation:** In `security.py`, `is_ip_blocked` must only evaluate IP address strings. For hostnames, resolve the hostname to an IP first, or separate `is_ip_blocked` from `is_hostname_allowed`.

### Defect 2: Local Testbed Third-Party Telemetry Misclassified as First-Party
- **File:** `backend/app/scanner/browser_observer.py` (Line 18) & `backend/app/services/scan_service.py` (Lines 140–181)
- **Severity:** HIGH
- **Description:** In `browser_observer.py`:
  ```python
  if host == target_host or host.endswith(f".{target_host}") or host in ("localhost", "127.0.0.1"):
      return "first_party"
  ```
  Because the controlled testbed is served on `http://127.0.0.1:8000/testbed`, its analytics endpoint `/testbed/api/analytics` has host `127.0.0.1`. The classifier marks it as `first_party`. In `scan_service.py`, findings are generated only if:
  ```python
  tp_obs = [o for o in raw_observations if o["classification"] == "third_party"]
  if tp_obs:
      # generate live finding
  ```
  Because `tp_obs` is empty, the live scan **always falls back to generating static fixture findings** (`INITIAL_FIXTURE_FINDINGS`), completely defeating the purpose of the live Playwright observation on the testbed.
- **Remediation:** Update `classify_domain` or the testbed routes to recognize simulated third-party telemetry paths (e.g. `/testbed/api/analytics` or query parameter `source=third_party_ad_network`) as `third_party`.

### Defect 3: Dynamic Graph Nodes Stack at `{x: 300, y: 200}` in Privacy Flow
- **File:** `src/pages/PrivacyFlow.tsx` (Lines 64–82) & `src/services/privacyFlowService.ts` (Lines 62–79)
- **Severity:** HIGH
- **Description:** `PrivacyFlow.tsx` positions nodes using a static dictionary `NODE_LAYOUT_COORDINATES` that only has coordinates for fixture node IDs (`node-website`, `node-api-auth`, etc.). Dynamic nodes created from live observations receive generated IDs (e.g., `node-127-0-0-1`, `node-origin`). Because these IDs are absent from the dictionary, line 146 applies fallback `{ x: 300, y: 200 }` to all of them, rendering all dynamic nodes in a jumbled stack directly on top of each other.
- **Remediation:** Implement an automatic grid/circular layout algorithm for dynamic nodes in `PrivacyFlow.tsx` when explicit coordinates are not defined in the layout map.

### Defect 4: Settings API URL is Decoupled from Frontend HTTP Client
- **File:** `src/services/api.ts` (Line 11) & `src/pages/Settings.tsx` (Lines 45–62)
- **Severity:** MEDIUM
- **Description:** `Settings.tsx` allows the user to configure and test a custom `apiUrl`. However, `src/services/api.ts` hardcodes `API_BASE_URL` as a module constant derived from Vite environment variables. Modifying the API URL in Settings only changes `localStorage` for the Settings page itself; all other API calls continue using the hardcoded default `http://127.0.0.1:8000`.
- **Remediation:** Update `api.ts` to dynamically resolve the base URL using `(await api.getSettings()).apiUrl || API_BASE_URL`.

### Defect 5: SQLite Foreign Key Constraints and Cascading Deletes Disabled
- **File:** `backend/app/db/session.py` (Lines 6–15)
- **Severity:** MEDIUM
- **Description:** In SQLite, foreign key enforcement is disabled by default. Because `backend/app/db/session.py` does not execute `PRAGMA foreign_keys = ON;` upon connection initialization, relationships defined with `cascade="all, delete-orphan"` in `entities.py` are ignored by the SQLite engine, leaving orphan records if scan jobs or findings are removed.
- **Remediation:** Register an event listener on the SQLAlchemy engine:
  ```python
  from sqlalchemy import event
  @event.listens_for(engine.sync_engine, "connect")
  def set_sqlite_pragma(dbapi_connection, connection_record):
      cursor = dbapi_connection.cursor()
      cursor.execute("PRAGMA foreign_keys=ON")
      cursor.close()
  ```

### Defect 6: Missing PAN Card and Financial Identifier Redaction
- **File:** `backend/app/core/redaction.py` (Lines 5–10)
- **Severity:** MEDIUM
- **Description:** While `redaction.py` masks Aadhaar numbers and Indian phone numbers, it contains **no regular expression for Indian Permanent Account Numbers (PAN)** (format: `[A-Z]{5}[0-9]{4}[A-Z]`). Because the synthetic KYC test payload contains `"panNumber": "ABCDE1234F"`, any network query or payload snippet containing PAN cards passes through the redaction filter unmasked.
- **Remediation:** Add `INDIAN_PAN_REGEX = re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b')` and mask all but the last 2 characters.

---

## 4. Security Risks Ranked by Severity and Exploitability

| Risk ID | Vulnerability / Exposure | Severity | Exploitability | Impact Analysis |
|---|---|:---:|:---:|---|
| **SEC-01** | **DNS Re-binding / TOCTOU SSRF in Playwright Navigation** | **HIGH** | Medium | `validate_and_resolve_url` validates DNS once, but Playwright's `page.goto` re-resolves the domain independently. An authorized domain with a low TTL DNS record could resolve to an allowed IP during validation, but flip to an internal IP (e.g. `127.0.0.1:3000` or cloud metadata) when Chromium connects. |
| **SEC-02** | **Lack of Authentication on Administrative Endpoints** | **MEDIUM** | High | All `/api/v1/*` endpoints (`POST /scans`, `PATCH /findings/{id}/status`, `POST /findings/{id}/verify`) lack authentication and rate limiting. Anyone on the local network or through CORS misconfiguration can trigger browser scans, execute probes, or alter finding statuses. |
| **SEC-03** | **Unbounded Headless Browser Concurrency (DoS / OOM)** | **MEDIUM** | Medium | `config.py` specifies `MAX_SCAN_CONCURRENCY: int = 3`, but `scans.py` contains **zero locking or concurrency throttling**. Sending multiple concurrent scan requests spawns multiple simultaneous Chromium instances, risking CPU starvation and memory exhaustion. |
| **SEC-04** | **Uncaught Exceptions in Playwright Navigation Result in HTTP 500** | **LOW** | High | `observe_target` does not wrap `page.goto(target_url)` in a `try...except`. If a target page times out (`timeout=10000`) or resets the TCP connection, the exception propagates unhandled, causing `POST /api/v1/scans` to crash with HTTP 500 without recording a failed scan job. |
| **SEC-05** | **Hardcoded Dev Secret Key** | **LOW** | Low | `SECRET_KEY` in `config.py` defaults to a known hardcoded string (`dpdp_guard_dev_secret_key_change_in_production_8891024`). While tokens are currently synthetic, this key should be loaded strictly from environment variables in production. |

---

## 5. Actual Test and Build Results

### 5.1 Backend Pytest Execution
- **Command:** `backend\venv\Scripts\pytest -c backend\pytest.ini -v backend\tests`
- **Exit Code:** `0`
- **Duration:** `6.97s`
- **Total Tests:** 8
- **Results:** 8 Passed, 0 Failed, 19 Deprecation Warnings (related to `datetime.datetime.utcnow()`).

| Test Name | Status | Verified Behavior |
|---|:---:|---|
| `test_health_endpoint` | **PASS** | Returns HTTP 200 with service name and database status. |
| `test_controlled_testbed_browser_observation` | **PASS** | Runs live headless Chromium against dynamic test server; verifies session and analytics URLs on consent accept vs reject. |
| `test_create_and_get_scan` | **PASS** | Creates scan record in SQLite and retrieves scan and finding schemas. |
| `test_unauthorized_target_rejected` | **PASS** | Rejects `https://unauthorized-evil-target.com` with HTTP 403. |
| `test_ssrf_and_ip_validation` | **PASS** | Confirms blocking of `127.0.0.1`, `169.254.169.254`, `10.0.0.1`, `192.168.1.1`, embedded credentials, and invalid ports. |
| `test_redaction_pipeline` | **PASS** | Verifies redaction of Aadhaar (`XXXX-XXXX-2019`), mobile (`+91 XXXXX 55667`), email, and JWT tokens. |
| `test_verify_finding_vulnerable_and_patched` | **PASS** | Verifies unpatched probe yields FAIL (HTTP 200 with PII) and patched probe yields PASS (HTTP 403 Forbidden zero PII). |
| `test_copilot_chat` | **PASS** | Verifies 5-section evidence-grounded response format and disclaimer. |

### 5.2 Frontend Production Build
- **Command:** `npm run build` (`tsc && vite build`)
- **Exit Code:** `0`
- **Duration:** `6.27s`
- **Modules Transformed:** 2,352
- **Output Artifacts:**
  - `dist/index.html` (0.95 kB)
  - `dist/assets/index-CKWJ-lc0.css` (62.63 kB | gzip: 10.90 kB)
  - `dist/assets/index-BA1iZs3r.js` (1,068.58 kB | gzip: 298.41 kB)
- **TypeScript Errors:** 0 errors.

---

## 6. Prioritized Implementation Plan

```
[Phase 1: Security & Observation Engine Fixes]
      |
      v
[Phase 2: Data Integrity & Real HTTP Verification Routes]
      |
      v
[Phase 3: Frontend Real-Time Integration & Layout Polish]
      |
      v
[Phase 4: End-to-End Validation & Verification Suite]
```

### Phase 1: Security & Observation Engine Fixes
- **1.1 Fix Hostname Routing in Playwright Route Handler:** Modify `browser_observer.py` and `security.py` so external domain hostnames are resolved and evaluated against IP blocklists rather than automatically aborted.
- **1.2 Fix Testbed Classification:** Add classification logic to classify `/testbed/api/analytics` as `third_party` so live browser scans generate real observations and findings.
- **1.3 Add Playwright Exception & Timeout Handling:** Wrap `page.goto` in `try...except` block in `browser_observer.py` to record scan failures gracefully instead of raising unhandled HTTP 500s.
- **1.4 Implement PAN Card Redaction:** Add PAN card regex and masking logic to `redaction.py`.
- **1.5 Enforce Scan Concurrency Semaphore:** Add an `asyncio.Semaphore(settings.MAX_SCAN_CONCURRENCY)` in `scans.py`.

### Phase 2: Data Integrity & Real HTTP Verification Routes
- **2.1 Enable SQLite Foreign Keys:** Add `PRAGMA foreign_keys = ON;` connection listener in `session.py`.
- **2.2 Register Real Testbed KYC Endpoints:** Expose actual HTTP endpoints `/testbed/api/v1/customers/{customerId}/kyc-record` on the FastAPI server so the verification probe can execute real HTTP requests over the wire rather than calling in-memory Python fixtures.
- **2.3 Synchronize Frontend Settings with API Client:** Make `api.ts` read the configured API base URL from settings instead of relying solely on Vite build constants.

### Phase 3: Frontend Real-Time Integration & Layout Polish
- **3.1 Dynamic Node Layout in Privacy Flow:** Implement a dynamic layout calculator in `PrivacyFlow.tsx` for dynamic observation nodes.
- **3.2 Dynamic Overview Trend & Activity Stream:** Connect `Overview.tsx` trend and activity feed to real database records rather than `DEMO_ACTIVITIES` and static arrays.
- **3.3 Real-Time Scan Progress:** Connect `Scan.tsx` to live backend scan status or Server-Sent Events instead of client-side `setTimeout` loops.

### Phase 4: End-to-End Verification
- **4.1 Add Integration Tests:** Write tests verifying real third-party resolution and live testbed findings generation.
- **4.2 Regression Testing:** Run full pytest suite and production build.

---

## 7. Short List of Exact Next Files to Modify

1. `backend/app/scanner/browser_observer.py` — Fix route interceptor hostname blocking and testbed domain classification.
2. `backend/app/core/security.py` — Fix `is_ip_blocked` to avoid treating hostnames as blocked IPs.
3. `backend/app/core/redaction.py` — Add Indian PAN card regex and masking.
4. `backend/app/api/routes/testbed.py` — Add real HTTP KYC endpoints for BOLA testing.
5. `backend/app/db/session.py` — Enable SQLite `PRAGMA foreign_keys = ON`.
6. `src/pages/PrivacyFlow.tsx` — Add dynamic node positioning for live observation graphs.
7. `src/services/api.ts` — Wire dynamic API URL from settings and eliminate silent mock scan creation.
