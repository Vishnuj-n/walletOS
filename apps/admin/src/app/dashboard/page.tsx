'use client';

import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useRouter } from 'next/navigation';
import { PermissionGate } from '../../components/PermissionGate';
import { DASHBOARD_CAPABILITIES } from '../../components/dashboardCapabilities';
import {
  Activity,
  ArrowRight,
  Building2,
  Cog,
  HandCoins,
  RefreshCcw,
  ShieldCheck,
  Wallet,
  Users,
} from 'lucide-react';

const capabilityIcons = {
  wallets: Wallet,
  actions: HandCoins,
  audit: ShieldCheck,
  team: Users,
  settings: Cog,
  tenants: Building2,
} as const;

const capabilityAccent = {
  wallets: 'bg-blue-50 text-blue-600',
  actions: 'bg-emerald-50 text-emerald-600',
  audit: 'bg-amber-50 text-amber-600',
  team: 'bg-violet-50 text-violet-600',
  settings: 'bg-slate-100 text-slate-700',
  tenants: 'bg-indigo-50 text-indigo-600',
} as const;

const capabilityActionLabel = {
  wallets: 'Manage Wallets',
  actions: 'Open Actions',
  audit: 'View Audit Logs',
  team: 'Manage Team',
  settings: 'Open Settings',
  tenants: 'Manage Tenants',
} as const;

export default function DashboardPage() {
  const { adminUser, loading } = useRequireAuth();
  const router = useRouter();

  const visibleCapabilities = adminUser ? DASHBOARD_CAPABILITIES : [];

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Governance Console</h1>
          <p className="text-xs text-slate-500">Manage your WalletOS administration</p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {visibleCapabilities.map((capability) => {
          const Icon = capabilityIcons[capability.id as keyof typeof capabilityIcons];
          const accent = capabilityAccent[capability.id as keyof typeof capabilityAccent];
          const actionLabel = capabilityActionLabel[capability.id as keyof typeof capabilityActionLabel];

          return (
            <PermissionGate key={capability.id} minRole={capability.minRole}>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${accent}`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{capability.href.replace('/dashboard', '')}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">{capability.label}</h3>
                <p className="text-xs text-slate-500 mb-4">{capability.description}</p>
                <button
                  onClick={() => router.push(capability.href)}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  {actionLabel} <ArrowRight size={14} />
                </button>
              </div>
            </PermissionGate>
          );
        })}
      </div>

      {adminUser && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center gap-2">
          <Activity size={16} className="text-slate-400" />
          <p className="text-xs text-slate-500">
            <strong>Role:</strong> {adminUser.role} | <strong>Tenant:</strong> {adminUser.tenantId}
          </p>
        </div>
      )}
    </div>
  );
}
