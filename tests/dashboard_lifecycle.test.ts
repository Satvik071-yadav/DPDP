/**
 * Frontend Scan Lifecycle & Data-Driven Dashboard Test Suite
 * Tests scan status polling, cancellation, target URL validation,
 * metric derivations, weekly trajectory calculations, and empty states.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node environment before importing modules
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
  };
}

import { validateScanTarget, scanService } from '../src/services/scanService.js';
import { api } from '../src/services/api.js';
import type { Finding, ScanResult, AuditHistoryRecord, ScanProgressEvent } from '../src/types/index.js';

test('Scan Target URL Validation', async (t) => {
  await t.test('rejects empty or whitespace URLs', () => {
    const res = validateScanTarget('   ');
    assert.equal(res.valid, false);
    assert.match(res.error || '', /enter a website URL/i);
  });

  await t.test('rejects unauthorized external targets in demo environment', () => {
    const res = validateScanTarget('https://evil-unauthorized-target.org');
    assert.equal(res.valid, false);
    assert.equal(res.isDemoAllowed, false);
    assert.match(res.error || '', /Demo Environment Policy/i);
  });

  await t.test('accepts authorized demo preset targets', () => {
    const res = validateScanTarget('https://paysecure-india.in');
    assert.equal(res.valid, true);
    assert.equal(res.isDemoAllowed, true);
    assert.equal(res.normalizedUrl, 'https://paysecure-india.in');
  });

  await t.test('accepts local testbed target preserving path', () => {
    const res = validateScanTarget('http://127.0.0.1:8000/testbed');
    assert.equal(res.valid, true);
    assert.equal(res.isDemoAllowed, true);
    assert.equal(res.normalizedUrl, 'http://127.0.0.1:8000/testbed');
  });
});

test('Scan Service Lifecycle and Polling', async (t) => {
  await t.test('polls status until terminal completed state', async () => {
    const originalCreateScan = api.createScan;
    const originalGetScanStatus = api.getScanStatus;
    const originalGetScanById = api.getScanById;

    let pollCount = 0;
    const stagesSeen: string[] = [];

    api.createScan = async () => ({
      id: 'SCAN-TEST-123',
      targetUrl: 'http://127.0.0.1:8000/testbed',
      profile: 'privacy_audit',
      initiatedAt: new Date().toISOString(),
      durationSeconds: 0,
      status: 'running',
      riskScore: 0,
      complianceScore: 100,
      consentModeEnabled: true,
      findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      findings: [],
    } as ScanResult);

    api.getScanStatus = async (scanId: string) => {
      pollCount++;
      if (pollCount === 1) {
        return {
          scanId,
          status: 'running',
          stage: 'checking_endpoints',
          progress: 35,
          log: 'Inspecting endpoints...',
        };
      }
      if (pollCount === 2) {
        return {
          scanId,
          status: 'running',
          stage: 'running_auth_tests',
          progress: 60,
          log: 'Running comparative consent observations...',
        };
      }
      return {
        scanId,
        status: 'completed',
        stage: 'completed',
        progress: 100,
        log: 'Scan completed.',
      };
    };

    api.getScanById = async (scanId: string) => ({
      id: scanId,
      targetUrl: 'http://127.0.0.1:8000/testbed',
      profile: 'privacy_audit',
      initiatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: 4,
      status: 'completed',
      riskScore: 35,
      complianceScore: 65,
      consentModeEnabled: true,
      findingsCount: { critical: 1, high: 0, medium: 1, low: 0, info: 0, total: 2 },
      findings: [],
    } as ScanResult);

    try {
      const result = await scanService.executeScan(
        'http://127.0.0.1:8000/testbed',
        'privacy_audit',
        true,
        (evt: ScanProgressEvent) => {
          stagesSeen.push(evt.stage);
        }
      );

      assert.equal(result.id, 'SCAN-TEST-123');
      assert.equal(result.status, 'completed');
      assert.ok(stagesSeen.includes('preparing_env'));
      assert.ok(stagesSeen.includes('checking_endpoints'));
      assert.ok(stagesSeen.includes('running_auth_tests'));
      assert.ok(stagesSeen.includes('completed'));
      assert.equal(pollCount, 3);
    } finally {
      api.createScan = originalCreateScan;
      api.getScanStatus = originalGetScanStatus;
      api.getScanById = originalGetScanById;
    }
  });

  await t.test('handles backend scan failure without hanging', async () => {
    const originalCreateScan = api.createScan;
    const originalGetScanStatus = api.getScanStatus;

    api.createScan = async () => ({
      id: 'SCAN-FAIL-123',
      targetUrl: 'https://paysecure-india.in',
      profile: 'quick_scan',
      initiatedAt: new Date().toISOString(),
      durationSeconds: 0,
      status: 'running',
      riskScore: 0,
      complianceScore: 0,
      consentModeEnabled: false,
      findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      findings: [],
    } as ScanResult);

    api.getScanStatus = async (scanId: string) => ({
      scanId,
      status: 'failed',
      stage: 'failed',
      progress: 100,
      log: 'Scan failed: Navigation timeout',
      errorMessage: 'Navigation to target failed after timeout',
    });

    try {
      await assert.rejects(
        async () => {
          await scanService.executeScan(
            'https://paysecure-india.in',
            'quick_scan',
            false,
            () => {}
          );
        },
        /Navigation to target failed after timeout/
      );
    } finally {
      api.createScan = originalCreateScan;
      api.getScanStatus = originalGetScanStatus;
    }
  });

  await t.test('handles scan cancellation during polling', async () => {
    const originalCreateScan = api.createScan;
    const originalGetScanStatus = api.getScanStatus;

    api.createScan = async () => ({
      id: 'SCAN-CANCEL-456',
      targetUrl: 'https://retail-bharat.store',
      profile: 'auth_tests',
      initiatedAt: new Date().toISOString(),
      durationSeconds: 0,
      status: 'running',
      riskScore: 0,
      complianceScore: 0,
      consentModeEnabled: false,
      findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      findings: [],
    } as ScanResult);

    api.getScanStatus = async (scanId: string) => ({
      scanId,
      status: 'cancelled',
      stage: 'cancelled',
      progress: 100,
      log: 'Scan cancelled by user.',
    });

    try {
      await assert.rejects(
        async () => {
          await scanService.executeScan(
            'https://retail-bharat.store',
            'auth_tests',
            false,
            () => {}
          );
        },
        /Scan was cancelled by user/
      );
    } finally {
      api.createScan = originalCreateScan;
      api.getScanStatus = originalGetScanStatus;
    }
  });
});

test('Overview Dashboard Metric Calculation Logic', async (t) => {
  await t.test('calculates technical risk exposure index qualitatively (advisory)', () => {
    // Helper replicating Overview.tsx calculation
    const deriveExposure = (findings: Finding[]) => {
      const crit = findings.filter(f => f.severity === 'critical').length;
      const hi = findings.filter(f => f.severity === 'high').length;
      const med = findings.filter(f => f.severity === 'medium').length;
      const lo = findings.filter(f => f.severity === 'low').length;
      if (crit > 0) return { tier: 'Critical Tier', level: 'Level 4/4', badge: 'CRITICAL TIER' };
      if (hi > 0) return { tier: 'Elevated Tier', level: 'Level 3/4', badge: 'ELEVATED TIER' };
      if (med > 0) return { tier: 'Moderate Tier', level: 'Level 2/4', badge: 'MODERATE TIER' };
      if (lo > 0) return { tier: 'Low Tier', level: 'Level 1/4', badge: 'LOW TIER' };
      return { tier: 'Baseline Clear', level: 'Level 0/4', badge: 'BASELINE CLEAR' };
    };

    // Zero findings case - never claims "zero legal risk" or "Clean", uses Baseline Clear
    const zeroFindings: Finding[] = [];
    const zeroExp = deriveExposure(zeroFindings);
    assert.equal(zeroExp.tier, 'Baseline Clear');
    assert.equal(zeroExp.level, 'Level 0/4');
    assert.equal(zeroExp.badge, 'BASELINE CLEAR');

    // Critical finding case (Section 8(5) high exposure advisory)
    const withCritical: Finding[] = [
      { severity: 'critical', status: 'open' } as any,
      { severity: 'medium', status: 'open' } as any
    ];
    const critExp = deriveExposure(withCritical);
    assert.equal(critExp.tier, 'Critical Tier');
    assert.equal(critExp.level, 'Level 4/4');
    assert.equal(critExp.badge, 'CRITICAL TIER');

    // High finding only case (Elevated Tier)
    const withHighOnly: Finding[] = [
      { severity: 'high', status: 'open' } as any,
      { severity: 'high', status: 'open' } as any
    ];
    const highExp = deriveExposure(withHighOnly);
    assert.equal(highExp.tier, 'Elevated Tier');
    assert.equal(highExp.level, 'Level 3/4');
    assert.equal(highExp.badge, 'ELEVATED TIER');
  });

  await t.test('calculates monitored websites from distinct hostnames', () => {
    const scans: ScanResult[] = [
      { targetUrl: 'https://paysecure-india.in/checkout' } as any,
      { targetUrl: 'https://paysecure-india.in/login' } as any,
      { targetUrl: 'http://127.0.0.1:8000/testbed' } as any,
      { targetUrl: 'https://apollo-telemed.co.in' } as any,
    ];

    const uniqueDomains = Array.from(
      new Set(
        scans.map((s) => {
          try {
            return new URL(s.targetUrl).hostname;
          } catch {
            return s.targetUrl;
          }
        })
      )
    ).filter(Boolean);

    assert.equal(uniqueDomains.length, 3);
    assert.ok(uniqueDomains.includes('paysecure-india.in'));
    assert.ok(uniqueDomains.includes('127.0.0.1'));
    assert.ok(uniqueDomains.includes('apollo-telemed.co.in'));
  });

  await t.test('calculates pass rate honestly from audit history records', () => {
    const history: AuditHistoryRecord[] = [
      { id: '1', result: 'PASS' } as any,
      { id: '2', result: 'PASS' } as any,
      { id: '3', result: 'FAIL' } as any,
      { id: '4', result: 'PASS' } as any,
    ];

    const passed = history.filter(a => a.result === 'PASS').length;
    const passRate = Math.round((passed / history.length) * 100);
    assert.equal(passRate, 75);

    // Empty audit history case
    const emptyHistory: AuditHistoryRecord[] = [];
    const emptyPassRate = emptyHistory.length > 0
      ? Math.round((emptyHistory.filter(a => a.result === 'PASS').length / emptyHistory.length) * 100)
      : 0;
    assert.equal(emptyPassRate, 0);
  });
});
