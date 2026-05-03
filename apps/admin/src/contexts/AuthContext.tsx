'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

type AdminRole = 'support' | 'finance' | 'superadmin';

interface AdminUserInfo {
  id: string;
  email: string;
  tenantId: string;
  role: AdminRole;
}

interface AuthContextType {
  user: User | null;
  adminUser: AdminUserInfo | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (minRole: AdminRole) => boolean;
  isSuperadmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Role hierarchy: support(0) < finance(1) < superadmin(2)
const roleRank: Record<AdminRole, number> = {
  support: 0,
  finance: 1,
  superadmin: 2,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAdminUser = async (supabaseUser: User | null, accessToken?: string | null) => {
    if (!supabaseUser || !accessToken) {
      setAdminUser(null);
      return;
    }

    try {
      const response = await fetch('/api/admin/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAdminUser(data.adminUser);
      } else {
        setAdminUser(null);
      }
    } catch {
      setAdminUser(null);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          await supabase.auth.signOut();
          setUser(null);
          setAdminUser(null);
          setLoading(false);
          return;
        }

        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchAdminUser(session.user, session.access_token);
        }
      } catch {
        await supabase.auth.signOut();
        setUser(null);
        setAdminUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchAdminUser(session.user, session.access_token);
      } else {
        setAdminUser(null);
      }
      // Note: loading is only set to false once during initial session check
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
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
