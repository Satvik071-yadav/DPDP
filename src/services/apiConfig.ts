/**
 * Shared API Configuration and URL Resolver for DPDP-Guard.
 * Enforces unified configuration resolution across all API callers.
 */
import { UserSettings } from '@/types';
import { DEFAULT_USER_SETTINGS } from '@/data/mockData';

export const STORAGE_KEYS = {
  SETTINGS: 'dpdp_settings_v1',
  SCANS: 'dpdp_scans_v1',
  FINDINGS: 'dpdp_findings_v1',
};

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Normalizes an API URL:
 * - Trims whitespace
 * - Strips trailing slashes
 * - Strips redundant trailing /api/v1 or /api/v1/ (root origin is used for /api/health and /api/v1/...)
 */
export function normalizeApiUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  // Strip trailing /api/v1 if included by user in base URL
  url = url.replace(/\/api\/v1\/?$/i, '');
  // Strip any remaining trailing slashes
  url = url.replace(/\/+$/, '');
  return url;
}

/**
 * Validates an API URL
 */
export function validateApiUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      valid: false,
      error: 'API URL cannot be empty.',
    };
  }

  const trimmed = rawUrl.trim();

  // Protocol check
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: 'API URL must begin with http:// or https:// (e.g. http://127.0.0.1:8000)',
    };
  }

  // Pre-validate port number bounds if specified in URL string
  const portMatch = trimmed.match(/:(\d+)(?:\/|$)/);
  if (portMatch) {
    const portNum = parseInt(portMatch[1], 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return {
        valid: false,
        error: 'Invalid port number specified in API URL (must be 1 - 65535).',
      };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format. Please enter a valid host URL (e.g. http://127.0.0.1:8000).',
    };
  }

  if (!parsed.hostname) {
    return {
      valid: false,
      error: 'API URL must contain a valid hostname or IP address.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only HTTP and HTTPS protocols are supported.',
    };
  }

  // Validate port if present
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return {
        valid: false,
        error: 'Invalid port number specified in API URL (must be 1 - 65535).',
      };
    }
  }

  return {
    valid: true,
    normalizedUrl: normalizeApiUrl(trimmed),
  };
}

/**
 * Gets the default API URL from Vite environment (VITE_API_BASE_URL) or localhost:8000 fallback
 */
export function getDefaultApiUrl(): string {
  let envUrl = '';
  try {
    // In Vite / browser environments:
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> })?.env;
    if (metaEnv?.VITE_API_BASE_URL) {
      envUrl = metaEnv.VITE_API_BASE_URL;
    } else if (metaEnv?.VITE_API_URL) {
      envUrl = metaEnv.VITE_API_URL;
    }
  } catch {
    // In Node / test environments:
    if (typeof process !== 'undefined') {
      envUrl = process.env?.VITE_API_BASE_URL || process.env?.VITE_API_URL || '';
    }
  }

  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const val = validateApiUrl(envUrl);
    if (val.valid && val.normalizedUrl) {
      return val.normalizedUrl;
    }
  }

  // In production browser environments when served from the same host,
  // window.location.origin automatically provides the backend origin without hardcoded hostnames
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    if (window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://')) {
      const isLocalViteDev = window.location.port === '5173' || window.location.port === '3000';
      if (!isLocalViteDev) {
        return normalizeApiUrl(window.location.origin);
      }
    }
  }

  return 'http://127.0.0.1:8000';
}


// In-memory runtime override (updated synchronously when settings are saved)
let runtimeApiUrlOverride: string | null = null;

/**
 * Resolves the active API Base URL.
 * Priority order:
 * 1. Runtime in-memory override (e.g. updated in current session via Settings save)
 * 2. Saved settings URL from localStorage ('dpdp_settings_v1') if valid
 * 3. Vite environment variable (VITE_API_BASE_URL)
 * 4. Fallback default ('http://127.0.0.1:8000')
 */
export function getApiBaseUrl(): string {
  if (runtimeApiUrlOverride) {
    return runtimeApiUrlOverride;
  }

  // Detect whether we are running in an HTTPS production environment
  const isHttpsProduction = 
    typeof window !== 'undefined' && 
    Boolean(window.location) && 
    window.location.protocol === 'https:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  if (typeof localStorage !== 'undefined') {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (data) {
        const parsed: UserSettings = JSON.parse(data);
        if (parsed?.apiUrl && typeof parsed.apiUrl === 'string') {
          const val = validateApiUrl(parsed.apiUrl);
          if (val.valid && val.normalizedUrl) {
            // When served over HTTPS in production, ignore stale localhost/127.0.0.1 URLs
            // from developer localStorage to prevent browser Mixed Content blocking
            const isLocalhostTarget = 
              val.normalizedUrl.includes('://localhost') || 
              val.normalizedUrl.includes('://127.0.0.1');

            if (isHttpsProduction && isLocalhostTarget) {
              const defaultOrigin = getDefaultApiUrl();
              runtimeApiUrlOverride = defaultOrigin;
              return defaultOrigin;
            }

            runtimeApiUrlOverride = val.normalizedUrl;
            return val.normalizedUrl;
          }
        }
      }
    } catch {
      // ignore parse error, fallback to default
    }
  }

  return getDefaultApiUrl();
}

/**
 * Updates the active API URL in-memory and in localStorage.
 * Dispatches an event so all mounted components react without needing an application rebuild or reload.
 */
export function setApiBaseUrl(newUrl: string): UrlValidationResult {
  const val = validateApiUrl(newUrl);
  if (!val.valid || !val.normalizedUrl) {
    return val;
  }

  runtimeApiUrlOverride = val.normalizedUrl;

  if (typeof localStorage !== 'undefined') {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      const settings: UserSettings = data ? JSON.parse(data) : { ...DEFAULT_USER_SETTINGS };
      settings.apiUrl = val.normalizedUrl;
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dpdp:api-url-changed', {
      detail: { apiUrl: val.normalizedUrl }
    }));
  }

  return val;
}

/**
 * Resets the runtime override (useful for testing or resetting to default)
 */
export function resetApiUrlOverride(): void {
  runtimeApiUrlOverride = null;
}
