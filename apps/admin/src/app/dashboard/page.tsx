'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { SuperadminOnly } from '../../components/SuperadminOnly';
import { fetchSystemBalance, type SystemBalanceResponse } from '../../services/adminService';
import {
  Activity,
  ArrowRight,
  Building2,
  Clock3,
  HandCoins,
  RefreshCcw,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

function SystemBalanceWidget() {
  const [balance, setBalance] = useState<SystemBalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (amount: string, currencyCode = 'USD') =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(Number(amount));

  useEffect(() => {
    loadBalance();

    const intervalId = setInterval(() => {
      loadBalance();
    }, 300000);

    return () => clearInterval(intervalId);
  }, []);

  const loadBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSystemBalance();
      setBalance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system balance');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">System Balance</h3>
          <div className="p-2 rounded-lg bg-slate-100 text-slate-400">
            <Activity size={16} />
          </div>
        </div>
        <div className="animate-pulse">
          <div className="h-3 bg-slate-200 rounded mb-2"></div>
          <div className="h-3 bg-slate-200 rounded mb-2"></div>
          <div className="h-3 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">System Balance</h3>
          <div className="p-2 rounded-lg bg-slate-100 text-slate-400">
            <ShieldCheck size={16} />
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700">{error}</p>
        </div>
        <button
          onClick={loadBalance}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          Retry <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  if (!balance) {
    return null;
  }

  const balanceCurrencyCode = balance.currency ?? balance.currency_code ?? 'USD';

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">System Balance</h3>
          <p className="text-xs text-slate-500">Live and sandbox liabilities</p>
        </div>
        <button
          onClick={loadBalance}
          className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/60">
            <p className="text-xs text-slate-500">Live Total</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatCurrency(balance.total_live, balanceCurrencyCode)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/60">
            <p className="text-xs text-slate-500">Sandbox Total</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatCurrency(balance.total_sandbox, balanceCurrencyCode)}
            </p>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-semibold text-slate-900">Currency Breakdown</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-slate-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Currency</th>
                <th className="px-3 py-2 text-right font-medium">Live</th>
                <th className="px-3 py-2 text-right font-medium">Sandbox</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(balance.currency_breakdown).map(([currency, amounts]) => (
                <tr key={currency} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-sm font-semibold text-slate-900">{currency}</td>
                  <td className="px-3 py-2 text-right text-sm text-slate-700">
                    {formatCurrency(amounts.live, currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-sm text-slate-700">
                    {formatCurrency(amounts.sandbox, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] font-mono text-slate-400 border-t border-slate-200 pt-3 flex items-center gap-1">
          <Clock3 size={12} /> Last updated: {new Date(balance.calculated_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { adminUser, loading } = useRequireAuth();
  const router = useRouter();

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
        <button className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Wallet size={18} />
            </div>
            <span className="text-[11px] font-mono text-slate-400">/wallets</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Wallet Management</h3>
          <p className="text-xs text-slate-500 mb-4">Search, view, and manage user wallets</p>
          <button
            onClick={() => router.push('/dashboard/wallets')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Manage Wallets <ArrowRight size={14} />
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <HandCoins size={18} />
            </div>
            <span className="text-[11px] font-mono text-slate-400">/actions</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Manual Actions</h3>
          <p className="text-xs text-slate-500 mb-4">Perform manual credits, debits, and reversals</p>
          <button
            onClick={() => router.push('/dashboard/actions')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Perform Actions <ArrowRight size={14} />
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Building2 size={18} />
            </div>
            <span className="text-[11px] font-mono text-slate-400">/tenants</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Tenant Management</h3>
          <p className="text-xs text-slate-500 mb-4">Create and manage tenants with API keys</p>
          <button
            onClick={() => router.push('/dashboard/tenants')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Manage Tenants <ArrowRight size={14} />
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <ShieldCheck size={18} />
            </div>
            <span className="text-[11px] font-mono text-slate-400">/audit</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Audit Logs</h3>
          <p className="text-xs text-slate-500 mb-4">View system activity and audit trails</p>
          <button
            onClick={() => router.push('/dashboard/audit')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            View Logs <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <SuperadminOnly>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Superadmin Tools</h2>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <SystemBalanceWidget />
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 xl:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <Search size={18} />
                </div>
                <span className="text-[11px] font-mono text-slate-400">/search</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Global Search</h3>
              <p className="text-xs text-slate-500 mb-4">
                Search wallets and transactions across all tenants
              </p>
              <button
                onClick={() => router.push('/dashboard/search')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-2 rounded-lg inline-flex items-center gap-2"
              >
                Open Search <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </SuperadminOnly>

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
