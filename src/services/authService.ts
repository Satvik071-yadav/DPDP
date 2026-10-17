import { UserProfile, AuthTokenResponse } from '@/types';
import { getApiBaseUrl } from '@/services/apiConfig';

export const AUTH_STORAGE_KEYS = {
  TOKEN: 'dpdp_auth_token',
  USER: 'dpdp_current_user',
} as const;

type AuthListener = (user: UserProfile | null) => void;
const authListeners = new Set<AuthListener>();

export const authService = {
  /**
   * Retrieves the current stored JWT access token.
   * Returns null if unauthenticated or storage is unavailable.
   */
  getToken(): string | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN);
    } catch {
      return null;
    }
  },

  /**
   * Constructs authorization headers for API requests.
   * Guarantees no Authorization header is generated after sign-out.
   */
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    if (!token) return {};
    return { 'Authorization': `Bearer ${token}` };
  },

  /**
   * Returns true if a valid token and active user session exist.
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null && this.getCurrentUser() !== null;
  },

  /**
   * Retrieves the cached user profile.
   * Returns null if no active token exists or storage is empty.
   * Never falls back to a fake or hardcoded authenticated session.
   */
  getCurrentUser(): UserProfile | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const token = this.getToken();
      if (!token) {
        return null;
      }
      const raw = localStorage.getItem(AUTH_STORAGE_KEYS.USER);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  /**
   * Subscribes to real-time auth state changes across React components.
   */
  onAuthStateChange(listener: AuthListener): () => void {
    authListeners.add(listener);
    return () => {
      authListeners.delete(listener);
    };
  },

  /**
   * Broadcasts auth state transitions (login/logout) to all listeners.
   */
  notifyAuthStateChange(user: UserProfile | null): void {
    authListeners.forEach((listener) => {
      try {
        listener(user);
      } catch (err) {
        console.error('Error in auth state change listener:', err);
      }
    });
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('dpdp:auth-state-changed', { detail: { user } }));
      } catch {
        // Safe fallback in restricted environments
      }
    }
  },

  /**
   * Authenticates user against backend /api/v1/auth/login.
   * Persists JWT access token and user profile into storage.
   */
  async login(username: string, password: string): Promise<UserProfile> {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Authentication failed. Please verify credentials.');
    }

    const data: AuthTokenResponse = await response.json();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN, data.accessToken);
        localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(data.user));
      }
    } catch (storageErr) {
      console.warn('Unable to persist auth state to localStorage:', storageErr);
    }
    this.notifyAuthStateChange(data.user);
    return data.user;
  },

  /**
   * Registers a new account via /api/v1/auth/register and automatically signs in.
   */
  async register(payload: {
    username: string;
    email: string;
    password: string;
    fullName?: string;
    role?: string;
  }): Promise<UserProfile> {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Registration failed. Please try again.');
    }

    const data: AuthTokenResponse = await response.json();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN, data.accessToken);
        localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(data.user));
      }
    } catch (storageErr) {
      console.warn('Unable to persist auth state to localStorage:', storageErr);
    }
    this.notifyAuthStateChange(data.user);
    return data.user;
  },

  /**
   * Completely logs out the current user session:
   * - Clears JWT token from storage
   * - Clears cached user profile from storage
   * - Immediately notifies all React listeners that user is null
   * - Safe against storage access exceptions
   */
  logout(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN);
        localStorage.removeItem(AUTH_STORAGE_KEYS.USER);
      }
    } catch (err) {
      console.warn('Storage removal failed during logout:', err);
    }
    this.notifyAuthStateChange(null);
  },

  /**
   * Validates and refreshes the current session against /api/v1/auth/me.
   * If unauthenticated, returns null immediately without fabricating a session.
   * If token is invalid or expired (401/403), invokes logout() and returns null.
   */
  async fetchCurrentUser(): Promise<UserProfile | null> {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const user: UserProfile = await response.json();
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(user));
          }
        } catch {
          // ignore storage error
        }
        return user;
      } else if (response.status === 401 || response.status === 403) {
        this.logout();
        return null;
      }
    } catch {
      // Offline fallback: return cached user only if token exists
      return this.getCurrentUser();
    }
    return this.getCurrentUser();
  },
};
