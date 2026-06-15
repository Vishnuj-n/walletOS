'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import React from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { SuperadminOnly } from '../../../components/SuperadminOnly';
import {
  fetchAuditLogs,
  fetchAdminActivity,
  fetchSystemErrors,
} from '../../../services/adminService';
import type { AdminActivityLog, AuditLog, SystemError } from '@walletos/types';
import { Activity, AlertTriangle, ShieldCheck } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  'wallet.created': 'Wallet Created',
  'wallet.updated': 'Wallet Updated',
  'wallet.closed': 'Wallet Closed',
  'wallet.frozen': 'Wallet Frozen',
  'wallet.unfrozen': 'Wallet Unfrozen',
  'admin.credit': 'Manual Credit',
  'admin.debit': 'Manual Debit',
  'admin.reverse': 'Manual Reversal',
  'admin_user.invited': 'Member Invited',
  'tenant.key_rotated': 'API Key Rotated',
  'tenant.key_revoked': 'API Key Revoked',
  'credit': 'Credit (Legacy)',
  'debit': 'Debit (Legacy)',
  'freeze': 'Freeze (Legacy)',
  'unfreeze': 'Unfreeze (Legacy)',
  'tenant.created': 'Tenant Created',
};

interface SearchDropdownProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  ariaLabel?: string;
  clearLabel?: string;
}

