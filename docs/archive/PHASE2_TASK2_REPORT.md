# Phase 2 Task 2 Implementation Report: API URL Settings and Offline Behavior

**Project:** DPDP-Guard  
**Directory:** `D:\DPDP`  
**Date:** 2026-10-16  
**Status:** Completed and Verified  

---

## 1. Executive Summary

Phase 2 Task 2 focused on addressing frontend API URL configuration, eliminating silent mock data fallbacks when the backend is offline, and ensuring clear distinction between live persisted records and synthetic demo fixtures.

All objectives have been implemented and verified:
1. **Centralized URL Resolver & Normalizer:** Created `src/services/apiConfig.ts` to centralize API base URL resolution, scheme/port validation, and normalization (stripping redundant trailing slashes and `/api/v1` prefixes).
2. **Immediate Runtime Propagation:** Dynamic runtime override mechanism updates active API clients instantly upon saving in Settings without requiring an application reload or rebuild.
3. **Audit of All Direct Fetch Callers:** Every API caller (`api.ts`, `copilotService.ts`) now queries `getApiBaseUrl()` dynamically. No hardcoded or rogue API endpoints remain.
4. **Offline & Demo Mode Distinction:** Removed silent fake scan/finding substitution when the backend is unreachable. When `demoMode: false`, genuine connectivity errors are surfaced directly. When `demoMode: true`, demo records are explicitly marked with `isDemo: true`, `isDemoFixture: true`, and prominent `[DEMO FIXTURE]` UI badges.
5. **Automated Test Suite:** Created `tests/api_config.test.ts` covering URL normalization, validation, environment fallbacks, runtime overrides, connection checks, and demo mode handling. 25/25 unit tests pass.
6. **Regression Verification:** Full backend test suite (`pytest`) continues to pass with 23/23 tests, and the frontend production build (`npm run build`) builds cleanly with zero errors.

---

## 2. Detailed Changes by File

### 2.1 `src/services/apiConfig.ts` (New File)
- **`normalizeApiUrl(url: string): string`**:
  - Trims whitespace.
  - Strips trailing slashes.
  - Strips trailing `/api/v1` or `/api/v1/` to ensure callers appending `/api/health` or `/api/v1/...` do not produce malformed double paths (e.g. `http://127.0.0.1:8000/api/v1/api/health`).
- **`validateApiUrl(url: string): { isValid: boolean; error?: string }`**:
  - Validates protocol strictly (`http:` or `https:`).
  - Validates hostname non-emptiness.
  - Pre-validates port numbers (1–65535) before Node/browser URL parser errors out with ambiguous messages.
  - Rejects empty strings, malformed syntax, and non-HTTP protocols (`ftp:`, `javascript:`, etc.).
- **`getDefaultApiUrl(): string`**:
  - Evaluates `import.meta.env.VITE_API_BASE_URL` if present, falling back to `'http://127.0.0.1:8000'`.
- **`getApiBaseUrl(): string`**:
  - Resolution hierarchy:
    1. In-memory `runtimeApiUrlOverride` (immediate reactivity within the current session).
    2. `localStorage.getItem('dpdp_user_settings')` -> parsed `apiUrl` (if valid).
    3. `getDefaultApiUrl()`.
- **`setApiBaseUrl(url: string): void`**:
  - Validates and normalizes the target URL.
  - Updates `runtimeApiUrlOverride`.
  - Dispatches custom `dpdp:api-url-changed` window event for reactive UI listeners.
- **`resetApiUrlOverride(): void`**:
  - Allows tests to clear in-memory overrides between assertions.

### 2.2 `src/services/api.ts`
- **Removed static constant:** Removed module-level `const API_BASE_URL = 'http://localhost:8000/api/v1'`.
- **Dynamic Endpoint Construction:**
  - All REST endpoints now invoke `getApiBaseUrl()`.
  - Root endpoints like `/api/health` are reached at `${getApiBaseUrl()}/api/health`.
  - Versioned API endpoints are reached at `${getApiBaseUrl()}/api/v1/...`.
- **Eliminated Silent Fallback in `createScan`:**
  - Previously: Failed backend requests silently generated a simulated mock scan and added mock findings into localStorage.
  - Now: Checks `demoMode` setting.
    - If `demoMode: false`: Throws `new Error('Backend connection failed. Please ensure the backend is running at ' + getApiBaseUrl())`.
    - If `demoMode: true`: Generates a clearly marked demo record with `isDemo: true`, `notes: '[DEMO FIXTURE] Mock scan produced because Demo Mode is enabled.'`, and id `DEMO-SCAN-...`.
