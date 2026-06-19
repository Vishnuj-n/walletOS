import type { DashboardCapability } from '@walletos/types';

export const DASHBOARD_CAPABILITIES: DashboardCapability[] = [
  {
    id: 'wallets',
    label: 'Wallets',
    href: '/dashboard/wallets',
    description: 'Search, review, and manage wallets for the active tenant.',
    minRole: 'support',
    scope: 'tenant',
  },
  {
    id: 'actions',
    label: 'Manual Actions',
    href: '/dashboard/actions',
    description: 'Create audited credits, debits, and reversals.',
    minRole: 'finance',
    scope: 'tenant',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    href: '/dashboard/audit',
    description: 'Inspect tenant activity and audit trails.',
    minRole: 'support',
    scope: 'tenant',
  },
  {
    id: 'team',
    label: 'Team',
    href: '/dashboard/team',
    description: 'Manage tenant employees and invite members.',
    minRole: 'support',
    scope: 'tenant',
  },
  {
    id: 'settings',
    label: 'Account Settings',
    href: '/dashboard/settings',
    description: 'Review current tenant API keys and rotate credentials.',
    minRole: 'support',
    scope: 'account',
  },
  {
    id: 'tenants',
    label: 'Tenants',
    href: '/dashboard/tenants',
    description: 'Create tenants, rotate tenant keys, and inspect platform usage.',
    minRole: 'superadmin',
    scope: 'platform',
  },
];

