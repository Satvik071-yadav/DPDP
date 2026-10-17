# Phase 2 Task 4 Implementation Report: Real Scan Progress Polling & Data-Driven Dashboard

**Project:** DPDP-Guard  
**Directory:** `D:\DPDP`  
**Date:** 2026-10-16  
**Status:** Completed and Verified  

---

## 1. Executive Summary

Phase 2 Task 4 eliminated synthetic `setTimeout` timer chains in the scan runner and replaced hardcoded dashboard metrics with real, data-driven aggregations from persistent database records.

Key achievements:
1. **Authoritative Backend Scan Lifecycle**:
   - Introduced persistent, authoritative scan stages (`queued`, `preparing_env`, `checking_endpoints`, `running_auth_tests`, `inspecting_network`, `preparing_evidence`, `completed`, `failed`, `cancelled`).
   - Exposed `GET /api/v1/scans/{scan_id}/status` and `POST /api/v1/scans/{scan_id}/cancel`.
   - Prevented duplicate in-flight scans for the same target by returning `HTTP 409 Conflict`.
   - Replaced deprecated `datetime.utcnow()` with timezone-aware UTC datetimes and robust date arithmetic (`safe_duration_seconds`).
2. **Real Frontend Scan Execution & Polling**:
   - Refactored `scanService.executeScan` to submit real async requests to `POST /api/v1/scans` (`asyncMode: true`) and poll `GET /api/v1/scans/{scan_id}/status` at 800ms intervals.
   - Preserved full path resolution for local testbed (`http://127.0.0.1:8000/testbed`).
   - Added `activeScanId` URL and `localStorage` persistence (`dpdp_active_scan_id`) so in-progress scans can be resumed across page reloads and navigation.
   - Provided an active "Click to Cancel" button hooked to `api.cancelScan`.
   - Cleaned up polling on component unmount via React `useRef` guard to avoid memory leaks and unmounted state updates.
   - Refreshed local caches (`api.getScans()`, `api.getFindings()`) upon scan completion.
3. **100% Data-Driven Overview Dashboard**:
   - **Monitored Websites**: Derived from unique target hostnames across stored scan jobs, with an honest empty state ("0" and "No targets") when no scans exist.
   - **Open Privacy Findings**: Filtered dynamically by active status (`open` or `in_review`) with severity breakdown (`{crit} Crit • {high} High`).
   - **Statutory Risk Liability**: Dynamically calculated per the DPDP Act 2023 schedule: ₹250 Cr max cap when critical findings exist (Section 8(5) & Section 33 failure of safeguards), proportional caps for high/medium findings, and an honest "₹0 Cr / ZERO RISK" when no findings exist.
   - **Verified Remediations**: Derived directly from real verification audit records (`api.getAuditHistory()`) and verified finding statuses, calculating true probe pass rates.
   - **Weekly Trajectory**: Dynamically aggregated from detection and verification timestamps over the past 7 days, falling back gracefully to day-of-week distributions for historical records rather than fabricated numbers.
   - **Activity Stream**: Constructed from real scan executions and verification probe outcomes, with distinct `[TESTBED]` / `[SYNTHETIC]` origin badges and an honest empty state.
4. **Verification**:
   - 26/26 backend pytest tests pass (`test_api.py` and `test_adversarial.py`).
   - 53/53 frontend tests pass across 3 test suites (`tests/api_config.test.ts`, `tests/privacy_flow.test.ts`, and `tests/dashboard_lifecycle.test.ts`).
   - Production bundle compiled cleanly via `npm run build` (`tsc && vite build`) with zero TypeScript errors.

---

## 2. Backend Scan Lifecycle Implementation

### 2.1 Authoritative Status & Cancellation Endpoints

**Routes Added (`backend/app/api/routes/scans.py`):**
- `GET /api/v1/scans/{scan_id}/status` -> Returns `ScanStatusResponseSchema`:
  ```json
  {
    "scanId": "SCAN-20261016-789",
    "status": "running",
    "stage": "running_auth_tests",
    "progress": 60,
    "log": "Executing comparative consent observation sessions (Accept vs Reject)",
    "initiatedAt": "2026-10-16T14:20:00Z",
    "completedAt": null,
    "errorMessage": null
  }
  ```
- `POST /api/v1/scans/{scan_id}/cancel` -> Gracefully transitions in-flight scan status to `cancelled`, releases the browser semaphore, and returns updated status.

### 2.2 Duplicate Scan Submission Prevention
When a scan request is submitted via `POST /api/v1/scans`, `scan_service.py` executes a database query checking if any job for the same target domain is currently in `queued` or `running` status:
```python
in_flight_res = await session.execute(
    select(ScanJob).where(
        ScanJob.target_url == validated_url,
        ScanJob.status.in_(["queued", "running"])
    )
)
if in_flight_res.scalar_one_or_none():
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"A scan for target {validated_url} is already in progress. Please await completion or cancel the active scan."
    )
```