function SearchDropdown({
  placeholder,
  value,
  onChange,
  options,
  ariaLabel,
  clearLabel = 'All Options',
}: SearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) => {
    if (!value) return true;
    const label = ACTION_LABELS[opt] || opt;
    return (
      label.toLowerCase().includes(value.toLowerCase()) ||
      opt.toLowerCase().includes(value.toLowerCase())
    );
  });

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className="w-full px-4 py-2 border border-slate-300 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 cursor-pointer transition-shadow hover:border-slate-400"
        />
        <div 
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <svg className={`h-4 w-4 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {isOpen && (filteredOptions.length > 0 || value !== '') && (
        <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-sm animate-in fade-in slide-in-from-top-1 duration-100">
          <li
            className="cursor-pointer select-none px-4 py-2 hover:bg-slate-100 text-slate-500 font-medium"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
          >
            {clearLabel}
          </li>
          {filteredOptions.map((opt) => (
            <li
              key={opt}
              className="cursor-pointer select-none px-4 py-2 hover:bg-blue-50 hover:text-blue-600 text-slate-700 transition-colors"
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {ACTION_LABELS[opt] || opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading...</div>}>
      <AuditLogPageContent />
    </Suspense>
  );
}

function AuditLogPageContent() {
  const { isSuperadmin } = useAuth();
  const searchParams = useSearchParams();
  const entityIdParam = searchParams ? (searchParams.get('entityId') ?? '') : '';
  const [activeTab, setActiveTab] = useState<'tenant' | 'admin' | 'errors'>('tenant');
  
  // Tenant audit logs state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [walletFilter, setWalletFilter] = useState(entityIdParam);
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');

  // Dropdown filter unique option lists
  const [uniqueEntities, setUniqueEntities] = useState<string[]>(entityIdParam ? [entityIdParam] : []);
  const [uniqueActors, setUniqueActors] = useState<string[]>([]);
  const [uniqueActions, setUniqueActions] = useState<string[]>([
    'wallet.created',
    'wallet.updated',
    'wallet.closed',
    'wallet.frozen',
    'wallet.unfrozen',
    'admin.credit',
    'admin.debit',
    'admin.reverse',
    'admin_user.invited',
    'tenant.key_rotated',
    'tenant.key_revoked'
  ]);

  const [uniqueAdminEmails, setUniqueAdminEmails] = useState<string[]>([]);
  const [uniqueAdminActions, setUniqueAdminActions] = useState<string[]>([
    'tenant.created',
    'tenant.key_rotated',
    'tenant.key_revoked',
    'wallet.created',
    'wallet.updated',
    'wallet.closed',
    'wallet.frozen',
    'wallet.unfrozen',
    'admin.credit',
    'admin.debit',
    'admin_user.invited'
  ]);

  useEffect(() => {
    setWalletFilter(entityIdParam);
    if (entityIdParam) {
      setUniqueEntities(prev => Array.from(new Set([...prev, entityIdParam])));
    }
  }, [entityIdParam]);

  const [debouncedWalletFilter, setDebouncedWalletFilter] = useState('');
  const [debouncedActionFilter, setDebouncedActionFilter] = useState('');
  const [debouncedActorFilter, setDebouncedActorFilter] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Admin activity state
  const [adminLogs, setAdminLogs] = useState<AdminActivityLog[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminEmailFilter, setAdminEmailFilter] = useState('');
  const [adminActionFilter, setAdminActionFilter] = useState('');
  const [debouncedAdminEmail, setDebouncedAdminEmail] = useState('');
  const [debouncedAdminAction, setDebouncedAdminAction] = useState('');
  
  // System errors state
  const [systemErrors, setSystemErrors] = useState<SystemError[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorsError, setErrorsError] = useState('');

  // Tenant audit logs effects
  useEffect(() => {
    if (activeTab === 'tenant') {
      fetchAuditLogData();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [activeTab, debouncedWalletFilter, debouncedActionFilter, debouncedActorFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedWalletFilter(walletFilter);
    }, 300);
    return () => clearTimeout(handler);
  }, [walletFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedActionFilter(actionFilter);
    }, 300);
    return () => clearTimeout(handler);
  }, [actionFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedActorFilter(actorFilter);
    }, 300);
    return () => clearTimeout(handler);
  }, [actorFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedAdminEmail(adminEmailFilter);
    }, 300);
    return () => clearTimeout(handler);
  }, [adminEmailFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedAdminAction(adminActionFilter);
    }, 300);
    return () => clearTimeout(handler);
  }, [adminActionFilter]);

  // Admin activity effect
  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminActivityData();
    }
  }, [activeTab, debouncedAdminEmail, debouncedAdminAction]);

  // System errors effect
  useEffect(() => {
    if (activeTab === 'errors') {
      fetchSystemErrorsData();
    }
  }, [activeTab]);

  const fetchAuditLogData = async () => {
    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError('');
    setLoading(true);

    try {
      const cleanActorFilter = debouncedActorFilter.includes(':')
        ? debouncedActorFilter.split(':').slice(1).join(':')
        : debouncedActorFilter;

      const data = await fetchAuditLogs({
        wallet_id: debouncedWalletFilter || undefined,
        action: debouncedActionFilter || undefined,
        actor: cleanActorFilter || undefined,
        signal: controller.signal,
      });
      setLogs(data);

      // Gather unique entities, actors, and actions from fetched logs
      const fetchedEntities = data
        .map(l => l.wallet_id)
        .filter((id): id is string => typeof id === 'string' && id !== '');
      const fetchedActors = data
        .map(l => l.actor)
        .filter((a): a is string => typeof a === 'string' && a !== '');
      const fetchedActions = data
        .map(l => l.action)
        .filter((a): a is string => typeof a === 'string' && a !== '');

      setUniqueEntities(prev => Array.from(new Set([...prev, ...fetchedEntities])));
      setUniqueActors(prev => Array.from(new Set([...prev, ...fetchedActors])));
      setUniqueActions(prev => Array.from(new Set([...prev, ...fetchedActions])));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Ignore aborted requests
        return;
      }
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  const fetchAdminActivityData = async () => {
    setAdminError('');
    setAdminLoading(true);

    try {
      const data = await fetchAdminActivity({
        adminEmail: debouncedAdminEmail || undefined,
        actionType: debouncedAdminAction || undefined,
        limit: 50,
      });
      setAdminLogs(data.data);

      // Gather unique admin emails and actions from fetched admin logs
      const fetchedAdminEmails = data.data
        .map(l => l.actor)
        .filter((a): a is string => typeof a === 'string' && a !== '');
      const fetchedAdminActions = data.data
        .map(l => l.action)
        .filter((a): a is string => typeof a === 'string' && a !== '');

      setUniqueAdminEmails(prev => Array.from(new Set([...prev, ...fetchedAdminEmails])));
      setUniqueAdminActions(prev => Array.from(new Set([...prev, ...fetchedAdminActions])));
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to fetch admin activity');
    } finally {
      setAdminLoading(false);
      setInitialLoading(false);
    }
  };

  const fetchSystemErrorsData = async () => {
    setErrorsError('');
    setErrorsLoading(true);

    try {
      const data = await fetchSystemErrors(50);
      setSystemErrors(data.data);
    } catch (err) {
      setErrorsError(err instanceof Error ? err.message : 'Failed to fetch system errors');
    } finally {
      setErrorsLoading(false);
      setInitialLoading(false);
    }
  };

  // Security: Reset to tenant tab if non-superadmin somehow has admin/errors tab active
  useEffect(() => {
    if (!isSuperadmin && (activeTab === 'admin' || activeTab === 'errors')) {
      setActiveTab('tenant');
    }
  }, [isSuperadmin, activeTab]);

  if (initialLoading) return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Audit Logs</h1>
        <p className="text-xs text-slate-500">Monitor system activity and errors</p>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('tenant')}
              className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-2 ${
                activeTab === 'tenant'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity size={16} /> Tenant Activity
            </button>
            <SuperadminOnly>
              <button
                onClick={() => setActiveTab('admin')}
                className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-2 ${
                  activeTab === 'admin'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <ShieldCheck size={16} /> Admin Activity
              </button>
              <button
                onClick={() => setActiveTab('errors')}
                className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-2 ${
                  activeTab === 'errors'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <AlertTriangle size={16} /> System Errors
              </button>
            </SuperadminOnly>
          </nav>
        </div>
      </div>

      {/* Tenant Activity Tab */}
      {activeTab === 'tenant' && (
        <div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 mb-4">
            <div className="flex gap-4">
              <SearchDropdown
                placeholder="Filter by entity ID..."
                ariaLabel="Filter by entity ID..."
                value={walletFilter}
                onChange={setWalletFilter}
                options={uniqueEntities}
                clearLabel="All Entity IDs"
              />
              <SearchDropdown
                placeholder="Filter by actor email..."
                ariaLabel="Filter by actor email..."
                value={actorFilter}
                onChange={setActorFilter}
                options={uniqueActors}
                clearLabel="All Actors"
              />
              <SearchDropdown
                placeholder="Filter by action..."
                ariaLabel="Filter by action..."
                value={actionFilter}
                onChange={setActionFilter}
                options={uniqueActions}
                clearLabel="All Actions"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entity ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Changes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        log.action.includes('freeze') ? 'bg-red-100 text-red-800' :
                        log.action.includes('unfreeze') ? 'bg-green-100 text-green-800' :
                        log.action.includes('credit') ? 'bg-blue-100 text-blue-800' :
                        log.action.includes('debit') ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.actor}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">
                      {typeof log.wallet_id === 'string' ? log.wallet_id.substring(0, 8) + '...' : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-w-xs">
                        {JSON.stringify(log.changes, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && logs.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No audit logs found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Activity Tab */}
      {activeTab === 'admin' && (
        <SuperadminOnly>
          <div>
            {adminError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {adminError}
              </div>
            )}

            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 mb-4">
              <div className="flex gap-4">
                <SearchDropdown
                  placeholder="Filter by admin email..."
                  ariaLabel="Filter by admin email..."
                  value={adminEmailFilter}
                  onChange={setAdminEmailFilter}
                  options={uniqueAdminEmails}
                  clearLabel="All Admins"
                />
                <SearchDropdown
                  placeholder="Filter by admin action..."
                  ariaLabel="Filter by admin action..."
                  value={adminActionFilter}
                  onChange={setAdminActionFilter}
                  options={uniqueAdminActions}
                  clearLabel="All Actions"
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden relative">
              {adminLoading && adminLogs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">Loading admin activity...</p>
                </div>
              ) : (
                <>
                  {adminLoading && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                  )}
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Timestamp
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tenant
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actor
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Entity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Environment
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {adminLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>
                              <div className="font-medium">{log.tenant.name}</div>
                              <div className="text-gray-400">{log.tenant.tenant_id}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              log.action.includes('created') ? 'bg-green-100 text-green-800' :
                              log.action.includes('deleted') ? 'bg-red-100 text-red-800' :
                              log.action.includes('rotated') ? 'bg-blue-100 text-blue-800' :
                              log.action.includes('revoked') ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {log.actor}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>
                              <div className="font-medium">{log.entity_type}</div>
                              <div className="text-gray-400">{log.entity_id}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              log.is_sandbox 
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {log.is_sandbox ? 'Sandbox' : 'Live'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!adminLoading && adminLogs.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No admin activity found
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </SuperadminOnly>
      )}

      {/* System Errors Tab */}
      {activeTab === 'errors' && (
        <SuperadminOnly>
          <div>
            {errorsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {errorsError}
              </div>
            )}

            {errorsLoading ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Loading system errors...</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tenant
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Error Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Message
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Endpoint
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Environment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {systemErrors.map((error) => (
                      <tr key={error.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(error.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <div className="font-medium">{error.tenant.name}</div>
                            <div className="text-gray-400">{error.tenant.tenant_id}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            {error.error_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                          <div className="truncate" title={error.message}>
                            {error.message}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {error.endpoint}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            error.is_sandbox 
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {error.is_sandbox ? 'Sandbox' : 'Live'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {systemErrors.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No system errors found
                  </div>
                )}
              </div>
            )}
          </div>
        </SuperadminOnly>
      )}
    </div>
  );
}
