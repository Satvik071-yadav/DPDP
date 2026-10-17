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
  // Strip redundant trailing /api/v1 or /api if included by user in base URL
  url = url.replace(/\/api(?:\/v1)?\/?$/i, '');
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
 * Identifies loopback and local development hostnames.
 */
export function isLocalHostname(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  const h = hostname.trim().toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local')
  );
}

/**
 * Identifies standard frontend development and preview ports (Vite dev: 5173, preview: 4173, CRA: 3000, etc.)
 */
export function isFrontendDevOrPreviewPort(port: string | number): boolean {
  const p = String(port).trim();
  return p === '4173' || p === '5173' || p === '3000' || p === '5174' || p === '4174' || p === '3001';
}

/**
 * Checks whether a URL or window.location represents a local frontend dev or preview server
 * (which serves static HTML/assets, NOT the FastAPI backend).
 */
export function isLocalFrontendServer(
  urlOrLocation?: string | Location | { hostname?: string; port?: string; origin?: string }
): boolean {
  if (!urlOrLocation) return false;
  try {
    let hostname = '';
    let port = '';

    if (typeof urlOrLocation === 'string') {
      const parsed = new URL(urlOrLocation.trim());
      hostname = parsed.hostname;
      port = parsed.port;
    } else {
      hostname = urlOrLocation.hostname || '';
      port = urlOrLocation.port || '';
    }

    if (!isLocalHostname(hostname)) {
      return false;
    }

    // Port 8000 is the standard FastAPI backend port
    if (port === '8000') {
      return false;
    }

    // On local hostname, any dev/preview port or any non-8000 port is a frontend server
    return isFrontendDevOrPreviewPort(port) || (Boolean(port) && port !== '8000');
  } catch {
    return false;
  }
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
  // window.location.origin automatically provides the backend origin without hardcoded hostnames.
  // We strictly exclude local frontend development (5173, 3000) and production preview (4173) servers.
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    if (window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://')) {
      if (!isLocalFrontendServer(window.location)) {
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
 * 2. Saved settings URL from localStorage ('dpdp_settings_v1') if valid and not stale
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
    !isLocalHostname(window.location.hostname);

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

            // In local development or local production-preview, ignore stale URLs pointing
            // to local frontend development/preview servers (such as 4173, 5173, 3000)
            if (isLocalFrontendServer(val.normalizedUrl)) {
              const defaultUrl = getDefaultApiUrl();
              return defaultUrl;
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
