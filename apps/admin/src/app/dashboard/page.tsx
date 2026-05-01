'use client';

import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { adminUser, loading } = useRequireAuth();
  const router = useRouter();

  if (loading) {
    return <div className="text-gray-600">Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      </div>
      {adminUser && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Role:</strong> {adminUser.role} | <strong>Tenant:</strong> {adminUser.tenantId}
          </p>
        </div>
      )}
    </div>
  );
}
