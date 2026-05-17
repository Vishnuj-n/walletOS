import type { AdminRole, AdminUserInfo } from '@walletOS/types';
import { hasRequiredRole } from '@walletOS/types';

const ADMIN_SESSION_STORAGE_KEY = 'walletos.admin.session';

function readStoredAdminUser(): AdminUserInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AdminUserInfo;
  } catch {
    window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    return null;
  }
}

function writeStoredAdminUser(adminUser: AdminUserInfo | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!adminUser) {
    window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(adminUser));
}

export function setAdminSession(adminUser: AdminUserInfo | null): void {
  writeStoredAdminUser(adminUser);
}

export function getAdminSession(): AdminUserInfo | null {
  return readStoredAdminUser();
}

export function getActiveTenantId(): string | null {
  return getAdminSession()?.tenantId ?? null;
}

export function requireActiveTenantId(errorMessage = 'Active tenant is required'): string {
  const tenantId = getActiveTenantId();

  if (!tenantId) {
    throw new Error(errorMessage);
  }

  return tenantId;
}

export function hasAdminRole(minRole: AdminRole): boolean {
  const adminUser = getAdminSession();

  if (!adminUser) {
    return false;
  }

  return hasRequiredRole(adminUser.role, minRole);
}

export function withActiveTenantScope(
  query?: Record<string, unknown>
): Record<string, unknown> {
  const tenantId = requireActiveTenantId('Active tenant is required for tenant-scoped admin requests');

  return {
    ...(query ?? {}),
    tenantId,
  };
}
