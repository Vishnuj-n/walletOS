'use client';

import { PermissionGate } from './PermissionGate';

interface SuperadminOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function SuperadminOnly({ children, fallback = null }: SuperadminOnlyProps) {
  return <PermissionGate minRole="superadmin" fallback={fallback}>{children}</PermissionGate>;
}
