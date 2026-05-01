'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  minRole?: 'support' | 'finance' | 'superadmin';
  fallback?: React.ReactNode;
}

/**
 * Wrapper component to protect routes that require authentication
 * Optionally enforces role-based access control
 */
export function ProtectedRoute({ children, minRole, fallback }: ProtectedRouteProps) {
  const { user, adminUser, loading, hasRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user || !adminUser) {
        router.push('/login');
        return;
      }

      if (minRole && !hasRole(minRole)) {
        router.push('/unauthorized');
        return;
      }
    }
  }, [user, adminUser, loading, hasRole, minRole, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user || !adminUser) {
    return fallback || null;
  }

  if (minRole && !hasRole(minRole)) {
    return fallback || null;
  }

  return <>{children}</>;
}
