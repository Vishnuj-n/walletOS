'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { PermissionGate } from '../../../components/PermissionGate';
import {
  fetchCurrentTenantApiKeys,
  rotateCurrentTenantKey,
} from '../../../services/adminService';
import type { TenantApiKeyMetadata, TenantApiKeySettingsResponse } from '@walletOS/types';

function scopeLabel(scope: TenantApiKeyMetadata['scope']): string {
  return scope === 'live' ? 'Live Key' : 'Test Key';
}

export default function SettingsPage() {
  const { adminUser, hasRole } = useAuth();
  const canManageApiKeys = hasRole('tenant_admin');
  const [settings, setSettings] = useState<TenantApiKeySettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [rotationLoading, setRotationLoading] = useState<'live' | 'test' | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ scope: 'live' | 'test'; value: string } | null>(null);

  const keysByScope = useMemo(() => {
    const lookup = new Map<'live' | 'test', TenantApiKeyMetadata>();
    for (const key of settings?.keys ?? []) {
      lookup.set(key.scope, key);
    }
    return lookup;
  }, [settings]);

  const loadSettings = useCallback(async () => {
    if (!canManageApiKeys) {
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
  }, [canManageApiKeys]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!revealedKey) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setRevealedKey(null);
    }, 30000);

    return () => window.clearTimeout(timeoutId);
  }, [revealedKey]);

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

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Account Settings</h1>
        <p className="text-xs text-slate-500">Current-tenant API key settings and rotation controls.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {rotationError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {rotationError}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Session Scope</h2>
            <p className="text-xs text-slate-500 mt-1">All tenant-scoped dashboard data resolves against this active tenant.</p>
          </div>
          <button
            onClick={loadSettings}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{settings?.tenant_name ?? 'Unknown tenant'}</p>
            <p className="text-xs font-mono text-slate-500">{settings?.tenant_id ?? adminUser?.tenantId}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{adminUser?.role}</p>
            <p className="text-xs text-slate-500">Rotation requires `tenant_admin` or higher.</p>
          </div>
        </div>
      </div>

      <PermissionGate minRole="tenant_admin">
        <div className="grid gap-4 lg:grid-cols-2">
          {(['live', 'test'] as const).map((scope) => {
            const key = keysByScope.get(scope);

            return (
              <div key={scope} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    <div className={`rounded-lg p-2 ${scope === 'live' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      <KeyRound size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">{scopeLabel(scope)}</h2>
                      <p className="text-xs text-slate-500">
                        {scope === 'live' ? 'Used for production API traffic.' : 'Used for sandbox API traffic.'}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${key?.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {key?.is_active ? 'Active' : 'Not issued'}
                  </span>
                </div>

                <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prefix</p>
                    <p className="mt-1 text-sm font-mono text-slate-900">{key?.prefix ?? 'Not available'}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {key ? new Date(key.created_at).toLocaleString() : 'Not available'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Used</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {key?.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never recorded'}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleRotate(scope)}
                  disabled={rotationLoading === scope}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <ShieldCheck size={14} />
                  {rotationLoading === scope ? 'Rotating...' : `Rotate ${scopeLabel(scope)}`}
                </button>
              </div>
            );
          })}
        </div>

        {revealedKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-amber-900">New {scopeLabel(revealedKey.scope)}</h2>
            <p className="mt-1 text-sm text-amber-800">This secret is shown once. Store it securely now.</p>
            <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
              <code className="break-all text-sm text-slate-900">{revealedKey.value}</code>
            </div>
          </div>
        )}
      </PermissionGate>

      {!hasRole('tenant_admin') && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Rotation actions are hidden for roles below `tenant_admin`.
        </div>
      )}
    </div>
  );
}