- **Eliminated Silent Fallback in `getScans` & `getFindings`:**
  - When backend returns an error and `demoMode: false`, errors bubble up to display real offline state in the UI.
  - When `demoMode: true`, mock findings are explicitly annotated with `isDemoFixture: true`.
- **Improved `testBackendConnection`:**
  - Accepts an optional URL to test, defaulting to `getApiBaseUrl()`.
  - Validates and normalizes the URL first.
  - Pings `${normalizedUrl}/api/health` with a 5000ms timeout.
  - Returns `{ ok: boolean, status: number, latencyMs: number, url: string, error?: string }`.

### 2.3 `src/services/copilotService.ts`
- Removed static `const API_BASE_URL = 'http://localhost:8000/api/v1'`.
- Replaced with dynamic resolution via `getApiBaseUrl()`.

### 2.4 `src/pages/Settings.tsx`
- **Real-Time Validation:** Added real-time URL validation onChange and onBlur.
- **Visual Feedback:** Displays red inline error text when an invalid URL is typed (e.g. invalid port, unsupported protocol).
- **Active URL Indicator:** Displays the currently resolved active URL and clearly indicates whether it is using the default fallback or a user-customized setting.
- **Immediate Propagation in `handleSave`:**
  - Validates URL before saving.
  - Calls `setApiBaseUrl(normalizedUrl)` which updates memory and storage instantly.
  - No page reload or rebuild required for new settings to take effect.
- **Backend Test Button:**
  - Validates and normalizes input before pinging `/api/health`.
  - Displays latency and error details if the server is unreachable.

### 2.5 `src/types/index.ts`
- Extended `Finding` with `isDemoFixture?: boolean`.
- Extended `ScanResult` with `isDemo?: boolean` and `notes?: string`.

### 2.6 `src/data/mockData.ts`
- Updated `DEFAULT_USER_SETTINGS.apiUrl` to `'http://127.0.0.1:8000'`.

### 2.7 `src/pages/Findings.tsx` & `src/pages/History.tsx`
- Added visual badge `[DEMO FIXTURE]` with amber pill styling whenever `finding.isDemoFixture` or `scan.isDemo` is true.

### 2.8 `tests/api_config.test.ts` & `package.json`
- Added `tsx` to `devDependencies` and `"test": "tsx tests/api_config.test.ts"` in `package.json`.
- Implemented comprehensive unit tests verifying normalization, validation, resolution hierarchy, settings propagation, connection checking, and offline handling.

---

## 3. Direct Fetch Callers Audit

An exhaustive audit of direct `fetch` calls across `src/` was conducted to confirm no unconfigured or hardcoded calls bypass `apiConfig.ts`:

| File | Direct `fetch` Usage | Status |
| :--- | :--- | :--- |
| `src/services/api.ts` | All API endpoints (`/api/health`, `/api/v1/...`) | Dynamic via `getApiBaseUrl()` |
| `src/services/copilotService.ts` | `/api/v1/copilot/chat` | Dynamic via `getApiBaseUrl()` |
| `src/services/remediationService.ts` | Verification & audit history | Delegates directly to `src/services/api.ts` |

**Result:** Zero hardcoded URL calls remain in application logic.

---

## 4. Verification and Test Results

### 4.1 Frontend Config & Offline Unit Tests
Command: `npm test`
```
> dpdp-guard@1.0.0 test
> tsx tests/api_config.test.ts

Running DPDP-Guard API Config & Offline Behavior Tests...
  [PASS] normalizeApiUrl: strips trailing slashes
  [PASS] normalizeApiUrl: strips redundant trailing /api/v1
  [PASS] normalizeApiUrl: preserves port and host
  [PASS] validateApiUrl: accepts valid http and https URLs
  [PASS] validateApiUrl: rejects empty string
  [PASS] validateApiUrl: rejects missing protocol
  [PASS] validateApiUrl: rejects non-http protocols
  [PASS] validateApiUrl: rejects invalid port numbers (> 65535)
  [PASS] validateApiUrl: rejects invalid port numbers (negative or zero)
  [PASS] getDefaultApiUrl: returns default 127.0.0.1:8000 when VITE env is not set
  [PASS] getApiBaseUrl: returns default when no storage and no override
  [PASS] getApiBaseUrl: prefers localStorage user setting over default
  [PASS] getApiBaseUrl: prefers runtime override over localStorage and default
  [PASS] setApiBaseUrl: updates runtime override and dispatches event
  [PASS] testBackendConnection: returns failure for invalid URL
  [PASS] testBackendConnection: returns ok: true when health check succeeds
  [PASS] testBackendConnection: handles network error gracefully
  [PASS] offline behavior: createScan throws explicit error when backend offline and demoMode is false
  [PASS] offline behavior: createScan creates labeled demo fixture when demoMode is true
  [PASS] normalizeApiUrl: handles paths with extra slashes
  [PASS] normalizeApiUrl: trims whitespace around URL
  [PASS] validateApiUrl: rejects URLs with space characters
  [PASS] validateApiUrl: accepts URLs with valid standard ports
  [PASS] getApiBaseUrl: ignores malformed JSON or corrupted localStorage settings
  [PASS] resetApiUrlOverride: properly resets memory override

All 25 tests passed successfully! (69ms)
```

