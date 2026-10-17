/**
 * DPDP-Guard Authentication & Sign-Out Regression Test Suite
 * Verifies complete sign-out lifecycle, token disposal, immediate React state reset,
 * prevention of stale Authorization headers, and page-refresh resistance.
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

import { authService, AUTH_STORAGE_KEYS } from '../src/services/authService.js';
import { UserProfile } from '../src/types/index.js';

test('Authentication Lifecycle and Sign-Out Suite', async (t) => {
  t.beforeEach(() => {
    storage.clear();
  });

  await t.test('1. Unauthenticated Initial State', () => {
    assert.equal(authService.getToken(), null, 'Token must be null when unauthenticated');
    assert.equal(authService.getCurrentUser(), null, 'Current user must be null when unauthenticated (no fake user)');
    assert.equal(authService.isAuthenticated(), false, 'isAuthenticated() must be false');
    assert.deepEqual(authService.getAuthHeaders(), {}, 'Auth headers must be empty when unauthenticated');
  });

  await t.test('2. Login and Session Persistence', async () => {
    // Perform synthetic DPO login via fallback
    const user = await authService.login('aditi.deshmukh', 'dpdp_guard_demo_2026');

    assert.equal(user.username, 'aditi.deshmukh');
    assert.equal(user.role, 'dpo');

    // Verify localStorage has persisted items
    const storedToken = storage.get(AUTH_STORAGE_KEYS.TOKEN);
    const storedUserRaw = storage.get(AUTH_STORAGE_KEYS.USER);

    assert.ok(storedToken, 'Token must be persisted in storage');
    assert.ok(storedUserRaw, 'User profile must be persisted in storage');

    // Verify service getters
    assert.equal(authService.getToken(), storedToken);
    assert.deepEqual(authService.getCurrentUser(), user);
    assert.equal(authService.isAuthenticated(), true);

    // Verify Authorization header generation
    const headers = authService.getAuthHeaders();
    assert.equal(headers['Authorization'], `Bearer ${storedToken}`);
  });

  await t.test('3. Complete Sign-Out and Stale-Token Removal', async () => {
    // Set up active session
    await authService.login('aditi.deshmukh', 'dpdp_guard_demo_2026');
    assert.equal(authService.isAuthenticated(), true);

    // Track listener notification
    let notifiedUser: UserProfile | null | undefined = undefined;
    const unsubscribe = authService.onAuthStateChange((u) => {
      notifiedUser = u;
    });

    // Execute logout
    authService.logout();

    // Verify storage removal using the exact same keys
    assert.equal(storage.get(AUTH_STORAGE_KEYS.TOKEN), undefined, 'Auth token must be removed from storage');
    assert.equal(storage.get(AUTH_STORAGE_KEYS.USER), undefined, 'User profile must be removed from storage');

    // Verify service state immediately returns null
    assert.equal(authService.getToken(), null, 'getToken() must return null after logout');
    assert.equal(authService.getCurrentUser(), null, 'getCurrentUser() must return null after logout');
    assert.equal(authService.isAuthenticated(), false, 'isAuthenticated() must be false after logout');

    // Verify API requests cannot continue using a stale token
    const headersAfterLogout = authService.getAuthHeaders();
    assert.deepEqual(headersAfterLogout, {}, 'getAuthHeaders() must be completely empty after logout');
    assert.equal(headersAfterLogout['Authorization'], undefined, 'No Authorization header allowed post-logout');

    // Verify reactive listener was notified with null
    assert.equal(notifiedUser, null, 'Listener must be notified with null on logout');
    unsubscribe();
  });

  await t.test('4. Page Refresh Does Not Restore Logged-Out Session', async () => {
    // 1. User logs in
    await authService.login('aditi.deshmukh', 'dpdp_guard_demo_2026');
    assert.equal(authService.isAuthenticated(), true);

    // 2. User logs out
    authService.logout();

    // 3. Simulate page refresh: module re-evaluates and inspects storage
    const restoredUser = authService.getCurrentUser();
    assert.equal(restoredUser, null, 'Page refresh must NOT restore user profile');

    const refreshedUserFromFetch = await authService.fetchCurrentUser();
    assert.equal(refreshedUserFromFetch, null, 'fetchCurrentUser() must return null on refresh after logout');

    assert.equal(authService.isAuthenticated(), false, 'isAuthenticated() must remain false');
    assert.deepEqual(authService.getAuthHeaders(), {}, 'Stale token must not be sent on refresh');
  });

  await t.test('5. Safe Logout When Storage Throws or User Already Logged Out', () => {
    // Calling logout when already logged out must be safe and idempotent
    assert.doesNotThrow(() => {
      authService.logout();
      authService.logout();
    });

    // Mock localStorage throwing a SecurityError (e.g. private browsing storage quota/blocked)
    const originalRemove = (globalThis as any).localStorage.removeItem;
    (globalThis as any).localStorage.removeItem = () => {
      throw new Error('SecurityError: The operation is insecure.');
    };

    let notifiedWith: UserProfile | null | undefined = undefined;
    const unsub = authService.onAuthStateChange((u) => {
      notifiedWith = u;
    });

    // Logout must not crash the application
    assert.doesNotThrow(() => {
      authService.logout();
    });

    // Listeners must still receive null to reset UI safely
    assert.equal(notifiedWith, null);

    // Restore mock
    (globalThis as any).localStorage.removeItem = originalRemove;
    unsub();
  });

  await t.test('6. Inconsistent Storage State Protection (User present without Token)', () => {
    // If a user profile exists in storage but the token was removed
    storage.set(AUTH_STORAGE_KEYS.USER, JSON.stringify({
      id: 'usr_orphan',
      username: 'orphan.user',
      email: 'orphan@test.in',
      fullName: 'Orphan User',
      role: 'auditor',
      isActive: true,
    }));
    storage.delete(AUTH_STORAGE_KEYS.TOKEN);

    assert.equal(authService.getToken(), null);
    assert.equal(authService.getCurrentUser(), null, 'Orphaned user profile without token must not be treated as authenticated');
    assert.equal(authService.isAuthenticated(), false);
    assert.deepEqual(authService.getAuthHeaders(), {});
  });
});
