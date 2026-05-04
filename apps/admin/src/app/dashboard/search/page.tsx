'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { searchWallets, searchTransactions } from '../../../services/adminService';
import type { TransactionSearchQuery, TransactionSearchResponse, WalletSearchResponse } from '@walletOS/types';
import { Search, Wallet, ArrowLeftRight, Building2 } from 'lucide-react';
import { PermissionGate } from '../../../components/PermissionGate';

export default function GlobalSearchPage() {
  const { hasRole } = useAuth();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'wallets' | 'transactions'>('wallets');
  const [walletResults, setWalletResults] = useState<WalletSearchResponse | null>(null);
  const [transactionResults, setTransactionResults] = useState<TransactionSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'wallets') {
        const results = await searchWallets(query);
        setWalletResults(results);
        setTransactionResults(null);
      } else {
        // For transactions, determine if it's a transaction ID, request ID, or idempotency key
        const searchParams: TransactionSearchQuery = {};
        if (query.startsWith('tx_')) {
          searchParams.transactionId = query;
        } else if (query.startsWith('req_')) {
          searchParams.requestId = query;
        } else {
          searchParams.idempotencyKey = query;
        }
        
        const results = await searchTransactions(searchParams);
        setTransactionResults(results);
        setWalletResults(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (!hasRole('support')) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-yellow-800">Access Denied</h3>
          <p className="text-yellow-700 mt-2">This feature is only available to admins with search permission.</p>
        </div>
      </div>
    );
  }

  return (
    <PermissionGate minRole="support">
      <div className="p-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Global Search</h1>
          <p className="text-xs text-slate-500">Search wallets and transactions across all tenants</p>
        </div>

        {/* Search Bar */}
        <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Enter wallet ID, external user ID, transaction ID, request ID, or idempotency key..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4">
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('wallets')}
                className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-2 ${
                  activeTab === 'wallets'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Wallet size={16} /> Wallets
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`py-2 px-1 border-b-2 font-medium text-sm inline-flex items-center gap-2 ${
                  activeTab === 'transactions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <ArrowLeftRight size={16} /> Transactions
              </button>
            </nav>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-800">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        )}

        {/* Results */}
        <div>
          {activeTab === 'wallets' && walletResults && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Wallet Results ({walletResults.results.length})
              </h3>
              {walletResults.results.length === 0 ? (
                <p className="text-gray-500">No wallets found for "{walletResults.query}"</p>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Wallet ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          External User ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tenant
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Balance
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Environment
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {walletResults.results.map((wallet) => (
                        <tr key={wallet.wallet_id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 font-mono text-[11px]">
                            {wallet.wallet_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {wallet.external_user_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            <div>
                              <div className="font-medium inline-flex items-center gap-1"><Building2 size={14} className="text-slate-400" />{wallet.tenant.name}</div>
                              <div className="text-slate-400 text-[11px] font-mono">{wallet.tenant.tenant_id}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {wallet.balance} {wallet.currency}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              wallet.status === 'active' 
                                ? 'bg-green-100 text-green-800'
                                : wallet.status === 'frozen'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {wallet.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              wallet.is_sandbox 
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {wallet.is_sandbox ? 'Sandbox' : 'Live'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'transactions' && transactionResults && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Transaction Results ({transactionResults.results.length})
              </h3>
              {transactionResults.results.length === 0 ? (
                <p className="text-gray-500">No transactions found</p>
              ) : (
                <div className="space-y-6">
                  {transactionResults.results.map((tx) => (
                    <div key={tx.transaction_id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Transaction ID</h4>
                          <p className="text-sm text-gray-900">{tx.transaction_id}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Type</h4>
                          <p className="text-sm text-gray-900 capitalize">{tx.type}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Amount</h4>
                          <p className="text-sm text-gray-900">{tx.amount} {tx.currency}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Created</h4>
                          <p className="text-sm text-gray-900">
                            {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Balance Before</h4>
                          <p className="text-sm text-gray-900">{tx.balance_before}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Balance After</h4>
                          <p className="text-sm text-gray-900">{tx.balance_after}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Wallet</h4>
                          <p className="text-sm text-gray-900">{tx.wallet.wallet_id}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500">Tenant</h4>
                          <p className="text-sm text-gray-900">{tx.wallet.tenant.name}</p>
                        </div>
                      </div>
                      
                      {tx.reference_id && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-500">Reference ID</h4>
                          <p className="text-sm text-gray-900">{tx.reference_id}</p>
                        </div>
                      )}
                      
                      {tx.idempotency_key && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-500">Idempotency Key</h4>
                          <p className="text-sm text-gray-900">{tx.idempotency_key}</p>
                        </div>
                      )}

                      {tx.audit_trail.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-500 mb-2">Audit Trail</h4>
                          <div className="bg-gray-50 rounded-md p-3">
                            {tx.audit_trail.map((log) => (
                              <div key={log.id} className="mb-2 last:mb-0">
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium text-gray-900">{log.action}</span>
                                  <span className="text-xs text-gray-500">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600">Actor: {log.actor}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PermissionGate>
  );
}
