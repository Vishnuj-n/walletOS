'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { SuperadminOnly } from '../../../components/SuperadminOnly';
import { 
  searchWallets, 
  searchTransactions, 
  WalletSearchResponse, 
  TransactionSearchResponse 
} from '../../../services/adminService';

export default function GlobalSearchPage() {
  const { isSuperadmin } = useAuth();
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
        const searchParams: any = {};
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Global Search</h1>
          <p className="text-gray-600">Search wallets and transactions across all tenants</p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter wallet ID, external user ID, transaction ID, request ID, or idempotency key..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('wallets')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'wallets'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Wallets
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'transactions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Transactions
              </button>
            </nav>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-red-800">Error</h3>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        )}

        {/* Results */}
        <div>
          {activeTab === 'wallets' && walletResults && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Wallet Results ({walletResults.results.length})
              </h3>
              {walletResults.results.length === 0 ? (
                <p className="text-gray-500">No wallets found for "{walletResults.query}"</p>
              ) : (
                <div className="bg-white shadow overflow-hidden rounded-md">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {wallet.wallet_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {wallet.external_user_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>
                              <div className="font-medium">{wallet.tenant.name}</div>
                              <div className="text-gray-400">{wallet.tenant.tenant_id}</div>
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
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Transaction Results ({transactionResults.results.length})
              </h3>
              {transactionResults.results.length === 0 ? (
                <p className="text-gray-500">No transactions found</p>
              ) : (
                <div className="space-y-6">
                  {transactionResults.results.map((tx) => (
                    <div key={tx.transaction_id} className="bg-white shadow rounded-lg p-6">
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
    </SuperadminOnly>
  );
}