### 4.2 Frontend Production Build
Command: `npm run build`
```
> dpdp-guard@1.0.0 build
> tsc && vite build

vite v5.4.14 building for production...
transforming...
✓ 1876 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.89 kB │ gzip:  0.44 kB
dist/assets/index-D8rW3QZp.css   38.57 kB │ gzip:  7.09 kB
dist/assets/index-BNjG0v5C.js   483.21 kB │ gzip: 147.22 kB
✓ built in 6.53s
```
**Result:** 0 TypeScript or bundling errors.

### 4.3 Backend Test Suite
Command: `backend\venv\Scripts\pytest -c backend\pytest.ini -v backend\tests`
```
============================= test session starts =============================
platform win32 -- Python 3.12.8, pytest-8.3.5, pluggy-1.5.0 -- D:\DPDP\backend\venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: D:\DPDP\backend
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.8.0
collecting ... collected 23 items

backend/tests/test_audit_persistence.py::test_audit_persistence_across_sessions PASSED [  4%]
backend/tests/test_egress_proxy.py::test_egress_proxy_allows_authorized_target PASSED [  8%]
backend/tests/test_egress_proxy.py::test_egress_proxy_rejects_private_ip PASSED [ 13%]
backend/tests/test_egress_proxy.py::test_egress_proxy_rejects_unauthorized_domain PASSED [ 17%]
backend/tests/test_egress_proxy.py::test_egress_proxy_blocks_redirect_to_metadata PASSED [ 21%]
backend/tests/test_pan_redaction.py::test_pan_redaction_in_evidence PASSED [ 26%]
backend/tests/test_pan_redaction.py::test_pan_redaction_in_copilot_context PASSED [ 30%]
backend/tests/test_privacy_flow.py::test_privacy_flow_graph_generation PASSED   [ 34%]
backend/tests/test_real_browser_scan.py::test_real_browser_scan_populates_observations_and_findings PASSED [ 39%]
backend/tests/test_real_browser_scan.py::test_real_browser_scan_zero_findings_never_loads_fixtures PASSED [ 43%]
backend/tests/test_remediation.py::test_remediation_verification_pass PASSED    [ 47%]
backend/tests/test_remediation.py::test_remediation_verification_fail PASSED    [ 52%]
backend/tests/test_remediation.py::test_audit_history_recording PASSED          [ 56%]
backend/tests/test_remediation.py::test_remediation_requires_auth PASSED        [ 60%]
backend/tests/test_remediation.py::test_verification_affects_finding_status PASSED [ 65%]
backend/tests/test_remediation.py::test_testbed_state_toggle PASSED             [ 69%]
backend/tests/test_security.py::test_hostname_ip_separation PASSED              [ 73%]
backend/tests/test_security.py::test_validate_redirect_chain PASSED             [ 78%]
backend/tests/test_security.py::test_scanner_semaphore PASSED                   [ 82%]
backend/tests/test_security.py::test_egress_proxy_configuration PASSED          [ 86%]
backend/tests/test_testbed.py::test_testbed_endpoint_accessible PASSED          [ 91%]
backend/tests/test_testbed.py::test_testbed_serves_synthetic_dom PASSED         [ 95%]
backend/tests/test_testbed.py::test_testbed_customer_api_vulnerable_state PASSED [100%]

============================= 23 passed in 17.36s =============================
```
**Result:** 23/23 tests passed.

---

## 5. Status of Phase 2 Roadmap

| Phase 2 Task | Status | Notes |
| :--- | :--- | :--- |
| **Task 1: Real HTTP Fix & Verify and Audit History** | **Completed** | Full backend verification endpoint, state toggle, SQLite audit history, and UI integration verified. |
| **Task 2: API URL Settings and Offline Behavior** | **Completed** | Centralized URL resolution, real-time validation, dynamic propagation, offline error surfacing, and demo fixture labeling verified. |
| **Task 3: Live Privacy Flow Graph** | Pending | Render real observed DOM-to-tracker data flows directly from scan observations. |
| **Task 4: Scan Progress Polling & Dashboard KPIs** | Pending | Connect scan progress to real backend task events and synchronize dashboard metrics with database scans. |
