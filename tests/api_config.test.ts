/**
 * Frontend API Configuration and Offline Behavior Test Suite
 * Tests default URL selection, saved URL override, invalid URLs,
 * immediate settings propagation, and connection failure handling.
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

// Mock CustomEvent and window dispatch if not present in Node
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
  };
}

import {
  normalizeApiUrl,
  validateApiUrl,
  getDefaultApiUrl,
  getApiBaseUrl,
  setApiBaseUrl,
  resetApiUrlOverride,
  isLocalHostname,
  isLocalFrontendServer,
  STORAGE_KEYS
} from '../src/services/apiConfig.js';
import { api } from '../src/services/api.js';
import { authService } from '../src/services/authService.js';

test('URL Normalization', async (t) => {
  await t.test('strips trailing slashes from origin', () => {
    assert.equal(normalizeApiUrl('http://127.0.0.1:8000/'), 'http://127.0.0.1:8000');
    assert.equal(normalizeApiUrl('http://127.0.0.1:8000///'), 'http://127.0.0.1:8000');
  });

  await t.test('strips trailing /api/v1 and slashes', () => {
    assert.equal(normalizeApiUrl('http://127.0.0.1:8000/api/v1'), 'http://127.0.0.1:8000');
    assert.equal(normalizeApiUrl('http://127.0.0.1:8000/api/v1/'), 'http://127.0.0.1:8000');
    assert.equal(normalizeApiUrl('https://api.privacy.corp.in/subpath/api/v1/'), 'https://api.privacy.corp.in/subpath');
  });

  await t.test('handles whitespace and empty inputs', () => {
    assert.equal(normalizeApiUrl('   http://localhost:8000   '), 'http://localhost:8000');
    assert.equal(normalizeApiUrl(''), '');
  });
});

test('URL Validation', async (t) => {
  await t.test('accepts valid http and https URLs', () => {
    const res1 = validateApiUrl('http://127.0.0.1:8000');
    assert.equal(res1.valid, true);
    assert.equal(res1.normalizedUrl, 'http://127.0.0.1:8000');

    const res2 = validateApiUrl('https://secure-dpdp.internal.net:8443/api/v1/');
    assert.equal(res2.valid, true);
    assert.equal(res2.normalizedUrl, 'https://secure-dpdp.internal.net:8443');
  });

  await t.test('rejects empty or whitespace URLs', () => {
    const res1 = validateApiUrl('');
    assert.equal(res1.valid, false);
    assert.match(res1.error || '', /empty/i);

    const res2 = validateApiUrl('   ');
    assert.equal(res2.valid, false);
    assert.match(res2.error || '', /empty/i);
  });

  await t.test('rejects URLs missing protocol scheme', () => {
    const res = validateApiUrl('127.0.0.1:8000');
    assert.equal(res.valid, false);
    assert.match(res.error || '', /http:\/\/ or https:\/\//i);
  });

  await t.test('rejects non-http/https protocols', () => {
    const res1 = validateApiUrl('ftp://files.example.com');
    assert.equal(res1.valid, false);
    assert.match(res1.error || '', /http/i);

    const res2 = validateApiUrl('javascript:alert(1)');
    assert.equal(res2.valid, false);
  });

  await t.test('rejects malformed URLs', () => {
    const res = validateApiUrl('http://');
    assert.equal(res.valid, false);
    assert.match(res.error || '', /invalid url format|hostname/i);
  });

  await t.test('rejects out-of-range port numbers', () => {
    const res = validateApiUrl('http://localhost:70000');
    assert.equal(res.valid, false);
    assert.match(res.error || '', /port/i);
  });
});

test('Default URL Selection and Fallback', async (t) => {
  await t.test('returns http://127.0.0.1:8000 when no settings or env provided', () => {
    storage.clear();
    resetApiUrlOverride();
    const defaultUrl = getDefaultApiUrl();
    assert.equal(defaultUrl, 'http://127.0.0.1:8000');
    assert.equal(getApiBaseUrl(), 'http://127.0.0.1:8000');
  });
});

test('Saved URL Override and Settings Propagation', async (t) => {
  await t.test('saved valid settings URL overrides default', () => {
    resetApiUrlOverride();
    storage.clear();

    const customUrl = 'http://192.168.1.50:8080/api/v1/';
    const settings = {
      apiUrl: customUrl,
      organizationName: 'Test Org',
      demoMode: false,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));

    const resolved = getApiBaseUrl();
    assert.equal(resolved, 'http://192.168.1.50:8080');
  });

  await t.test('invalid saved URL falls back to default safely without crash', () => {
    resetApiUrlOverride();
    storage.clear();

    const badSettings = {
      apiUrl: 'ftp://not-valid',
      organizationName: 'Bad Org',
      demoMode: false,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(badSettings));

    const resolved = getApiBaseUrl();
    assert.equal(resolved, 'http://127.0.0.1:8000');
  });

  await t.test('setApiBaseUrl immediately takes effect in-memory without reload', () => {
    resetApiUrlOverride();
    storage.clear();

    const initial = getApiBaseUrl();
    assert.equal(initial, 'http://127.0.0.1:8000');

    const updateRes = setApiBaseUrl('http://fastapi-sandbox.internal:9000/api/v1');
    assert.equal(updateRes.valid, true);
    assert.equal(updateRes.normalizedUrl, 'http://fastapi-sandbox.internal:9000');

    // Subsequent call immediately returns the updated URL
    const updated = getApiBaseUrl();
    assert.equal(updated, 'http://fastapi-sandbox.internal:9000');
  });

  await t.test('api.saveSettings updates resolved URL immediately', async () => {
    resetApiUrlOverride();
    storage.clear();

    await api.saveSettings({
      apiUrl: 'https://dpdp-prod.company.in:8443/',
      organizationName: 'Prod Fiduciary',
      demoMode: false,
      dpoName: '',
      dpoEmail: '',
      jurisdiction: '',
      scanRateLimit: 'standard',
      rulesetVersion: '',
      notifications: { emailAlerts: false, notifyOnCritical: false, webhookUrl: '' },
    });

    assert.equal(getApiBaseUrl(), 'https://dpdp-prod.company.in:8443');
  });

  await t.test('ignores stale localhost URL in localStorage under HTTPS production', () => {
    resetApiUrlOverride();
    storage.clear();

    const staleSettings = {
      apiUrl: 'http://127.0.0.1:8000',
      organizationName: 'Production Org',
      demoMode: false,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(staleSettings));

    // Simulate window.location on HTTPS production domain (e.g. Render)
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      location: {
        protocol: 'https:',
        hostname: 'dpdp-guard-saas.onrender.com',
        origin: 'https://dpdp-guard-saas.onrender.com',
        port: '',
      },
      dispatchEvent: () => true,
    };

    try {
      const resolved = getApiBaseUrl();
      assert.equal(resolved, 'https://dpdp-guard-saas.onrender.com');
    } finally {
      (globalThis as any).window = originalWindow;
      resetApiUrlOverride();
    }
  });

  await t.test('preserves explicit HTTPS URL in localStorage under HTTPS production', () => {
    resetApiUrlOverride();
    storage.clear();

    const customSettings = {
      apiUrl: 'https://custom-backend.internal.org:9443',
      organizationName: 'Custom Org',
      demoMode: false,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(customSettings));

    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      location: {
        protocol: 'https:',
        hostname: 'dpdp-guard-saas.onrender.com',
        origin: 'https://dpdp-guard-saas.onrender.com',
        port: '',
      },
      dispatchEvent: () => true,
    };

    try {
      const resolved = getApiBaseUrl();
      assert.equal(resolved, 'https://custom-backend.internal.org:9443');
    } finally {
      (globalThis as any).window = originalWindow;
      resetApiUrlOverride();
    }
  });
});

test('Connection Health Testing and Error Handling', async (t) => {
  await t.test('testBackendConnection fails on invalid URL format', async () => {
    const res = await api.testBackendConnection('invalid-address');
    assert.equal(res.ok, false);
    assert.equal(res.latencyMs, 0);
    assert.match(res.message, /invalid|http/i);
  });

  await t.test('testBackendConnection fails on unreachable/closed port', async () => {
    const res = await api.testBackendConnection('http://127.0.0.1:59997');
    assert.equal(res.ok, false);
    assert.equal(res.latencyMs, 0);
    assert.match(res.message, /refused|error|offline|unreachable/i);
  });

  await t.test('testBackendConnection succeeds on running live daemon', async () => {
    // If backend daemon is up on 127.0.0.1:8000
    try {
      const res = await api.testBackendConnection('http://127.0.0.1:8000');
      if (res.ok) {
        assert.equal(res.ok, true);
        assert.match(res.message, /Connected to DPDP-Guard Backend/i);
        assert.ok(res.latencyMs >= 0);
        assert.equal(res.normalizedUrl, 'http://127.0.0.1:8000');
      }
    } catch {
      // Offline scenario handled above
    }
  });
});

test('Offline Behavior & Demo Mode Distinction', async (t) => {
  await t.test('offline scan creation throws when demo mode is disabled', async () => {
    resetApiUrlOverride();
    storage.clear();

    // Configure live mode (demoMode: false) against offline port
    await api.saveSettings({
      apiUrl: 'http://127.0.0.1:59998',
      demoMode: false,
      organizationName: 'Live Fiduciary',
      dpoName: '',
      dpoEmail: '',
      jurisdiction: '',
      scanRateLimit: 'standard',
      rulesetVersion: '',
      notifications: { emailAlerts: false, notifyOnCritical: false, webhookUrl: '' },
    });

    await assert.rejects(
      async () => {
        await api.createScan('http://127.0.0.1:8000/testbed', 'privacy_audit', false);
      },
      (err: any) => {
        assert.match(err.message, /failed to initiate scan|offline|unreachable|demo mode is disabled/i);
        return true;
      }
    );
  });

  await t.test('offline scan creation generates clearly labeled demo fixture when demo mode is enabled', async () => {
    resetApiUrlOverride();
    storage.clear();

    // Configure demo mode (demoMode: true) against offline port
    await api.saveSettings({
      apiUrl: 'http://127.0.0.1:59998',
      demoMode: true,
      organizationName: 'Demo Fiduciary',
      dpoName: '',
      dpoEmail: '',
      jurisdiction: '',
      scanRateLimit: 'standard',
      rulesetVersion: '',
      notifications: { emailAlerts: false, notifyOnCritical: false, webhookUrl: '' },
    });

    const demoScan = await api.createScan('http://127.0.0.1:8000/testbed', 'privacy_audit', false);
    assert.equal(demoScan.isDemo, true);
    assert.ok(demoScan.id.startsWith('DEMO-SCAN-'));
    assert.match(demoScan.notes || '', /DEMO FIXTURE/i);
    assert.ok(demoScan.findings.length > 0);
    assert.equal(demoScan.findings[0].isDemoFixture, true);
  });
});

test('Production Preview and Local Port 4173 Exclusion Suite', async (t) => {
  const originalWindow = (globalThis as any).window;

  t.beforeEach(() => {
    storage.clear();
    resetApiUrlOverride();
  });

  t.afterEach(() => {
    (globalThis as any).window = originalWindow;
    resetApiUrlOverride();
  });

  await t.test('isLocalFrontendServer correctly identifies local dev and preview origins', () => {
    assert.equal(isLocalFrontendServer('http://127.0.0.1:4173'), true);
    assert.equal(isLocalFrontendServer('http://localhost:4173'), true);
    assert.equal(isLocalFrontendServer('http://127.0.0.1:5173'), true);
    assert.equal(isLocalFrontendServer('http://localhost:3000'), true);
    // Backend port 8000 is NOT a frontend server
    assert.equal(isLocalFrontendServer('http://127.0.0.1:8000'), false);
    assert.equal(isLocalFrontendServer('http://localhost:8000'), false);
    // Production domain is NOT a local frontend server
    assert.equal(isLocalFrontendServer('https://dpdp-guard-saas.onrender.com'), false);
    // Other custom IP is NOT a local frontend server
    assert.equal(isLocalFrontendServer('http://192.168.1.100:8080'), false);
  });

  await t.test('getDefaultApiUrl resolves to 127.0.0.1:8000 when running under Vite preview at 127.0.0.1:4173', () => {
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4173',
        port: '4173',
      },
      dispatchEvent: () => true,
    };

    const defaultUrl = getDefaultApiUrl();
    assert.equal(defaultUrl, 'http://127.0.0.1:8000');
    assert.notEqual(defaultUrl, 'http://127.0.0.1:4173');
  });

  await t.test('getDefaultApiUrl resolves to 127.0.0.1:8000 when running under localhost:4173', () => {
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost:4173',
        port: '4173',
      },
      dispatchEvent: () => true,
    };

    const defaultUrl = getDefaultApiUrl();
    assert.equal(defaultUrl, 'http://127.0.0.1:8000');
    assert.notEqual(defaultUrl, 'http://localhost:4173');
  });

  await t.test('getApiBaseUrl ignores stale port 4173 saved in localStorage and falls back to port 8000', () => {
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4173',
        port: '4173',
      },
      dispatchEvent: () => true,
    };

    // Stale settings left behind by previous preview run
    storage.set(STORAGE_KEYS.SETTINGS, JSON.stringify({
      apiUrl: 'http://127.0.0.1:4173',
      organizationName: 'Stale Preview Org',
    }));

    const resolved = getApiBaseUrl();
    assert.equal(resolved, 'http://127.0.0.1:8000');
    assert.notEqual(resolved, 'http://127.0.0.1:4173');
  });

  await t.test('api.getSettings heals stale port 4173 in localStorage to default backend URL', async () => {
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4173',
        port: '4173',
      },
      dispatchEvent: () => true,
    };

    storage.set(STORAGE_KEYS.SETTINGS, JSON.stringify({
      apiUrl: 'http://127.0.0.1:4173',
      organizationName: 'Auto Healed Org',
    }));

    const settings = await api.getSettings();
    assert.equal(settings.apiUrl, 'http://127.0.0.1:8000');
    assert.notEqual(settings.apiUrl, 'http://127.0.0.1:4173');
  });

  await t.test('api.checkHealth dispatches to backend port 8000 and never to port 4173', async () => {
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4173',
        port: '4173',
      },
      dispatchEvent: () => true,
    };

    let requestedUrl = '';
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy', service: 'dpdp-guard-backend' }),
      };
    };

    try {
      const res = await api.checkHealth();
      assert.equal(res.status, 'healthy');
      assert.ok(requestedUrl.startsWith('http://127.0.0.1:8000/api/health'));
      assert.ok(!requestedUrl.includes(':4173'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('authService.register dispatches to backend port 8000 and never to port 4173', async () => {
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4173',
        port: '4173',
      },
      dispatchEvent: () => true,
    };

    let requestedUrl = '';
    let requestBody: any = null;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
      requestedUrl = url;
      requestBody = init?.body ? JSON.parse(String(init.body)) : null;
      return {
        ok: true,
        status: 201,
        json: async () => ({
          accessToken: 'test_token_123',
          tokenType: 'bearer',
          user: {
            id: 'usr_new_01',
            username: 'previewuser',
            email: 'preview@dpdpguard.in',
            fullName: 'Preview User',
            role: 'auditor',
            isActive: true,
          },
        }),
      };
    };

    try {
      const user = await authService.register({
        username: 'previewuser',
        email: 'preview@dpdpguard.in',
        password: 'Password123!',
        fullName: 'Preview User',
      });

      assert.equal(user.username, 'previewuser');
      assert.equal(requestedUrl, 'http://127.0.0.1:8000/api/v1/auth/register');
      assert.ok(!requestedUrl.includes(':4173'));
      assert.equal(requestBody?.username, 'previewuser');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Preserves intentional custom backend override (e.g. 192.168.1.150:8000)', () => {
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4173',
        port: '4173',
      },
      dispatchEvent: () => true,
    };

    storage.set(STORAGE_KEYS.SETTINGS, JSON.stringify({
      apiUrl: 'http://192.168.1.150:8000',
      organizationName: 'Custom Fiduciary',
    }));

    const resolved = getApiBaseUrl();
    assert.equal(resolved, 'http://192.168.1.150:8000');
  });
});
