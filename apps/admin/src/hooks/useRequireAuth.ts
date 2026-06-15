'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Custom hook to redirect unauthenticated users to login
 * Use this in pages that require authentication
 */
export function useRequireAuth(redirectTo = '/login') {
  const { user, loading, adminUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !adminUser) {
      router.push(redirectTo);
    }
  }, [adminUser, loading, router, redirectTo]);

  return { user, adminUser, loading };
}
