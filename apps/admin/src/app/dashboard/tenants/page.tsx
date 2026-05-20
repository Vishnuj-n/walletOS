'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { PermissionGate } from '../../../components/PermissionGate';
import { CredentialRevealDialog, type RevealedCredential } from '../../../components/CredentialRevealDialog';
import {
  createTenant,
  fetchTenants,
  rotateTenantKey,
  fetchTenantUsage,
  revokeTenantKey,
} from '../../../services/adminService';
import type { Tenant, TenantUsageResponse } from '@walletOS/types';
import { Building2, Plus, MoreVertical } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
      } catch {
        setError('Failed to fetch usage');
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
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-600">
                API requests per hour for the last {usage.hours} hours
              </p>
              <p className="text-xs text-gray-500">
                Last updated: {new Date().toLocaleTimeString()}
              </p>
            </div>
            
            <div className="bg-slate-50 rounded-lg p-4">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={usage.usage.map(hour => ({
                  time: new Date(hour.hour).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    hour12: true 
                  }),
                  hour: new Date(hour.hour).toLocaleString(),
                  requests: hour.requests
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    labelFormatter={(value) => `Time: ${value}`}
                    formatter={(value) => [typeof value === 'number' ? `${value} requests` : '0 requests', 'API Calls']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="requests" 
                    stroke="#2563eb" 
                    fill="#2563eb" 
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 text-xs text-gray-500 text-center">
              {usage.usage.length > 0 && (
                <p>
                  Current hour data may not be available yet. 
                  {usage.usage[usage.usage.length - 1].requests === 0 && 
                    ` Data for ${new Date().toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      hour12: true 
                    })} is still being processed.`
                  }
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TenantsPage() {
  useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageModal, setUsageModal] = useState<{ tenantId: string; tenantName: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [alertModal, setAlertModal] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Create tenant form state
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [bootstrapAdminEmail, setBootstrapAdminEmail] = useState('');
  const [revealState, setRevealState] = useState<{
    title: string;
    tenantName?: string;
    credentials: RevealedCredential[];
  } | null>(null);

  const [openKebabTenantId, setOpenKebabTenantId] = useState<string | null>(null);

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.kebab-menu-container')) {
        setOpenKebabTenantId(null);
      }
    };

    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
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
      setRevealState({
        title: `${scope === 'live' ? 'Live' : 'Test'} key rotated`,
        tenantName,
        credentials: [
          {
            id: `${tenantId}-${scope}`,
            label: scope === 'live' ? 'Live API Key' : 'Test API Key',
            value: result.api_key,
            tone: scope,
          },
        ],
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
    setCreateLoading(true);

    try {
      const result = await createTenant({
        name: normalizedName,
        contact_email: trimmedEmail || undefined,
        bootstrap_admin_email: bootstrapAdminEmail.trim() || undefined,
      });
      setRevealState({
        title: 'Tenant credentials issued',
        tenantName: result.name,
        credentials: [
          {
            id: `${result.tenant_id}-live`,
            label: 'Live API Key',
            value: result.live_key,
            tone: 'live',
          },
          {
            id: `${result.tenant_id}-test`,
            label: 'Test API Key',
            value: result.test_key,
            tone: 'test',
          },
        ],
      });
      setName('');
      setContactEmail('');
      setBootstrapAdminEmail('');
      setCreateModalOpen(false);
      await loadTenants(); // Refresh the list
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create tenant');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <PermissionGate 
      minRole="superadmin"
      fallback={
        <div className="p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-yellow-800">Access Denied</h3>
            <p className="text-yellow-700 mt-2">This feature is only available to superadmins.</p>
          </div>
        </div>
      }
    >
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
                      <div className="flex items-center space-x-3 justify-start">
                        <button
                          onClick={() => setUsageModal({ tenantId: tenant.tenant_id, tenantName: tenant.name })}
                          className="text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors text-xs font-semibold"
                        >
                          View Usage
                        </button>
                        
                        <div className="relative kebab-menu-container">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenKebabTenantId(openKebabTenantId === tenant.tenant_id ? null : tenant.tenant_id);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors inline-flex items-center justify-center focus:outline-none"
                            aria-label="More actions"
                            title="More actions"
                          >
                            <MoreVertical size={16} />
                          </button>
                          
                          {openKebabTenantId === tenant.tenant_id && (
                            <div className="absolute right-0 mt-1.5 z-50 w-48 origin-top-right overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg transition-all flex flex-col">
                              <button
                                onClick={() => {
                                  handleRotateKey(tenant.tenant_id, tenant.name, 'live');
                                  setOpenKebabTenantId(null);
                                }}
                                disabled={actionLoading === `${tenant.tenant_id}-live`}
                                className="block w-full whitespace-nowrap px-4 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                              >
                                {actionLoading === `${tenant.tenant_id}-live` ? 'Rotating...' : 'Rotate Live Key'}
                              </button>
                              
                              <button
                                onClick={() => {
                                  handleRotateKey(tenant.tenant_id, tenant.name, 'test');
                                  setOpenKebabTenantId(null);
                                }}
                                disabled={actionLoading === `${tenant.tenant_id}-test`}
                                className="block w-full whitespace-nowrap px-4 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                              >
                                {actionLoading === `${tenant.tenant_id}-test` ? 'Rotating...' : 'Rotate Test Key'}
                              </button>
                              
                              <div className="border-t border-slate-100 my-1"></div>
                              
                              <button
                                onClick={() => {
                                  handleRevokeKey(tenant.tenant_id, tenant.name, 'live');
                                  setOpenKebabTenantId(null);
                                }}
                                disabled={actionLoading === `${tenant.tenant_id}-revoke-live`}
                                className="block w-full whitespace-nowrap px-4 py-2 text-left text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                              >
                                {actionLoading === `${tenant.tenant_id}-revoke-live` ? 'Revoking...' : 'Revoke Live'}
                              </button>
                              
                              <button
                                onClick={() => {
                                  handleRevokeKey(tenant.tenant_id, tenant.name, 'test');
                                  setOpenKebabTenantId(null);
                                }}
                                disabled={actionLoading === `${tenant.tenant_id}-revoke-test`}
                                className="block w-full whitespace-nowrap px-4 py-2 text-left text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                              >
                                {actionLoading === `${tenant.tenant_id}-revoke-test` ? 'Revoking...' : 'Revoke Test'}
                              </button>
                            </div>
                          )}
                        </div>
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

                <div className="mb-4">
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

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bootstrap Tenant Admin Email
                  </label>
                  <input
                    type="email"
                    value={bootstrapAdminEmail}
                    onChange={(e) => setBootstrapAdminEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Invite the first tenant admin (optional)"
                    pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                    title="Please enter a valid email address"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional - sends the first tenant admin invite through Supabase.</p>
                </div>

                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createLoading ? 'Creating...' : 'Create Tenant'}
                </button>
              </form>
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

        {revealState && (
          <CredentialRevealDialog
            title={revealState.title}
            tenantName={revealState.tenantName}
            credentials={revealState.credentials}
            onClear={() => setRevealState(null)}
          />
        )}
      </div>
    </PermissionGate>
  );
}
