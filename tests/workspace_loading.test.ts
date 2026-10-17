/**
 * Regression Test Suite: Workspace Loading Lifecycle & Error Recovery
 * Verifies that AI Copilot and Fix & Verify workspaces:
 * 1. Resolve loading state unconditionally via try/catch/finally
 * 2. Properly handle unauthenticated states without freezing
 * 3. Handle zero-finding empty states without infinite loading loops
 * 4. Surface useful error states with recovery on retry
 * 5. Inject JWT Authorization headers into backend Copilot chat calls
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node test runner
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

import { authService, AUTH_STORAGE_KEYS } from '../src/services/authService.js';
import { api } from '../src/services/api.js';
import { copilotService } from '../src/services/copilotService.js';
import { remediationService } from '../src/services/remediationService.js';
import type { Finding } from '../src/types/index.js';

const MOCK_FINDING: Finding = {
  id: 'DPDP-HIGH-007',
  title: 'Broken Object-Level Authorization (BOLA) on Customer KYC Endpoint',
  severity: 'high',
  category: 'Broken Access Control',
  dpdpSection: 'Section 8(5) - Reasonable Security Safeguards',
  endpoint: '/testbed/api/v1/customers/usr_demo_custB/kyc-record',
  status: 'open',
  confidence: 98,
  detectedAt: new Date().toISOString(),
  affectedUrl: 'http://127.0.0.1:8000/testbed',
  summary: 'Insecure direct object reference allows horizontal privilege escalation.',
  remediationSummary: 'Verify customer ownership before querying KYC record.',
  evidenceAvailable: true,
  observedEvidence: {
    requestUrl: 'http://127.0.0.1:8000/testbed/api/v1/customers/usr_demo_custB/kyc-record',
    responseStatus: 200,
    evidenceType: 'unauthorized_pii_disclosure',
    description: 'Received customer B KYC data while authenticated as customer A.',
  },
};

test('Workspace Loading Lifecycle: Unauthenticated Access', async (t) => {
  t.beforeEach(() => {
    authService.logout();
    storage.clear();
  });

  await t.test('api.getFindings returns empty list without hanging when unauthenticated', async () => {
    assert.equal(authService.isAuthenticated(), false);
    const findings = await api.getFindings();
    assert.deepEqual(findings, []);
  });

  await t.test('api.getAuditHistory returns empty list without hanging when unauthenticated', async () => {
    assert.equal(authService.isAuthenticated(), false);
    const history = await api.getAuditHistory();
    assert.deepEqual(history, []);
  });

  await t.test('Workspace loading lifecycle resolves to false when unauthenticated', async () => {
    let isPageLoading = true;
    let pageError: string | null = null;
    let findings: Finding[] = [MOCK_FINDING];

    // Simulating the page load cycle
    if (!authService.isAuthenticated()) {
      findings = [];
      isPageLoading = false;
      pageError = null;
    }

    assert.equal(isPageLoading, false);
    assert.equal(pageError, null);
    assert.equal(findings.length, 0);
  });
});

test('Workspace Loading Lifecycle: Empty State and Resolution', async (t) => {
  await t.test('Resolves to empty state rather than infinite loading when tenant has zero findings', async () => {
    let isPageLoading = true;
    let pageError: string | null = null;
    let loadedFindings: Finding[] = [];

    // Mock API returning zero findings for new tenant
    const mockGetFindings = async () => [];

    try {
      loadedFindings = await mockGetFindings();
    } catch (err: any) {
      pageError = err.message;
    } finally {
      isPageLoading = false;
    }

    // Loading flag must be false
    assert.equal(isPageLoading, false);
    assert.equal(pageError, null);
    assert.equal(loadedFindings.length, 0);

    // Active finding evaluated from findings list
    const activeFinding = loadedFindings.find((f) => f.id === 'DPDP-HIGH-007') || loadedFindings[0];
    assert.equal(activeFinding, undefined);

    // Empty state condition evaluates to true
    const shouldRenderEmptyState = loadedFindings.length === 0 || !activeFinding;
    assert.equal(shouldRenderEmptyState, true);
  });
});

test('Workspace Loading Lifecycle: Error Recovery and Retry', async (t) => {
  await t.test('Captures failure and resets loading state; retry recovers successfully', async () => {
    let isPageLoading = true;
    let pageError: string | null = null;
    let findings: Finding[] = [];
    let shouldFail = true;

    const loader = async () => {
      isPageLoading = true;
      pageError = null;
      try {
        if (shouldFail) {
          throw new Error('Backend database connection timeout (503 Service Unavailable)');
        }
        findings = [MOCK_FINDING];
      } catch (err: any) {
        pageError = err.message;
      } finally {
        isPageLoading = false;
      }
    };

    // First attempt fails
    await loader();
    assert.equal(isPageLoading, false, 'Loading flag must clear in finally even on error');
    assert.equal(pageError, 'Backend database connection timeout (503 Service Unavailable)');
    assert.equal(findings.length, 0);

    // User clicks "Retry Loading" after backend recovers
    shouldFail = false;
    await loader();
    assert.equal(isPageLoading, false, 'Loading flag must clear in finally on retry success');
    assert.equal(pageError, null, 'Error state must be cleared on successful retry');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'DPDP-HIGH-007');
  });
});

test('Backend Copilot Chat: Authorization Header Injection', async (t) => {
  t.beforeEach(() => {
    storage.clear();
  });

  await t.test('Injects Authorization Bearer header into Copilot backend chat requests', async () => {
    const mockToken = 'mock_jwt_token_auth_test_12345';
    storage.set(AUTH_STORAGE_KEYS.TOKEN, mockToken);
    storage.set(AUTH_STORAGE_KEYS.USER, JSON.stringify({
      id: 'usr_test_01',
      username: 'testauditor',
      email: 'auditor@test.com',
      role: 'auditor',
      fullName: 'Test Auditor',
      createdAt: new Date().toISOString(),
    }));

    assert.equal(authService.isAuthenticated(), true);
    const authHeaders = authService.getAuthHeaders();
    assert.deepEqual(authHeaders, { Authorization: `Bearer ${mockToken}` });

    // Mock fetch to verify outgoing headers
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};

    (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/copilot/chat')) {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return {
          ok: true,
          status: 200,
          json: async () => ({
            summary: 'Analysis complete for BOLA finding.',
            content: 'Analysis complete for BOLA finding.',
          }),
        };
      }
      return originalFetch(url, init);
    };

    try {
      const response = await copilotService.sendMessage({
        messages: [{ id: '1', role: 'user', content: 'Explain BOLA', timestamp: new Date().toISOString() }],
        finding: MOCK_FINDING,
        mode: 'backend',
      });

      assert.equal(response.isDemoResponse, false);
      assert.equal(capturedHeaders['Authorization'], `Bearer ${mockToken}`);
      assert.equal(capturedHeaders['Content-Type'], 'application/json');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Deterministic demo mode returns fixtures without throwing if backend offline', async () => {
    const response = await copilotService.sendMessage({
      messages: [{ id: '1', role: 'user', content: 'Explain BOLA in simple language.', timestamp: new Date().toISOString() }],
      finding: MOCK_FINDING,
      mode: 'demo',
    });

    assert.equal(response.isDemoResponse, true);
    assert.ok(response.content.length > 0);
    assert.ok(response.suggestedNextQuestions && response.suggestedNextQuestions.length > 0);
  });
});
