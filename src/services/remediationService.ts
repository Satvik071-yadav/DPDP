import { AuditHistoryRecord, VerificationProbeResult } from '@/types';
import { api } from '@/services/api';

const STORAGE_KEYS = {
  PATCH_STATES: 'dpdp_patch_states_v1',
};

export const remediationService = {
  /**
   * Retrieve immutable verification audit history from the backend SQLite database.
   * Throws if backend is unavailable so UI can surface genuine connection/error state.
   */
  async getAuditHistory(): Promise<AuditHistoryRecord[]> {
    return await api.getAuditHistory();
  },

  /**
   * Clear audit history from the backend database.
   */
  async clearAuditHistory(): Promise<void> {
    await api.clearAuditHistory();
    // Also remove legacy local storage key if present
    localStorage.removeItem('dpdp_verification_history_v1');
  },

  /**
   * Get whether a finding has its code fix staged in the sandbox environment.
   */
  isFindingPatched(findingId: string): boolean {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PATCH_STATES);
      if (!data) return false;
      const states = JSON.parse(data);
      return Boolean(states[findingId]);
    } catch {
      return false;
    }
  },

  /**
   * Stage or revert the patch state of a finding in the sandbox environment.
   */
  setFindingPatched(findingId: string, isPatched: boolean): void {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PATCH_STATES);
      const states = data ? JSON.parse(data) : {};
      states[findingId] = isPatched;
      localStorage.setItem(STORAGE_KEYS.PATCH_STATES, JSON.stringify(states));
    } catch {
      // ignore
    }
  },

  /**
   * Executes genuine HTTP verification probe via the backend verification engine.
   * Probes evaluate real responses from the controlled local testbed.
   * Fails loudly if backend is offline—never silently fabricates fake PASS results.
   */
  async runVerification(findingId: string, isPatched: boolean): Promise<VerificationProbeResult> {
    const result = await api.verifyFinding(findingId, isPatched);
    return result;
  }
};
