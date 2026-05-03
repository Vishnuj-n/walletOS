'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { SuperadminOnly } from '../../components/SuperadminOnly';
import { fetchSystemBalance, type SystemBalanceResponse } from '../../services/adminService';

function SystemBalanceWidget() {
  const [balance, setBalance] = useState<SystemBalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBalance();
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
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">System Balance</h3>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">System Balance</h3>
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
        <button
          onClick={loadBalance}
          className="mt-3 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
        >
          Retry →
        </button>
      </div>
    );
  }

  if (!balance) {
    return null;
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">System Balance</h3>
        <button
          onClick={loadBalance}
          className="text-gray-400 hover:text-gray-600"
          title="Refresh"
        >
          ↻
        </button>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Live Total</p>
            <p className="text-2xl font-bold text-green-600">
              ${Number(balance.total_live).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Sandbox Total</p>
            <p className="text-2xl font-bold text-yellow-600">
              ${Number(balance.total_sandbox).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm text-gray-500 mb-2">Currency Breakdown</p>
          <div className="space-y-2">
            {Object.entries(balance.currency_breakdown).map(([currency, amounts]) => (
              <div key={currency} className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">{currency}</span>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">
                    Live: ${Number(amounts.live).toLocaleString()}
                  </span>
                  <span className="text-yellow-600">
                    Sandbox: ${Number(amounts.sandbox).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400 border-t pt-2">
          Last updated: {new Date(balance.calculated_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { adminUser, loading } = useRequireAuth();
  const { isSuperadmin } = useAuth();
  const router = useRouter();

  if (loading) {
    return <div className="text-gray-600">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Manage your WalletOS administration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Wallet Management</h3>
          <p className="text-gray-600 mb-4">Search, view, and manage user wallets</p>
          <button
            onClick={() => router.push('/dashboard/wallets')}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Manage Wallets →
          </button>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Manual Actions</h3>
          <p className="text-gray-600 mb-4">Perform manual credits, debits, and reversals</p>
          <button
            onClick={() => router.push('/dashboard/actions')}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Perform Actions →
          </button>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Tenant Management</h3>
          <p className="text-gray-600 mb-4">Create and manage tenants with API keys</p>
          <button
            onClick={() => router.push('/dashboard/tenants')}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Manage Tenants →
          </button>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Audit Logs</h3>
          <p className="text-gray-600 mb-4">View system activity and audit trails</p>
          <button
            onClick={() => router.push('/dashboard/audit')}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            View Logs →
          </button>
        </div>
      </div>

      {/* Superadmin-only sections */}
      <SuperadminOnly>
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Superadmin Tools</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SystemBalanceWidget />
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Global Search</h3>
              <p className="text-gray-600 mb-4">Search wallets and transactions across all tenants</p>
              <button
                onClick={() => router.push('/dashboard/search')}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Global Search →
              </button>
            </div>
          </div>
        </div>
      </SuperadminOnly>

      {adminUser && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Role:</strong> {adminUser.role} | <strong>Tenant:</strong> {adminUser.tenantId}
          </p>
        </div>
      )}
    </div>
  );
}
