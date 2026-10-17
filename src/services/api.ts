import { 
  ScanResult, 
  Finding, 
  ScanProfile, 
  FindingStatus, 
  UserSettings, 
  VerificationProbeResult, 
  AuditHistoryRecord,
  BrowserObservation,
  ConsentComparisonSummary,
  ScanStatusResponse,
  NotificationItem
} from '@/types';
import { DEMO_SCANS, DEMO_FINDINGS, DEFAULT_USER_SETTINGS, DEMO_ACTIVITIES } from '@/data/mockData';
import { 
  getApiBaseUrl, 
  validateApiUrl, 
  setApiBaseUrl, 
  STORAGE_KEYS 
} from '@/services/apiConfig';

function initializeStorage() {
  if (typeof localStorage === 'undefined') return;
  if (!localStorage.getItem(STORAGE_KEYS.SCANS)) {
    localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(DEMO_SCANS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.FINDINGS)) {
    localStorage.setItem(STORAGE_KEYS.FINDINGS, JSON.stringify(DEMO_FINDINGS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_USER_SETTINGS));
  }
}

initializeStorage();

export const api = {
  async getSettings(): Promise<UserSettings> {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/settings`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        const data: UserSettings = await response.json();
        if (data && typeof data === 'object') {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data));
          return data;
        }
      }
    } catch {
      // Fallback to local storage when backend is offline
    }

    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : DEFAULT_USER_SETTINGS;
    } catch {
      return DEFAULT_USER_SETTINGS;
    }
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    if (settings.apiUrl) {
      const val = setApiBaseUrl(settings.apiUrl);
      if (val.valid && val.normalizedUrl) {
        settings.apiUrl = val.normalizedUrl;
      }
    }
    // Update local storage immediately for responsive UI
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));

    // Persist to backend database asynchronously
    const baseUrl = getApiBaseUrl();
    try {
      await fetch(`${baseUrl}/api/v1/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(settings),
      });
    } catch {
      // Offline fallback: settings safely preserved in localStorage
    }
  },

  /**
   * Fetch real-time audit notifications from backend.
   * Gracefully falls back to demo activities when offline.
   */
  async getNotifications(): Promise<NotificationItem[]> {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/notifications`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch {
      // Network offline
    }

    // Fallback to DEMO_ACTIVITIES
    return DEMO_ACTIVITIES.map((act) => ({
      id: act.id,
      type: act.type,
      title: act.title,
      description: act.description,
      timestamp: act.timestamp,
      severity: act.severity,
      link: '/history',
      isSynthetic: true,
    }));
  },

  /**
   * Fetch scans from backend when available.
   * In Demo Mode, returns clearly labeled demo fixtures when offline.
   * If Demo Mode is disabled and backend is offline, throws descriptive error.
   */
  async getScans(): Promise<ScanResult[]> {
    const baseUrl = getApiBaseUrl();
    const settings = await this.getSettings();

    try {
      const response = await fetch(`${baseUrl}/api/v1/scans`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        const data: ScanResult[] = await response.json();
        if (Array.isArray(data)) {
          localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(data));
          return data;
        }
      }
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (err: any) {
      // Backend unavailable fallback
      if (settings.demoMode) {
        return DEMO_SCANS.map((s) => ({
          ...s,
          isDemo: true,
          notes: s.notes || '[DEMO FIXTURE] Loaded in synthetic Demo Mode',
          findings: (s.findings || []).map((f) => ({ ...f, isDemoFixture: true })),
        }));
      }
      throw new Error(
        `Unable to fetch scans: Backend offline or unreachable at ${baseUrl} (${err.message}). Demo mode is disabled.`
      );
    }
  },

  async getScanById(id: string): Promise<ScanResult | null> {
    const baseUrl = getApiBaseUrl();
    const settings = await this.getSettings();

    try {
      const response = await fetch(`${baseUrl}/api/v1/scans/${id}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err: any) {
      if (!settings.demoMode) {
        throw new Error(`Unable to fetch scan ${id}: Backend unavailable at ${baseUrl} (${err.message})`);
      }
    }

    const scans = await this.getScans();
    return scans.find((s) => s.id === id) || null;
  },

  /**
   * Fetch findings from backend when available.
   * In Demo Mode, returns clearly labeled demo fixtures when offline.
   * If Demo Mode is disabled and backend is offline, throws descriptive error.
   */
  async getFindings(): Promise<Finding[]> {
    const baseUrl = getApiBaseUrl();
    const settings = await this.getSettings();

    try {
      const response = await fetch(`${baseUrl}/api/v1/findings`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        const data: Finding[] = await response.json();
        if (Array.isArray(data)) {
          localStorage.setItem(STORAGE_KEYS.FINDINGS, JSON.stringify(data));
          return data;
        }
      }
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (err: any) {
      // Backend unavailable fallback
      if (settings.demoMode) {
        return DEMO_FINDINGS.map((f) => ({
          ...f,
          isDemoFixture: true,
        }));
      }
      throw new Error(
        `Unable to fetch findings: Backend offline or unreachable at ${baseUrl} (${err.message}). Demo mode is disabled.`
      );
    }
  },

  async getFindingById(id: string): Promise<Finding | null> {
    const baseUrl = getApiBaseUrl();
    const settings = await this.getSettings();

    try {
      const response = await fetch(`${baseUrl}/api/v1/findings/${id}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err: any) {
      if (!settings.demoMode) {
        throw new Error(`Unable to fetch finding ${id}: Backend unavailable at ${baseUrl} (${err.message})`);
      }
    }

    const findings = await this.getFindings();
    return findings.find((f) => f.id === id) || null;
  },

  async updateFindingStatus(id: string, status: FindingStatus): Promise<Finding | null> {
    const baseUrl = getApiBaseUrl();
    const settings = await this.getSettings();

    // Attempt backend update
    try {
      const response = await fetch(`${baseUrl}/api/v1/findings/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        const updatedFinding: Finding = await response.json();
        // Sync local storage cache
        try {
          const localFindings = await this.getFindings();
          const idx = localFindings.findIndex((f) => f.id === id);
          if (idx !== -1) {
            localFindings[idx] = updatedFinding;
            localStorage.setItem(STORAGE_KEYS.FINDINGS, JSON.stringify(localFindings));
          }
        } catch {
          // ignore
        }
        return updatedFinding;
      }
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (err: any) {
      if (!settings.demoMode) {
        throw new Error(`Failed to update finding status: Backend unreachable at ${baseUrl} (${err.message})`);
      }
    }

    // Demo Mode fallback update in local cache
    const findings = await this.getFindings();
    const index = findings.findIndex((f) => f.id === id);
    if (index === -1) return null;

    findings[index] = {
      ...findings[index],
      status,
      isDemoFixture: true,
      verificationHistory: [
        ...(findings[index].verificationHistory || []),
        {
          id: `VER-${Date.now()}`,
          timestamp: new Date().toISOString(),
          status: status === 'verified_fix' ? 'passed' : 'pending',
          verifiedBy: 'Security Auditor (UI demo action)',
          notes: `Status updated to ${status} in local demo session.`,
        },
      ],
    };

    localStorage.setItem(STORAGE_KEYS.FINDINGS, JSON.stringify(findings));
    return findings[index];
  },

  async createScan(
    targetUrl: string, 
    profile: ScanProfile, 
    consentMode: boolean,
    asyncMode: boolean = false
  ): Promise<ScanResult> {
    const baseUrl = getApiBaseUrl();
    const settings = await this.getSettings();

    // Attempt backend creation
    try {
      const response = await fetch(`${baseUrl}/api/v1/scans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          targetUrl,
          profile,
          consentModeEnabled: consentMode,
          asyncMode,
        }),
      });

      if (response.ok) {
        const scanResult: ScanResult = await response.json();
        // Update local cache
        try {
          const currentScans = await this.getScans();
          const updatedScans = [scanResult, ...currentScans.filter((s) => s.id !== scanResult.id)];
          localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(updatedScans));
        } catch {
          // ignore
        }
        return scanResult;
      }

      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) errorDetail = errJson.detail;
      } catch {
        // ignore
      }
      throw new Error(`Backend scan rejected: ${errorDetail}`);
    } catch (err: any) {
      // If Demo Mode is enabled, create an explicit demo scan labeled clearly
      if (settings.demoMode) {
        const demoFindings = (await this.getFindings()).slice(0, 6).map((f) => ({
          ...f,
          isDemoFixture: true,
        }));

        const newScan: ScanResult = {
          id: `DEMO-SCAN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
          targetUrl,
          profile,
          initiatedAt: new Date().toISOString(),
          completedAt: new Date(Date.now() + 54000).toISOString(),
          durationSeconds: 54,
          status: 'completed',
          riskScore: 74,
          complianceScore: 46,
          consentModeEnabled: consentMode,
          findingsCount: {
            critical: 1,
            high: 2,
            medium: 2,
            low: 1,
            info: 0,
            total: 6,
          },
          findings: demoFindings,
          isDemo: true,
          notes: '[DEMO FIXTURE] Generated in explicit demo mode (Backend offline)',
        };

        try {
          const currentScans = await this.getScans();
          const updated = [newScan, ...currentScans];
          localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return newScan;
      }

      // If NOT in demo mode, NEVER silently fabricate fake scans!
      throw new Error(
        `Failed to initiate scan: Backend scan service is offline or unreachable at ${baseUrl} (${err.message}). Demo mode is disabled.`
      );
    }
  },

  async getScanStatus(scanId: string): Promise<ScanStatusResponse> {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/scans/${scanId}/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) errorDetail = errJson.detail;
      } catch {}
      throw new Error(`Failed to fetch scan status: ${errorDetail}`);
    } catch (err: any) {
      throw new Error(`Unable to fetch scan status: ${err.message}`);
    }
  },

  async cancelScan(scanId: string): Promise<ScanStatusResponse> {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/scans/${scanId}/cancel`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) errorDetail = errJson.detail;
      } catch {}
      throw new Error(`Failed to cancel scan: ${errorDetail}`);
    } catch (err: any) {
      throw new Error(`Unable to cancel scan: ${err.message}`);
    }
  },

  async verifyFinding(findingId: string, isPatched: boolean): Promise<VerificationProbeResult> {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/findings/${findingId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ isPatched }),
    });
    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) errorDetail = errJson.detail;
      } catch {
        // fallback
      }
      throw new Error(`Backend verification failed: ${errorDetail}`);
    }
    return await response.json();
  },

  async getAuditHistory(): Promise<AuditHistoryRecord[]> {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/findings/verification/audit-history`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) errorDetail = errJson.detail;
      } catch {
        // fallback
      }
      throw new Error(`Failed to load audit history: ${errorDetail}`);
    }
    return await response.json();
  },

  async clearAuditHistory(): Promise<void> {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/findings/verification/audit-history?confirm=true`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Failed to clear audit history: HTTP ${response.status}`);
    }
  },

  async getScanObservations(scanId: string): Promise<BrowserObservation[]> {
    const baseUrl = getApiBaseUrl();
    const settings = await this.getSettings();

    try {
      const response = await fetch(`${baseUrl}/api/v1/scans/${scanId}/observations`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 404) {
        return [];
      }
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) errorDetail = errJson.detail;
      } catch {
        // fallback
      }
      throw new Error(errorDetail);
    } catch (err: any) {
      if (!settings.demoMode) {
        throw new Error(`Failed to load observations for scan '${scanId}': ${err.message}`);
      }
      // Demo mode fallback: if this is a known demo scan, caller can handle or return empty
      return [];
    }
  },

  async getConsentComparison(scanId: string): Promise<ConsentComparisonSummary | null> {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/scans/${scanId}/consent-comparison`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 404) {
        return null;
      }
    } catch {
      // Consent comparison is optional / secondary metadata
    }
    return null;
  },

  async checkHealth(): Promise<{ status: string; service?: string; database?: string }> {
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        return await response.json();
      }
      return { status: 'error' };
    } catch {
      return { status: 'offline' };
    }
  },

  async testBackendConnection(endpointUrl: string): Promise<{ ok: boolean; message: string; latencyMs: number; normalizedUrl?: string }> {
    const validation = validateApiUrl(endpointUrl);
    if (!validation.valid || !validation.normalizedUrl) {
      return {
        ok: false,
        message: validation.error || 'Invalid API URL format. Please enter a valid URL (e.g. http://127.0.0.1:8000).',
        latencyMs: 0,
      };
    }

    const baseUrl = validation.normalizedUrl;
    const start = performance.now();

    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      const end = performance.now();

      if (response.ok) {
        const data = await response.json();
        return { 
          ok: true, 
          message: `Connected to DPDP-Guard Backend (${data.service || 'v1.0.0'}, DB: ${data.database || 'healthy'})`, 
          latencyMs: Math.round(end - start),
          normalizedUrl: baseUrl,
        };
      }
      return { 
        ok: false, 
        message: `Backend returned HTTP ${response.status} ${response.statusText}`, 
        latencyMs: Math.round(end - start),
        normalizedUrl: baseUrl,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Connection refused or network error at ${baseUrl}/api/health (${err.message || 'Server offline'}).`,
        latencyMs: 0,
        normalizedUrl: baseUrl,
      };
    }
  },
};