### 2.3 Timezone-Aware UTC Timestamping & Safe Arithmetic
To prevent SQLite naive datetime subtraction crashes (`TypeError: can't subtract offset-naive and offset-aware datetimes`), `safe_duration_seconds` was introduced:
```python
def safe_duration_seconds(t1: datetime.datetime, t2: Optional[datetime.datetime]) -> int:
    if not t2:
        return 0
    if t1.tzinfo is not None and t2.tzinfo is None:
        t2 = t2.replace(tzinfo=datetime.timezone.utc)
    elif t1.tzinfo is None and t2.tzinfo is not None:
        t1 = t1.replace(tzinfo=datetime.timezone.utc)
    return max(1, int((t1 - t2).total_seconds()))
```

---

## 3. Frontend Real Progress Polling & Service Integration

### 3.1 Service Refactoring (`src/services/scanService.ts`)
- Replaced the previous `setTimeout` simulated delay sequence with real backend status polling.
- Calls `api.createScan(targetUrl, profile, consentComparison, true)` with `asyncMode: true`.
- Emits real progress events to `onProgress` callbacks based on the backend `stage`, `progress`, and `log`.
- Polls at 800ms intervals until terminal status (`completed`, `failed`, or `cancelled`), avoiding infinite loops with a 180-poll safeguard (~144 seconds).
- Exposes `pollExistingScan(scanId, onProgress)` for resuming in-flight scans.
- Preserves target subpaths (e.g. `http://127.0.0.1:8000/testbed`) instead of stripping them down to origin.

### 3.2 Component Lifecycle & Persistence (`src/pages/Scan.tsx`)
- Reads `searchParams.get('scanId')` and `localStorage.getItem('dpdp_active_scan_id')` on mount to resume in-flight scans across page reloads.
- Manages an unmount safety guard via `const isMounted = useRef(true)` to prevent state updates after unmount.
- Active scan button displays "Scanning in progress... (Click to Cancel)" and triggers `handleCancelScan`, sending `api.cancelScan`.
- Resets URL parameters and local storage when scans terminate or are reset.
- Syncs fresh scan results into local storage upon completion.

---

## 4. Data-Driven Dashboard (`src/pages/Overview.tsx`)

### 4.1 Real Metrics Calculation
1. **Websites Monitored**:
   ```typescript
   const uniqueDomains = Array.from(
     new Set(scans.map(s => {
       try { return new URL(s.targetUrl).hostname; } catch { return s.targetUrl; }
     }))
   ).filter(Boolean);
   const monitoredWebsitesCount = uniqueDomains.length;
   ```
2. **Open Privacy Findings**:
   Computed from `findings.filter(f => f.status === 'open' || f.status === 'in_review')`.
3. **Statutory Risk Liability**:
   - `criticalCount > 0`: ₹250 Cr (Section 8(5) & 33 Maximum Statutory Cap).
   - `highCount > 0`: `₹${Math.min(200, highCount * 50)} Cr` (Section 6 & 8 Exposure).
   - `mediumCount > 0`: `₹${Math.min(50, mediumCount * 10)} Cr` (Moderate Statutory Risk).
   - Zero findings: "₹0 Cr" and "ZERO RISK" badge.
4. **Verified Remediations**:
   Pass rate derived from `api.getAuditHistory()`: `Math.round((passedAuditCount / totalAuditCount) * 100)`.

### 4.2 Weekly Exposure vs. Verified Trajectory
- Calculates true daily counts for the last 7 calendar days from `f.detectedAt` and `a.timestamp`.
- Gracefully handles empty or historical databases by mapping existing records to day-of-week slots without inventing synthetic numbers.

### 4.3 Activity Feed & Table Empty States
- Combines recent scan jobs and automated verification probe records.
- Adds `[TESTBED]` badge for synthetic/sandbox actions (`paysecure-india.in`, testbed endpoints, or KYC probes).
- Displays clear, honest empty states for tables, metric cards, and activity streams when no records exist.

---

## 5. Verification Results

### 5.1 Backend Pytest Suite
Command: `backend\venv\Scripts\pytest -c backend\pytest.ini -v backend\tests`
Result: **26 passed** in 17.35s
Key tests verified:
- `test_scan_lifecycle_and_status_endpoint`: PASSED
- `test_scan_duplicate_submission_prevention`: PASSED (HTTP 409 Conflict verified)
- `test_scan_cancellation_lifecycle`: PASSED (Cancellation updates status and duration)
- `test_live_testbed_scan_findings_and_no_fixture_substitution`: PASSED
- `test_adversarial_redirect_to_private_ip`: PASSED
- `test_adversarial_egress_proxy_enforcement_and_auth`: PASSED

### 5.2 Frontend Test Suite
Command: `npm test` (`tsx tests/api_config.test.ts && tsx tests/privacy_flow.test.ts && tsx tests/dashboard_lifecycle.test.ts`)
Result: **53 passed, 0 failed**
- `api_config.test.ts`: 25 tests passed
- `privacy_flow.test.ts`: 15 tests passed
- `dashboard_lifecycle.test.ts`: 13 tests passed:
  - Target URL validation (rejects invalid/unauthorized, accepts testbed)
  - Polling through scan stages (`preparing_env` -> `checking_endpoints` -> `running_auth_tests` -> `completed`)
  - Error and cancellation handling without hanging
  - Statutory liability calculation according to DPDP schedule
  - Monitored websites calculation from distinct hostnames
  - Honest pass rate calculation from audit history records

### 5.3 Production Build
Command: `npm run build` (`tsc && vite build`)
Result: **Exit code 0**, built in 10.94s with zero TypeScript compiler or Vite bundling errors.
