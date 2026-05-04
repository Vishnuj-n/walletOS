'use client';

import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { SuperadminOnly } from '../../../components/SuperadminOnly';
import {
  fetchAuditLogs,
  fetchAdminActivity,
  fetchSystemErrors,
} from '../../../services/adminService';
import type { AdminActivityLog, AuditLog, SystemError } from '@walletOS/types';
import { Activity, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function AuditLogPage() {
  const { isSuperadmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'tenant' | 'admin' | 'errors'>('tenant');
  
  // Tenant audit logs state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [walletFilter, setWalletFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [debouncedWalletFilter, setDebouncedWalletFilter] = useState('');
  const [debouncedActionFilter, setDebouncedActionFilter] = useState('');
  const abortControllerRef = React.useRef<AbortController | null>(null);

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
  }, [activeTab, debouncedWalletFilter, debouncedActionFilter]);

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
      const data = await fetchAuditLogs({
        wallet_id: debouncedWalletFilter || undefined,
        action: debouncedActionFilter || undefined,
        signal: controller.signal,
      });
      setLogs(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Ignore aborted requests
        return;
      }
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
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
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to fetch admin activity');
    } finally {
      setAdminLoading(false);
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
    }
  };

  if (loading && activeTab === 'tenant') return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading...</div>;

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
              <input
                type="text"
                placeholder="Filter by entity ID..."
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Filter by action..."
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
            {logs.length === 0 && (
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
                <input
                  type="text"
                  placeholder="Filter by admin email..."
                  value={adminEmailFilter}
                  onChange={(e) => setAdminEmailFilter(e.target.value)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Filter by action type..."
                  value={adminActionFilter}
                  onChange={(e) => setAdminActionFilter(e.target.value)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {adminLoading ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Loading admin activity...</p>
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
                {adminLogs.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No admin activity found
                  </div>
                )}
              </div>
            )}
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
