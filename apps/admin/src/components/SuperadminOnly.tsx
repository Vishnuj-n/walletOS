'use client';

import { useAuth } from '../contexts/AuthContext';

interface SuperadminOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function SuperadminOnly({ children, fallback = null }: SuperadminOnlyProps) {
  const { isSuperadmin } = useAuth();

  if (!isSuperadmin) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
