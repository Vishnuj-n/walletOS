'use client';

import type { AdminRole } from '@walletOS/types';
import { useAuth } from '../contexts/AuthContext';

interface PermissionGateProps {
  children: React.ReactNode;
  minRole: AdminRole;
  fallback?: React.ReactNode;
}

export function PermissionGate({ children, minRole, fallback = null }: PermissionGateProps) {
  const { hasRole, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!hasRole(minRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

