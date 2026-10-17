import { ScanProfile, ScanStage, ScanResult, Finding, ScanProgressEvent } from '@/types';
import { DEMO_FINDINGS } from '@/data/mockData';
import { api } from '@/services/api';

// Permitted test domains in demo environment
export const AUTHORIZED_DEMO_DOMAINS = [
  'paysecure-india.in',
  'apollo-telemed.co.in',
  'retail-bharat.store',
  'localhost',
  '127.0.0.1',
  'demo.dpdpguard.in',
];

export interface ScanValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
  isDemoAllowed: boolean;
}

export function validateScanTarget(rawUrl: string): ScanValidationResult {
  if (!rawUrl || !rawUrl.trim()) {
    return {
      valid: false,
      error: 'Please enter a website URL to scan.',
      isDemoAllowed: false,
    };
  }

  let parsed: URL;
  try {
    const formatted = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') 
      ? rawUrl.trim() 
      : `https://${rawUrl.trim()}`;
    parsed = new URL(formatted);
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format. Please include a valid domain (e.g. https://example.in).',
      isDemoAllowed: false,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAuthorized = AUTHORIZED_DEMO_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`) || hostname.endsWith('.local')
  );

  if (!isAuthorized) {
    return {
      valid: false,
      normalizedUrl: parsed.origin,
      error: `Demo Environment Policy: Real external domain testing is restricted to protect external web services. Please select an authorized demo target (PaySecure India, Apollo Telemed, Retail Bharat, or localhost), or connect a live backend engine in Settings.`,
      isDemoAllowed: false,
    };
  }

  return {
    valid: true,
    normalizedUrl: parsed.origin + (parsed.pathname !== '/' ? parsed.pathname : ''),
    isDemoAllowed: true,
  };
}

export const scanService = {
  /**
   * Executes a real backend scan with authoritative status polling and real UI state transitions.
   */
  async executeScan(
    targetUrl: string,
    profile: ScanProfile,
    consentComparison: boolean,
    onProgress: (event: ScanProgressEvent) => void,
    onScanCreated?: (scanId: string) => void
  ): Promise<ScanResult> {
    onProgress({
      stage: 'preparing_env',
      progress: 10,
      log: `[INIT] Submitting scan request to backend for target: ${targetUrl}`,
    });

    // 1. Initiate async scan in backend
    const initialScan = await api.createScan(targetUrl, profile, consentComparison, true);
    if (onScanCreated) {
      onScanCreated(initialScan.id);
    }

    // If backend completed immediately (e.g. offline demo fallback)
    if (initialScan.status === 'completed') {
      onProgress({
        stage: 'completed',
        progress: 100,
        log: `[COMPLETE] Scan ${initialScan.id} completed.`,
      });
      return initialScan;
    }

    if (initialScan.status === 'failed') {
      throw new Error(initialScan.notes || 'Scan execution failed on submission.');
    }

    // 2. Poll authoritative scan status endpoint
    const scanId = initialScan.id;
    let isFinished = false;
    let pollCount = 0;
    const maxPolls = 180; // ~144 seconds limit

    while (!isFinished && pollCount < maxPolls) {
      pollCount++;
      await new Promise((resolve) => setTimeout(resolve, 800));

      const status = await api.getScanStatus(scanId);
      const stage = (status.stage as ScanStage) || 'checking_endpoints';

      onProgress({
        stage,
        progress: status.progress,
        log: status.log || '',
      });

      if (status.status === 'completed') {
        isFinished = true;
        const finalScan = await api.getScanById(scanId);
        if (!finalScan) {
          throw new Error(`Scan ${scanId} completed, but results could not be retrieved.`);
        }
        onProgress({
          stage: 'completed',
          progress: 100,
          log: `[COMPLETE] Scan ${scanId} completed successfully with ${finalScan.findingsCount.total} findings.`,
        });
        return finalScan;
      }

      if (status.status === 'failed') {
        isFinished = true;
        throw new Error(status.errorMessage || 'Scan failed during execution.');
      }

      if (status.status === 'cancelled') {
        isFinished = true;
        throw new Error('Scan was cancelled by user.');
      }
    }

    if (!isFinished) {
      throw new Error(`Scan ${scanId} timed out waiting for backend response.`);
    }

    throw new Error('Scan terminated in an unknown state.');
  },

  /**
   * Resume polling of an in-flight or existing scan by ID.
   */
  async pollExistingScan(
    scanId: string,
    onProgress: (event: ScanProgressEvent) => void
  ): Promise<ScanResult> {
    const initialStatus = await api.getScanStatus(scanId);

    if (initialStatus.status === 'completed') {
      const finalScan = await api.getScanById(scanId);
      if (!finalScan) throw new Error(`Scan ${scanId} not found.`);
      return finalScan;
    }
    if (initialStatus.status === 'failed') {
      throw new Error(initialStatus.errorMessage || 'Scan failed.');
    }
    if (initialStatus.status === 'cancelled') {
      throw new Error('Scan was cancelled.');
    }

    let isFinished = false;
    let pollCount = 0;
    const maxPolls = 180;

    while (!isFinished && pollCount < maxPolls) {
      pollCount++;
      const current = await api.getScanStatus(scanId);
      const stage = (current.stage as ScanStage) || 'checking_endpoints';

      onProgress({
        stage,
        progress: current.progress,
        log: current.log || '',
      });

      if (current.status === 'completed') {
        isFinished = true;
        const res = await api.getScanById(scanId);
        if (!res) throw new Error(`Scan ${scanId} not found.`);
        return res;
      }
      if (current.status === 'failed') {
        isFinished = true;
        throw new Error(current.errorMessage || 'Scan failed.');
      }
      if (current.status === 'cancelled') {
        isFinished = true;
        throw new Error('Scan was cancelled.');
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    throw new Error(`Scan ${scanId} polling timed out.`);
  },

  /**
   * Cancel an in-flight scan
   */
  async cancelScan(scanId: string) {
    return await api.cancelScan(scanId);
  },
};
