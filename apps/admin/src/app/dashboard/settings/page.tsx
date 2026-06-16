'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCcw, ShieldCheck, Webhook, Plus, Trash2, CheckCircle2, Activity, Play, AlertTriangle, Code, Key } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { PermissionGate } from '../../../components/PermissionGate';
import {
  fetchCurrentTenantApiKeys,
  createCurrentTenantApiKey,
  revokeCurrentTenantApiKey,
  fetchWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
} from '../../../services/adminService';
import type { TenantApiKeySettingsResponse } from '@walletos/types';

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  is_active: boolean;
  status?: string;
  failure_count?: number;
  delivery_count?: number;
  created_at: string;
}



interface WebhookDeliveryLog {
  id: string;
  event: string;
  status: string;
  latency_ms: string | number;
  payload: string;
  timestamp: string;
}



export default function SettingsPage() {
  const { adminUser, hasRole } = useAuth();
  const canManageSettings = hasRole('tenant_admin');
  
  const [activeTab, setActiveTab] = useState<'api-keys' | 'webhooks'>('api-keys');
  const [settings, setSettings] = useState<TenantApiKeySettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);

  const [revealedKey, setRevealedKey] = useState<{ scope: 'live' | 'test'; value: string } | null>(null);


  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnv, setNewKeyEnv] = useState<'live' | 'test'>('test');
  const [newKeyScope, setNewKeyScope] = useState<'read_only' | 'read_write' | 'admin'>('admin');
  const [generatedRawKey, setGeneratedRawKey] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerateLoading(true);
    setRotationError(null);
    try {
      const response = await createCurrentTenantApiKey({
        name: newKeyName,
        isSandbox: newKeyEnv === 'test',
        keyScope: newKeyScope,
      });
      setGeneratedRawKey(response.api_key);
      setGenerateModalOpen(false);
      await loadSettings();
    } catch (err) {
      setRotationError(err instanceof Error ? err.message : 'Failed to generate API key');
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Any applications using it will lose access immediately.')) {
      return;
    }
    setRevokingKeyId(keyId);
    setRotationError(null);
    try {
      await revokeCurrentTenantApiKey(keyId);
      if (settings) {
        setSettings({
          ...settings,
          keys: settings.keys.filter(k => k.key_id !== keyId)
        });
      }
    } catch (err) {
      setRotationError(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setRevokingKeyId(null);
    }
  };

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

    const intervalId = window.setInterval(() => {
      loadSettings();
    }, 300000);

    return () => window.clearInterval(intervalId);
  }, [loadSettings]);

  const tenantId = adminUser?.tenantId;

  // Load webhooks from backend API
  const loadWebhooks = useCallback(async () => {
    if (!canManageSettings) return;
    try {
      const data = await fetchWebhooks();
      setWebhooks(data as WebhookEndpoint[]);
    } catch (err) {
      // Non-fatal: just log; settings still works without webhooks
      console.warn('Failed to load webhooks:', err);
    }
  }, [canManageSettings]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);



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

  // Register Webhook Endpoint (via backend)
  const handleRegisterWebhook = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setWebhookError(null);
    setWebhookSuccess(null);

    const urlTrimmed = newWebhookUrl.trim();
    if (!urlTrimmed) {
      setWebhookError('Endpoint URL is required');
      return;
    }

    try {
      const parsedUrl = new URL(urlTrimmed);
      const isLocalhostEndpoint = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
      if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && isLocalhostEndpoint)) {
        setWebhookError('Endpoint URL must use the HTTPS scheme');
        return;
      }
    } catch {
      setWebhookError('Endpoint URL must be a valid fully-qualified absolute URL (e.g. https://domain.com/webhook)');
      return;
    }

    if (selectedEvents.length === 0) {
      setWebhookError('Please subscribe to at least one webhook event');
      return;
    }

    try {
      const response = await createWebhook({ url: urlTrimmed, events: selectedEvents });
      const newEndpoint: WebhookEndpoint = {
        id: response.id,
        url: response.url,
        events: response.events,
        secret: response.secret,
        is_active: response.is_active,
        created_at: response.created_at,
      };
      setWebhooks((prev) => [newEndpoint, ...prev]);
      setRevealedWebhookSecret(newEndpoint);
      setNewWebhookUrl('');
      setSelectedEvents(['wallet.credited', 'wallet.debited']);
      setWebhookModalOpen(false);
      setWebhookSuccess('Webhook endpoint registered successfully.');
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : 'Failed to register webhook');
    }
  };

  // Delete Webhook Endpoint (via backend)
  const handleDeleteWebhook = async (id: string) => {
    try {
      await deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      setWebhookSuccess('Webhook endpoint deactivated and removed.');
      setTimeout(() => setWebhookSuccess(null), 4000);
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  // Real Webhook Test Action (fires backend delivery)
  const handleTestWebhook = async (endpoint: WebhookEndpoint) => {
    setTestingEndpoint(endpoint);
    setTestLoading(true);

    try {
      const result = await testWebhook(endpoint.id);

      const newLog: WebhookDeliveryLog = {
        id: result.delivery_id,
        event: 'webhook.test',
        status: 'Queued',
        latency_ms: 'N/A',
        payload: JSON.stringify({
          event: 'webhook.test',
          tenant_id: tenantId,
          timestamp: new Date().toISOString(),
          data: { message: 'This is a test webhook delivery from WalletOS' },
          delivery_id: result.delivery_id,
        }, null, 2),
        timestamp: new Date().toISOString(),
      };

      setTestLogs((prev) => [newLog, ...prev]);
      setShowTestLogModal(true);
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : 'Test delivery failed');
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 space-y-6 animate-pulse">
        <div>
          <div className="h-7 w-56 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-[28rem] max-w-full rounded bg-slate-200" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-slate-200" />
              <div className="h-3 w-72 max-w-full rounded bg-slate-200" />
            </div>
            <div className="h-10 w-36 rounded-lg bg-slate-200" />
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="h-40 rounded-2xl bg-slate-100" />
            <div className="h-40 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
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
            <RefreshCcw size={14} className={`${loading ? 'animate-spin' : ''}`} />
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
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/20">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Developer API Keys</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Manage credentials to integrate with WalletOS ledger APIs.</p>
                </div>
                <button
                  onClick={() => {
                    setNewKeyName('');
                    setNewKeyEnv('test');
                    setNewKeyScope('admin');
                    setGenerateModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow transition-colors"
                >
                  <Plus size={16} />
                  Generate New API Key
                </button>
              </div>

              {/* API Keys Table */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50/60 font-semibold text-slate-600">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Name / Prefix</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Environment</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Scope</th>
                        <th className="px-6 py-4 text-left text-xs uppercase tracking-wider">Created Date</th>
                        <th className="px-6 py-4 text-right text-xs uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {!settings?.keys || settings.keys.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <KeyRound className="text-slate-300" size={32} />
                              <span className="font-semibold text-slate-600">No API Keys Generated</span>
                              <span className="text-xs text-slate-400">Click the button above to create your first API credential.</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        settings.keys.map((key) => (
                          <tr key={key.key_id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900">{key.name ?? 'API Key'}</div>
                              <div className="text-xs font-mono text-slate-500 mt-0.5">{key.prefix}...</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                key.scope === 'live'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-100'
                              }`}>
                                {key.scope === 'live' ? 'Live' : 'Test'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-700 font-medium capitalize">
                              {key.keyScope ? key.keyScope.replace('_', ' ') : 'admin'}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {new Date(key.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleRevokeKey(key.key_id)}
                                disabled={revokingKeyId !== null}
                                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors bg-rose-50 hover:bg-rose-100/80 rounded px-2.5 py-1 disabled:opacity-50"
                              >
                                Revoke
                              </button>
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
                              {(() => {
                                const isActive = webhook.is_active;
                                const failureCount = webhook.failure_count ?? 0;
                                const deliveryCount = webhook.delivery_count ?? 0;
                                const status = webhook.status ?? 'active';

                                if (!isActive) {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                      Disabled
                                    </span>
                                  );
                                }

                                if (failureCount > 0 || status === 'unhealthy' || status === 'failed') {
                                  return (
                                    <span 
                                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100"
                                      title={`Deliveries: ${deliveryCount}, Failures: ${failureCount}`}
                                    >
                                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                                      Unhealthy ({failureCount})
                                    </span>
                                  );
                                }

                                return (
                                  <span 
                                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    title={`Deliveries: ${deliveryCount}`}
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Active
                                  </span>
                                );
                              })()}
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
        {revealedWebhookSecret?.secret && (
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
        {generatedRawKey && (
          <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-lg rounded-2xl border border-indigo-200 bg-indigo-50 p-6 shadow-2xl space-y-4 transform scale-100 transition-all border-l-4 border-l-indigo-600">
              <div className="flex items-start gap-3">
                <Key className="text-indigo-600 mt-0.5 flex-shrink-0" size={20} />
                <div>
                  <h4 className="text-base font-bold text-indigo-900">New API Key Generated</h4>
                  <p className="text-xs text-indigo-850 mt-1 leading-relaxed">
                    Please copy your new API key now. For security reasons, it cannot be shown again.
                  </p>
                </div>
              </div>
              
              <div className="rounded-xl border border-indigo-200 bg-white p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shadow-inner">
                <code className="break-all font-mono text-sm text-indigo-800 font-bold select-all leading-normal">{generatedRawKey}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedRawKey);
                  }}
                  className="text-xs font-bold text-indigo-900 bg-indigo-100 hover:bg-indigo-200 px-3 py-2 rounded transition-colors self-end sm:self-auto flex-shrink-0"
                >
                  Copy Key
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setGeneratedRawKey(null)}
                  className="w-full sm:w-auto text-center text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-2.5 rounded-lg transition-colors shadow"
                >
                  I have saved this key
                </button>
              </div>
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

      {/* Generate API Key Modal */}
      {generateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 transform scale-100 transition-all">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Generate New API Key</h3>
                <p className="mt-1 text-xs text-slate-500">Create a new API key to authenticate requests.</p>
              </div>
              <button
                type="button"
                onClick={() => setGenerateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-lg p-1"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleGenerateKey} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
                  placeholder="e.g. Zomato Production"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Environment</label>
                <select
                  value={newKeyEnv}
                  onChange={(e) => setNewKeyEnv(e.target.value as 'live' | 'test')}
                  className="w-full rounded-lg border border-slate-200 py-2.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 bg-white"
                >
                  <option value="test">Test (Sandbox)</option>
                  <option value="live">Live (Production)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Permissions Scope</label>
                <select
                  value={newKeyScope}
                  onChange={(e) => setNewKeyScope(e.target.value as 'read_only' | 'read_write' | 'admin')}
                  className="w-full rounded-lg border border-slate-200 py-2.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 bg-white"
                >
                  <option value="read_only">Read-Only (read_only)</option>
                  <option value="read_write">Read-Write (read_write)</option>
                  <option value="admin">Administrative (admin)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setGenerateModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generateLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow transition-colors disabled:opacity-50"
                >
                  {generateLoading ? 'Generating...' : 'Generate Key'}
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
                    <span className={`inline-flex items-center gap-1 font-bold mt-1 ${testLogs[0].status === 'Queued' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${testLogs[0].status === 'Queued' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                      {testLogs[0].status}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-400 block text-[9px] uppercase tracking-wider">Network Latency</span>
                    <span className="font-bold text-slate-800 block mt-1">
                      {typeof testLogs[0].latency_ms === 'number' ? `${testLogs[0].latency_ms}ms` : testLogs[0].latency_ms}
                    </span>
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
