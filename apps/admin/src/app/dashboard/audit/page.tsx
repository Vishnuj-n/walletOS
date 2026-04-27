'use client';

import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { supabase, API_BASE_URL } from '../../../lib/supabase';

interface AuditLog {
  id: string;
  tenant_id: string;
  wallet_id: string | null;
  action: string;
  actor: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [walletFilter, setWalletFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [debouncedWalletFilter, setDebouncedWalletFilter] = useState('');
  const [debouncedActionFilter, setDebouncedActionFilter] = useState('');
  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    fetchAuditLogs();
  }, [debouncedWalletFilter, debouncedActionFilter]);

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

  const fetchAuditLogs = async () => {
    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setError('');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams();
      if (debouncedWalletFilter) params.append('wallet_id', debouncedWalletFilter);
      if (debouncedActionFilter) params.append('action', debouncedActionFilter);

      const response = await fetch(
        `${API_BASE_URL}/admin/audit?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setLogs(data.data);
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

  if (loading) return <div className="text-gray-600">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Audit Log</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Filter by entity ID..."
            value={walletFilter}
            onChange={(e) => setWalletFilter(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Filter by action..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
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
          <tbody className="bg-white divide-y divide-gray-200">
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
                  <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-w-xs">
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
  );
}
