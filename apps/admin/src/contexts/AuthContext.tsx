'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/supabase';
import { getAdminToken, setAdminSession } from '../lib/adminSession';
import type { AdminMeResponse, AdminRole, AdminUserInfo } from '@walletos/types';
import { roleRank } from '@walletos/types';

interface AuthIdentity {
  id: string;
  email: string;
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === 'support' || value === 'finance' || value === 'tenant_admin' || value === 'superadmin';
}

function isAdminMeResponse(value: unknown): value is AdminMeResponse {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  const adminUser = payload.adminUser;
  if (!adminUser || typeof adminUser !== 'object') return false;
  const user = adminUser as Record<string, unknown>;

  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.tenantId === 'string' &&
    isAdminRole(user.role)
  );
}

interface AuthContextType {
  user: AuthIdentity | null;
  adminUser: AdminUserInfo | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (minRole: AdminRole) => boolean;
  isSuperadmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const latestAccessTokenRef = useRef('');

  const setAuthenticatedAdmin = (nextAdminUser: AdminUserInfo, token: string) => {
    setUser({ id: nextAdminUser.id, email: nextAdminUser.email });
    setAdminUser(nextAdminUser);
    setAdminSession(nextAdminUser, token);
  };

  const clearAuthenticatedAdmin = () => {
    setUser(null);
    setAdminUser(null);
    setAdminSession(null);
  };

  const fetchAdminUser = async (accessToken?: string | null) => {
    if (!accessToken) {
      // Only clear if this is still the latest request
      if ((!latestAccessTokenRef.current && !accessToken) || latestAccessTokenRef.current === accessToken) {
        clearAuthenticatedAdmin();
      }
      return;
    }

    // Track this as the latest request
    latestAccessTokenRef.current = accessToken;
    const requestToken = accessToken;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Only apply results if this request is still the latest
      if (requestToken !== latestAccessTokenRef.current) {
        return;
      }

      if (response.ok) {
        const data: unknown = await response.json();
        if (isAdminMeResponse(data)) {
          setAuthenticatedAdmin(data.adminUser, requestToken);
        } else {
          clearAuthenticatedAdmin();
        }
      } else {
        clearAuthenticatedAdmin();
      }
    } catch {
      // Only apply error state if this request is still the latest
      if (requestToken === latestAccessTokenRef.current) {
        clearAuthenticatedAdmin();
      }
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = getAdminToken();
        if (storedToken) {
          latestAccessTokenRef.current = storedToken;
          await fetchAdminUser(storedToken);
        } else {
          clearAuthenticatedAdmin();
        }
      } catch {
        clearAuthenticatedAdmin();
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json().catch(() => null) as
      | { token?: string; adminUser?: AdminUserInfo; message?: string; error?: { message?: string } }
      | null;

    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || 'Failed to sign in');
    }

    if (!data?.token || !data.adminUser || !isAdminMeResponse({ adminUser: data.adminUser })) {
      throw new Error('Invalid login response');
    }

    latestAccessTokenRef.current = data.token;
    setAuthenticatedAdmin(data.adminUser, data.token);
  };

  const signOut = async () => {
    latestAccessTokenRef.current = '';
    clearAuthenticatedAdmin();
  };

  const hasRole = (minRole: AdminRole): boolean => {
    if (!adminUser) return false;
    const userRoleRank = roleRank[adminUser.role];
    const requiredRank = roleRank[minRole];
    return userRoleRank >= requiredRank;
  };

  const isSuperadmin = adminUser?.role === 'superadmin';

  return (
    <AuthContext.Provider value={{ user, adminUser, loading, signIn, signOut, hasRole, isSuperadmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
