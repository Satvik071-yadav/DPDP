import { UserProfile, AuthTokenResponse } from '@/types';
import { getApiBaseUrl } from '@/services/apiConfig';

const AUTH_TOKEN_KEY = 'dpdp_auth_token';
const CURRENT_USER_KEY = 'dpdp_current_user';

export const authService = {
  getToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },

  getCurrentUser(): UserProfile | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) {
      // Default session in demo mode
      return {
        id: 'usr_dpo_001',
        username: 'aditi.deshmukh',
        email: 'dpo@bharatprivacy.in',
        fullName: 'Aditi Deshmukh',
        role: 'dpo',
        isActive: true,
      };
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

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
    localStorage.setItem(AUTH_TOKEN_KEY, data.accessToken);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
    return data.user;
  },

  logout(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  async fetchCurrentUser(): Promise<UserProfile | null> {
    const token = this.getToken();
    if (!token) return this.getCurrentUser();

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
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
      } else if (response.status === 401) {
        this.logout();
        return null;
      }
    } catch {
      // Offline fallback: return cached user
    }
    return this.getCurrentUser();
  },
};
