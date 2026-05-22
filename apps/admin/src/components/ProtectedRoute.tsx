'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import type { AdminRole } from '@walletOS/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  minRole?: AdminRole;
  fallback?: React.ReactNode;
}

/**
 * Wrapper component to protect routes that require authentication
 * Optionally enforces role-based access control
 */
export function ProtectedRoute({ children, minRole, fallback }: ProtectedRouteProps) {
  const { adminUser, loading, hasRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!adminUser) {
        router.push('/login');
        return;
      }

      if (minRole && !hasRole(minRole)) {
        router.push('/unauthorized');
        return;
      }
    }
  }, [adminUser, loading, hasRole, minRole, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!adminUser) {
    return fallback || null;
  }

  if (minRole && !hasRole(minRole)) {
    return fallback || null;
  }

  return <>{children}</>;
}
