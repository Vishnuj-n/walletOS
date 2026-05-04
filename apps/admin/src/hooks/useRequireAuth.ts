'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import type { AdminRole } from '@walletOS/types';

/**
 * Custom hook to redirect unauthenticated users to login
 * Use this in pages that require authentication
 */
export function useRequireAuth(redirectTo: string = '/login') {
  const { user, loading, adminUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !adminUser)) {
      router.push(redirectTo);
    }
  }, [user, adminUser, loading, router, redirectTo]);

  return { user, adminUser, loading };
}

/**
 * Custom hook to check if user has required role
 * Redirects to unauthorized page if role is insufficient
 */
export function useRequireRole(minRole: AdminRole, redirectTo: string = '/unauthorized') {
  const { user, adminUser, loading, hasRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user || !adminUser) {
        router.push('/login');
      } else if (!hasRole(minRole)) {
        router.push(redirectTo);
      }
    }
  }, [user, adminUser, loading, hasRole, minRole, router, redirectTo]);

  return { user, adminUser, loading, hasRole };
}
