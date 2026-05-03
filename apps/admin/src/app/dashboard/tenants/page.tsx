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
import { Building2, KeyRound, Plus, ShieldAlert } from 'lucide-react';

interface UsageModalProps {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}

interface AlertModalProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

function AlertModal({ message, type, onClose }: AlertModalProps) {
  const bgColor = type === 'success' ? 'bg-green-50' : 'bg-red-50';
  const borderColor = type === 'success' ? 'border-green-200' : 'border-red-200';
  const textColor = type === 'success' ? 'text-green-700' : 'text-red-700';
  const iconColor = type === 'success' ? 'text-green-600' : 'text-red-600';

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
      <div className={`${bgColor} ${borderColor} border rounded-xl p-6 max-w-md w-full shadow-xl`}>
        <div className="flex items-start gap-3">
          <div className={`${iconColor} mt-0.5`}>
            {type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-semibold ${type === 'success' ? 'text-green-900' : 'text-red-900'} mb-2`}>
              {type === 'success' ? 'Success' : 'Error'}
            </h3>
            <p className={`text-sm ${textColor} whitespace-pre-wrap`}>{message}</p>
          </div>
          <button
            onClick={onClose}
            className={`text-gray-400 hover:text-gray-600`}
          >
            ×
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
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
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2">
            <Building2 size={16} className="text-blue-600" />
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
  const [apiKeyModal, setApiKeyModal] = useState<{ apiKey: string; scope: string; tenantName: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [alertModal, setAlertModal] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
      setAlertModal({
        message: `New ${scope} API key generated: ${result.api_key}\n\nSave this key now - it won't be shown again!`,
        type: 'success'
      });
      await loadTenants(); // Refresh the list
    } catch (err) {
      setAlertModal({
        message: err instanceof Error ? err.message : 'Failed to rotate key',
        type: 'error'
      });
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
      setAlertModal({
        message: `${scope} API keys revoked successfully for ${tenantName}`,
        type: 'success'
      });
      await loadTenants(); // Refresh the list
    } catch (err) {
      setAlertModal({
        message: err instanceof Error ? err.message : 'Failed to revoke keys',
        type: 'error'
      });
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

    const trimmedEmail = contactEmail.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setCreateError('Please enter a valid email address');
        return;
      }
    }

    setCreateError('');
    setCreateSuccess('');
    setCreateLoading(true);
    setCreatedTenant(null);

    try {
      const result = await createTenant({
        name: normalizedName,
        contact_email: trimmedEmail || undefined,
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
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Tenant Management</h1>
            <p className="text-xs text-slate-500">Manage all tenants and their API keys</p>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus size={16} /> Create New Tenant
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-red-800">Error</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading tenants...</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-xl">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
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
              <tbody className="bg-white divide-y divide-slate-100">
                {tenants.map((tenant) => (
                  <tr key={tenant.tenant_id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-slate-900">{tenant.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{tenant.tenant_id}</div>
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
          <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-2"><Building2 size={16} className="text-blue-600" />Create New Tenant</h3>
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
                      pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                      title="Please enter a valid email address"
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional - must be a valid email if provided</p>
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
                  <h4 className="text-sm font-semibold text-slate-900 mb-4 inline-flex items-center gap-2">
                    <KeyRound size={16} className="text-blue-600" /> API Keys - Save These Now!
                  </h4>
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-4">
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
                    className="w-full mt-6 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm font-semibold"
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

        {/* Alert Modal */}
        {alertModal && (
          <AlertModal
            message={alertModal.message}
            type={alertModal.type}
            onClose={() => setAlertModal(null)}
          />
        )}
      </div>
    </SuperadminOnly>
  );
}
