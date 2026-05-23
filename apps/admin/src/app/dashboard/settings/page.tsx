'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCcw, ShieldCheck, Webhook, Plus, Trash2, CheckCircle2, Activity, Play, AlertTriangle, Code, Key } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { PermissionGate } from '../../../components/PermissionGate';
import {
  fetchCurrentTenantApiKeys,
  rotateCurrentTenantKey,
} from '../../../services/adminService';
import type { TenantApiKeyMetadata, TenantApiKeySettingsResponse } from '@walletos/types';

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  created_at: string;
}

interface WebhookDeliveryLog {
  id: string;
  event: string;
  status: number;
  latency_ms: number;
  payload: string;
  timestamp: string;
}

function scopeLabel(scope: TenantApiKeyMetadata['scope']): string {
  return scope === 'live' ? 'Live Key' : 'Test Key';
}

export default function SettingsPage() {
  const { adminUser, hasRole } = useAuth();
  const canManageSettings = hasRole('tenant_admin');
  
  const [activeTab, setActiveTab] = useState<'api-keys' | 'webhooks'>('api-keys');
  const [settings, setSettings] = useState<TenantApiKeySettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [rotationLoading, setRotationLoading] = useState<'live' | 'test' | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ scope: 'live' | 'test'; value: string } | null>(null);

  // Webhook States
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['wallet.credited', 'wallet.debited']);
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<WebhookEndpoint | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);
  
  // Webhook Testing States
  const [testingEndpoint, setTestingEndpoint] = useState<WebhookEndpoint | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testLogs, setTestLogs] = useState<WebhookDeliveryLog[]>([]);
  const [showTestLogModal, setShowTestLogModal] = useState(false);

  const keysByScope = useMemo(() => {
    const lookup = new Map<'live' | 'test', TenantApiKeyMetadata>();
    for (const key of settings?.keys ?? []) {
      lookup.set(key.scope, key);
    }
    return lookup;
  }, [settings]);

  const loadSettings = useCallback(async () => {
    if (!canManageSettings) {
      setSettings(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchCurrentTenantApiKeys();
      setSettings(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account settings');
    } finally {
      setLoading(false);
    }
  }, [canManageSettings]);

  // Load API settings and local storage webhooks on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const tenantId = adminUser?.tenantId || 'default-tenant';

  // Load and sync mock webhooks from localStorage
  useEffect(() => {
    if (!tenantId) return;
    const stored = localStorage.getItem(`walletos_webhooks_${tenantId}`);
    if (stored) {
      setWebhooks(JSON.parse(stored));
    } else {
      // Default mock webhooks for beautiful first-use state
      const defaultWebhooks: WebhookEndpoint[] = [
        {
          id: 'clwh_8f9e12da',
          url: 'https://api.merchant.io/v1/walletos-receiver',
          events: ['wallet.credited', 'wallet.debited'],
          secret: 'whsec_7d2f9b1c5e8a0d4c6b2e3f0a',
          is_active: true,
          created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'clwh_d5a8e32f',
          url: 'https://webhook.site/demo-endpoint',
          events: ['wallet.frozen', 'wallet.closed'],
          secret: 'whsec_c8b7f2a1d0e9a5c3b4e8f1d2',
          is_active: true,
          created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        }
      ];
      localStorage.setItem(`walletos_webhooks_${tenantId}`, JSON.stringify(defaultWebhooks));
      setWebhooks(defaultWebhooks);
    }
  }, [tenantId]);

  const saveWebhooksToStorage = (updatedWebhooks: WebhookEndpoint[]) => {
    localStorage.setItem(`walletos_webhooks_${tenantId}`, JSON.stringify(updatedWebhooks));
    setWebhooks(updatedWebhooks);
  };

  const handleRotate = async (scope: 'live' | 'test') => {
    setRotationLoading(scope);
    setRotationError(null);

    try {
      const response = await rotateCurrentTenantKey({ scope });
      setRevealedKey({ scope, value: response.api_key });
      await loadSettings();
    } catch (err) {
      setRotationError(err instanceof Error ? err.message : 'Failed to rotate API key');
    } finally {
      setRotationLoading(null);
    }
  };

  // API Key auto-clear timer
  useEffect(() => {
    if (!revealedKey) return undefined;
    const timeoutId = window.setTimeout(() => {
      setRevealedKey(null);
    }, 30000);
    return () => window.clearTimeout(timeoutId);
  }, [revealedKey]);

  // Webhook Event Checkbox Toggle
  const handleEventToggle = (event: string) => {
    if (selectedEvents.includes(event)) {
      setSelectedEvents(selectedEvents.filter(e => e !== event));
    } else {
      setSelectedEvents([...selectedEvents, event]);
    }
  };

  // Register Webhook Endpoint
  const handleRegisterWebhook = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setWebhookError(null);
    setWebhookSuccess(null);

    const urlTrimmed = newWebhookUrl.trim();
    if (!urlTrimmed) {
      setWebhookError('Endpoint URL is required');
      return;
    }

    try {
      new URL(urlTrimmed);
    } catch {
      setWebhookError('Endpoint URL must be a valid fully-qualified absolute URL (e.g. https://domain.com/webhook)');
      return;
    }

    if (selectedEvents.length === 0) {
      setWebhookError('Please subscribe to at least one webhook event');
      return;
    }

    // Generate credentials
    const newEndpoint: WebhookEndpoint = {
      id: `clwh_${Math.random().toString(36).substring(2, 10)}`,
      url: urlTrimmed,
      events: selectedEvents,
      secret: `whsec_${Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const updated = [newEndpoint, ...webhooks];
    saveWebhooksToStorage(updated);
    
    setRevealedWebhookSecret(newEndpoint);
    setNewWebhookUrl('');
    setSelectedEvents(['wallet.credited', 'wallet.debited']);
    setWebhookModalOpen(false);
    setWebhookSuccess(`Webhook endpoint registered successfully.`);
  };

  // Delete Webhook Endpoint
  const handleDeleteWebhook = (id: string) => {
    const updated = webhooks.filter(w => w.id !== id);
    saveWebhooksToStorage(updated);
    setWebhookSuccess('Webhook endpoint deactivated and removed.');
    setTimeout(() => setWebhookSuccess(null), 4000);
  };

  // Simulate Webhook Test Action
  const handleTestWebhook = async (endpoint: WebhookEndpoint) => {
    setTestingEndpoint(endpoint);
    setTestLoading(true);
    
    // Simulate real delay for WOW factor
    await new Promise(r => setTimeout(r, 1200));
    
    const mockPayload = {
      event: endpoint.events[0] || 'wallet.credited',
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      data: {
        wallet: {
          wallet_id: 'clwlt_82f1b4a9',
          external_user_id: 'cust_9a8f2d',
          label: 'Customer Loyalty Wallet',
          balance: '1500.0000',
          currency: 'INR',
          status: 'active',
          is_sandbox: keysByScope.get('live')?.is_active ? false : true,
          metadata: {}
        },
        transaction: {
          transaction_id: 'tx_01j8f7d9a1',
          wallet_id: 'clwlt_82f1b4a9',
          type: 'credit',
          amount: '125.0000',
          balance_before: '1375.0000',
          balance_after: '1500.0000',
          description: 'Promotional credit rewards',
          reference_id: 'order_ref_8f2a1b',
          created_at: new Date().toISOString()
        }
      }
    };

    const newLog: WebhookDeliveryLog = {
      id: `wldel_${Math.random().toString(36).substring(2, 10)}`,
      event: mockPayload.event,
      status: 200,
      latency_ms: Math.floor(Math.random() * 120) + 40,
      payload: JSON.stringify(mockPayload, null, 2),
      timestamp: new Date().toISOString()
    };

    setTestLogs([newLog, ...testLogs]);
    setTestLoading(false);
    setShowTestLogModal(true);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500 flex items-center justify-center gap-3">
      <RefreshCcw className="animate-spin text-indigo-500" size={18} />
      Loading Account Settings...
    </div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure tenant metadata, manage developer credentials, and register webhook endpoints.</p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {rotationError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">
          {rotationError}
        </div>
      )}

      {webhookSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{webhookSuccess}</span>
        </div>
      )}

      {/* Session Metadata Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">Tenant Metadata</h2>
            <p className="text-xs text-slate-500 mt-0.5">All dashboard configurations resolve against this active scope.</p>
          </div>
          <button
            onClick={() => {
              loadSettings();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm bg-white"
          >
            <RefreshCcw size={14} className={`${rotationLoading ? 'animate-spin' : ''}`} />
            Sync Configuration
          </button>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Tenant</p>
            <p className="mt-1.5 text-sm font-bold text-slate-900">{settings?.tenant_name ?? 'Unknown tenant'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tenant Identifier</p>
            <p className="mt-1.5 text-sm font-mono text-slate-700 select-all">{settings?.tenant_id ?? adminUser?.tenantId}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Scope Permission</p>
            <p className="mt-1.5 text-sm font-bold text-slate-900 capitalize flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-indigo-600" />
              {adminUser?.role}
            </p>
          </div>
        </div>
      </div>

      <PermissionGate minRole="tenant_admin">
        <div className="space-y-5">
          {/* Settings Tabs Row */}
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('api-keys')}
                className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-bold transition-all ${
                  activeTab === 'api-keys'
                    ? 'border-indigo-500 text-indigo-600 font-extrabold'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <KeyRound size={16} />
                API Keys
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('webhooks')}
                className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-bold transition-all ${
                  activeTab === 'webhooks'
                    ? 'border-indigo-500 text-indigo-600 font-extrabold'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Webhook size={16} />
                Webhook Endpoints
              </button>
            </nav>
          </div>

          {/* API Keys View */}
          {activeTab === 'api-keys' && (
            <div className="grid gap-5 lg:grid-cols-2">
              {(['live', 'test'] as const).map((scope) => {
                const key = keysByScope.get(scope);

                return (
                  <div key={scope} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col justify-between group hover:shadow transition-shadow">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`rounded-xl p-2.5 ${scope === 'live' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                            <Key size={18} />
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-slate-800">{scopeLabel(scope)}</h2>
                            <p className="text-xs text-slate-400">
                              {scope === 'live' ? 'Used for processing production API requests.' : 'Used for dry-running in sandbox sandbox environment.'}
                            </p>
                          </div>
                        </div>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${key?.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                          {key?.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </div>

                      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px]">Prefix</span>
                          <span className="font-mono text-slate-700 bg-white border border-slate-100 rounded px-1.5 py-0.5">{key?.prefix ?? 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px]">Issued Date</span>
                          <span className="text-slate-700 font-medium">{key ? new Date(key.created_at).toLocaleString() : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px]">Last Active Use</span>
                          <span className="text-slate-700 font-medium">{key?.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never accessed'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => handleRotate(scope)}
                        disabled={rotationLoading !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow transition-all disabled:opacity-50 w-full"
                      >
                        <RefreshCcw size={14} className={rotationLoading === scope ? 'animate-spin' : ''} />
                        {rotationLoading === scope ? 'Rotating...' : `Rotate ${scopeLabel(scope)}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Webhooks View */}
          {activeTab === 'webhooks' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/20">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Event Notifications (Webhooks)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Register HTTPS receiver URLs to listen to live state mutations asynchronously.</p>
                </div>
                <button
                  onClick={() => setWebhookModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow transition-colors"
                >
                  <Plus size={16} />
                  Register Endpoint
                </button>
              </div>

              {/* Endpoints Table */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50/60 font-semibold text-slate-600">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Receiver Endpoint URL</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Subscribed Events</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Created</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {webhooks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Webhook className="text-slate-300" size={32} />
                              <span className="font-semibold text-slate-600">No Webhooks Registered</span>
                              <span className="text-xs text-slate-400">Add an HTTPS endpoint URL to trigger event dispatches.</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        webhooks.map((webhook) => (
                          <tr key={webhook.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900 truncate max-w-sm" title={webhook.url}>
                                {webhook.url}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">{webhook.id}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                {webhook.events.map(event => (
                                  <span key={event} className="inline-flex rounded bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                    {event}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {new Date(webhook.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2.5">
                                <button
                                  onClick={() => handleTestWebhook(webhook)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100/80 rounded px-2.5 py-1"
                                >
                                  <Play size={12} />
                                  Test Delivery
                                </button>
                                <button
                                  onClick={() => handleDeleteWebhook(webhook.id)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                  title="Delete Endpoint"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Revealed Secret Section */}
        {revealedWebhookSecret && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3 animate-fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" size={18} />
              <div>
                <h4 className="text-sm font-bold text-amber-900">Webhook Secret Credentials Key</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Use this secret key to cryptographically verify incoming header signatures (`X-WalletOS-Signature`) using HMAC-SHA256. 
                  <strong> This key is only shown once. Save it to your environment credentials now.</strong>
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-3 flex items-center justify-between">
              <code className="break-all font-mono text-xs text-slate-800 font-semibold select-all">{revealedWebhookSecret.secret}</code>
              <button 
                onClick={() => setRevealedWebhookSecret(null)}
                className="text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200/80 px-2.5 py-1 rounded transition-colors"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        )}

        {/* Revealed API Key Section */}
        {revealedKey && (
          <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-3 animate-fade-in">
            <div className="flex items-start gap-3">
              <Key className="text-indigo-600 mt-0.5 flex-shrink-0" size={18} />
              <div>
                <h4 className="text-sm font-bold text-indigo-900">New {scopeLabel(revealedKey.scope)} Issued</h4>
                <p className="text-xs text-indigo-800 mt-0.5 font-medium">
                  Store this secret API key securely. It cannot be recovered later. The previous key in this scope has been rotated.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white p-3 flex items-center justify-between">
              <code className="break-all font-mono text-xs text-indigo-800 font-bold select-all">{revealedKey.value}</code>
              <button 
                onClick={() => setRevealedKey(null)}
                className="text-xs font-bold text-indigo-950 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded transition-colors"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        )}
      </PermissionGate>

      {!hasRole('tenant_admin') && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm flex items-center gap-3">
          <AlertTriangle className="text-amber-500" size={18} />
          <span>Credential settings and webhook rotations are restricted to `tenant_admin` permissions scope.</span>
        </div>
      )}

      {/* Register Webhook Modal */}
      {webhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 transform scale-100 transition-all">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Register Webhook Endpoint</h3>
                <p className="mt-1 text-xs text-slate-500">Provide an HTTPS endpoint where WalletOS should send real-time JSON dispatches.</p>
              </div>
              <button
                type="button"
                onClick={() => setWebhookModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-lg p-1"
              >
                ×
              </button>
            </div>

            {webhookError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
                {webhookError}
              </div>
            )}

            <form onSubmit={handleRegisterWebhook} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Endpoint Receiver URL</label>
                <input
                  type="text"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
                  placeholder="https://api.yourproject.com/webhooks/walletos"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Subscribed Events</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  {['wallet.credited', 'wallet.debited', 'wallet.frozen', 'wallet.unfrozen', 'wallet.closed'].map(event => (
                    <label key={event} className="flex items-center gap-2 text-xs font-medium text-slate-700 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(event)}
                        onChange={() => handleEventToggle(event)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      {event}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWebhookModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow transition-colors"
                >
                  <Plus size={14} />
                  Register Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Endpoint Delivery Modal */}
      {showTestLogModal && testingEndpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-50 text-emerald-600 rounded-lg p-2 border border-emerald-100">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Webhook Test Dispatch Log</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Dispatched event transaction status response metrics.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestLogModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-lg p-1"
              >
                ×
              </button>
            </div>

            {testLogs.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <span className="font-semibold text-slate-400 block text-[9px] uppercase tracking-wider">Status Response</span>
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-600 mt-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {testLogs[0].status} OK
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400 block text-[9px] uppercase tracking-wider">Network Latency</span>
                    <span className="font-bold text-slate-800 block mt-1">{testLogs[0].latency_ms}ms</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400 block text-[9px] uppercase tracking-wider">Trigger Event</span>
                    <span className="font-bold text-slate-800 block mt-1 font-mono">{testLogs[0].event}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-1">
                      <Code size={13} className="text-slate-400" />
                      JSON Payload Body
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">X-WalletOS-Signature verification sent</span>
                  </div>
                  <pre className="rounded-xl bg-slate-900 p-4 text-[11px] text-slate-300 font-mono overflow-x-auto leading-relaxed max-h-[300px] border border-slate-800 shadow-inner">
                    {testLogs[0].payload}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTestLogModal(false)}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2 text-sm font-semibold text-white shadow transition-colors"
              >
                Close Logs View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global simulated loading indicator when executing test dispatches */}
      {testLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm text-white gap-3 animate-fade-in">
          <RefreshCcw className="animate-spin text-indigo-400" size={32} />
          <p className="text-sm font-semibold">Simulating HTTP POST event payload handshake...</p>
        </div>
      )}
    </div>
  );
}
