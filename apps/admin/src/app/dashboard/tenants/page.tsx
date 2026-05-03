'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { SuperadminOnly } from '../../../components/SuperadminOnly';
import { 
  createTenant,
  fetchTenants, 
  rotateTenantKey, 
  fetchTenantUsage, 
  revokeTenantKey,
  Tenant,
  CreatedTenantResponse,
  RotateKeyRequest,
  TenantUsageResponse,
  RevokeKeyRequest
} from '../../../services/adminService';

interface UsageModalProps {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}

function UsageModal({ tenantId, tenantName, onClose }: UsageModalProps) {
  const [usage, setUsage] = useState<TenantUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsage = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTenantUsage(tenantId);
        setUsage(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch usage');
      } finally {
        setLoading(false);
      }
    };

    loadUsage();
  }, [tenantId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            API Usage - {tenantName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        {loading && <p className="text-gray-500">Loading usage data...</p>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {usage && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Showing API requests per hour for the last {usage.hours} hours
            </p>
            <div className="space-y-2">
              {usage.usage.map((hour, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">
                    {new Date(hour.hour).toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {hour.requests} requests
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TenantsPage() {
  const { isSuperadmin } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageModal, setUsageModal] = useState<{ tenantId: string; tenantName: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Create tenant form state
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [createdTenant, setCreatedTenant] = useState<CreatedTenantResponse | null>(null);
  const [copyStatus, setCopyStatus] = useState<string>('');

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTenants();
      setTenants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  };

  const handleRotateKey = async (tenantId: string, tenantName: string, scope: 'live' | 'test') => {
    if (!confirm(`Are you sure you want to rotate the ${scope} API key for ${tenantName}? This will invalidate the existing key.`)) {
      return;
    }

    setActionLoading(`${tenantId}-${scope}`);
    try {
      const result = await rotateTenantKey(tenantId, { scope });
      alert(`New ${scope} API key generated: ${result.api_key}\n\nSave this key now - it won't be shown again!`);
      await loadTenants(); // Refresh the list
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rotate key');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeKey = async (tenantId: string, tenantName: string, scope: 'live' | 'test') => {
    if (!confirm(`Are you sure you want to revoke all ${scope} API keys for ${tenantName}? This action cannot be undone.`)) {
      return;
    }

    setActionLoading(`${tenantId}-revoke-${scope}`);
    try {
      await revokeTenantKey(tenantId, { scope });
      alert(`${scope} API keys revoked successfully for ${tenantName}`);
      await loadTenants(); // Refresh the list
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke keys');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createLoading) return;

    const normalizedName = name.trim();
    if (!normalizedName) {
      setCreateError('Tenant name is required');
      return;
    }

    setCreateError('');
    setCreateSuccess('');
    setCreateLoading(true);
    setCreatedTenant(null);

    try {
      const result = await createTenant({
        name: normalizedName,
        contact_email: contactEmail.trim() || undefined,
      });
      setCreatedTenant(result);
      setCreateSuccess('Tenant created successfully!');
      setName('');
      setContactEmail('');
      await loadTenants(); // Refresh the list
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create tenant');
    } finally {
      setCreateLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    setCopyStatus('');
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch (err) {
      setCopyStatus('Select & copy manually');
      setTimeout(() => setCopyStatus(''), 3000);
    }
  };

  if (!isSuperadmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-yellow-800">Access Denied</h3>
          <p className="text-yellow-700 mt-2">This feature is only available to superadmins.</p>
        </div>
      </div>
    );
  }

  return (
    <SuperadminOnly>
      <div className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenant Management</h1>
            <p className="text-gray-600">Manage all tenants and their API keys</p>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create New Tenant
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-red-800">Error</h3>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading tenants...</p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wallets
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Admins
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tenants.map((tenant) => (
                  <tr key={tenant.tenant_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                      <div className="text-sm text-gray-500">{tenant.tenant_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tenant.contact_email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tenant.wallet_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tenant.admin_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRotateKey(tenant.tenant_id, tenant.name, 'live')}
                          disabled={actionLoading === `${tenant.tenant_id}-live`}
                          className="text-indigo-600 hover:text-indigo-900 text-xs disabled:opacity-50"
                        >
                          {actionLoading === `${tenant.tenant_id}-live` ? 'Rotating...' : 'Rotate Live Key'}
                        </button>
                        <button
                          onClick={() => handleRotateKey(tenant.tenant_id, tenant.name, 'test')}
                          disabled={actionLoading === `${tenant.tenant_id}-test`}
                          className="text-indigo-600 hover:text-indigo-900 text-xs disabled:opacity-50"
                        >
                          {actionLoading === `${tenant.tenant_id}-test` ? 'Rotating...' : 'Rotate Test Key'}
                        </button>
                        <button
                          onClick={() => handleRevokeKey(tenant.tenant_id, tenant.name, 'live')}
                          disabled={actionLoading === `${tenant.tenant_id}-revoke-live`}
                          className="text-red-600 hover:text-red-900 text-xs disabled:opacity-50"
                        >
                          {actionLoading === `${tenant.tenant_id}-revoke-live` ? 'Revoking...' : 'Revoke Live'}
                        </button>
                        <button
                          onClick={() => handleRevokeKey(tenant.tenant_id, tenant.name, 'test')}
                          disabled={actionLoading === `${tenant.tenant_id}-revoke-test`}
                          className="text-red-600 hover:text-red-900 text-xs disabled:opacity-50"
                        >
                          {actionLoading === `${tenant.tenant_id}-revoke-test` ? 'Revoking...' : 'Revoke Test'}
                        </button>
                        <button
                          onClick={() => setUsageModal({ tenantId: tenant.tenant_id, tenantName: tenant.name })}
                          className="text-green-600 hover:text-green-900 text-xs"
                        >
                          View Usage
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tenants.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No tenants found</p>
              </div>
            )}
          </div>
        )}

        {/* Create Tenant Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Create New Tenant</h3>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  {createError}
                </div>
              )}

              {createSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
                  {createSuccess}
                </div>
              )}

              {copyStatus && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
                  {copyStatus}
                </div>
              )}

              {!createdTenant ? (
                <form onSubmit={handleCreateTenant}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tenant Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Enter tenant name"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Enter contact email (optional)"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={createLoading}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createLoading ? 'Creating...' : 'Create Tenant'}
                  </button>
                </form>
              ) : (
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">
                    🔑 API Keys - Save These Now!
                  </h4>
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4">
                    <p className="font-medium">Important:</p>
                    <p className="text-sm">
                      These API keys will only be shown once. Please save them securely.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Live API Key
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={createdTenant.live_key}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => copyToClipboard(createdTenant.live_key)}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Test API Key (Sandbox)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={createdTenant.test_key}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => copyToClipboard(createdTenant.test_key)}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setCreateModalOpen(false);
                      setCreatedTenant(null);
                    }}
                    className="w-full mt-6 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usage Modal */}
        {usageModal && (
          <UsageModal
            tenantId={usageModal.tenantId}
            tenantName={usageModal.tenantName}
            onClose={() => setUsageModal(null)}
          />
        )}
      </div>
    </SuperadminOnly>
  );
}
