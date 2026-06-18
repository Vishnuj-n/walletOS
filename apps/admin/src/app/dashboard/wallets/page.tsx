'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  fetchWallets,
  createWallet,
  updateWallet,
  closeWallet,
  freezeWallet,
  unfreezeWallet,
} from '../../../services/walletService';
import type { Wallet, CreateWalletRequest } from '@walletos/types';
import { Plus, Search, Wallet as WalletIcon, Eye, Pencil, Snowflake, Unlock, X } from 'lucide-react';

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [closeReason, setCloseReason] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadWallets = async () => {
    setLoading(true);
    try {
      const data = await fetchWallets({
        search: debouncedSearch,
        status: statusFilter,
      });
      setWallets(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch wallets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallets();
  }, [debouncedSearch, statusFilter]);

  const handleFreeze = async (walletId: string) => {
    const reason = prompt('Enter reason for freezing this wallet:');
    if (!reason) return;

    try {
      await freezeWallet(walletId, reason);
      loadWallets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to freeze wallet');
    }
  };

  const handleUnfreeze = async (walletId: string) => {
    const reason = prompt('Enter reason for unfreezing this wallet:');
    if (!reason) return;

    try {
      await unfreezeWallet(walletId, reason);
      loadWallets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to unfreeze wallet');
    }
  };

  const handleCreateWallet = async (formData: CreateWalletRequest) => {
    try {
      await createWallet(formData);
      setShowCreateModal(false);
      loadWallets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create wallet');
    }
  };

  const handleEditWallet = async (formData: { label: string }) => {
    if (!selectedWallet) return;

    try {
      await updateWallet(selectedWallet.wallet_id, formData);
      setShowEditModal(false);
      setSelectedWallet(null);
      loadWallets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update wallet');
    }
  };

  const handleDeleteWallet = async () => {
    if (!selectedWallet) return;

    try {
      await closeWallet(selectedWallet.wallet_id, closeReason);
      setShowDeleteModal(false);
      setSelectedWallet(null);
      setDeleteConfirmation('');
      setCloseReason('');
      loadWallets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to close wallet');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Wallet Management</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4 flex-1">
            <div className="relative flex-1">
              {loading ? (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
              ) : (
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              )}
              <input
                type="text"
                placeholder="Search by user ID or label..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mr-4"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus size={16} /> Create Wallet
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Wallet ID
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                User ID
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Label
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Balance
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className={`bg-white divide-y divide-slate-100 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {loading && wallets.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-500 border-t-transparent"></div>
                    Loading wallets...
                  </div>
                </td>
              </tr>
            ) : wallets.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm text-slate-500">
                  No wallets found
                </td>
              </tr>
            ) : (
              wallets.map((wallet) => (
                <tr key={wallet.wallet_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                    <div className="flex flex-col">
                      <Link
                        href={`/dashboard/wallets/${wallet.wallet_id}`}
                        className="text-blue-600 hover:text-blue-700 font-mono text-[11px] font-semibold"
                      >
                        {wallet.public_id || wallet.wallet_id}
                      </Link>
                      {wallet.public_id && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {wallet.wallet_id.substring(0, 8)}...
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {wallet.external_user_id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {wallet.label || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                    {wallet.currency} {wallet.balance}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      wallet.status === 'active' ? 'bg-green-100 text-green-800' :
                      wallet.status === 'frozen' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {wallet.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/dashboard/wallets/${wallet.wallet_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                        title="View Details"
                      >
                        <Eye size={14} />
                        <span>View</span>
                      </Link>
                      <button
                        onClick={() => {
                          setSelectedWallet(wallet);
                          setShowEditModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                        title="Edit Wallet"
                      >
                        <Pencil size={14} />
                        <span>Edit</span>
                      </button>
                      {wallet.status === 'active' && (
                        <button
                          onClick={() => handleFreeze(wallet.wallet_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                          title="Freeze Wallet"
                        >
                          <Snowflake size={14} />
                          <span>Freeze</span>
                        </button>
                      )}
                      {wallet.status === 'frozen' && (
                        <button
                          onClick={() => handleUnfreeze(wallet.wallet_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                          title="Unfreeze Wallet"
                        >
                          <Unlock size={14} />
                          <span>Unfreeze</span>
                        </button>
                      )}
                      {(wallet.status === 'active' || wallet.status === 'frozen') && wallet.balance === '0.0000' && (
                        <button
                          onClick={() => {
                            setSelectedWallet(wallet);
                            setShowDeleteModal(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                          title="Close Wallet"
                        >
                          <X size={14} />
                          <span>Close</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border border-slate-200 w-96 shadow-xl rounded-xl bg-white">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 inline-flex items-center gap-2"><WalletIcon size={16} /> Create New Wallet</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleCreateWallet({
                  external_user_id: formData.get('external_user_id') as string,
                  currency: formData.get('currency') as string,
                  label: formData.get('label') as string,
                });
              }}
            >
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  External User ID *
                </label>
                <input
                  type="text"
                  name="external_user_id"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency *
                </label>
                <select
                  name="currency"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Currency</option>
                  <option value="USD">USD</option>
                  <option value="INR">INR</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Label *
                </label>
                <input
                  type="text"
                  name="label"
                  required
                  aria-required="true"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Wallet Modal */}
      {showEditModal && selectedWallet && (
        <div className="fixed inset-0 bg-slate-900/40 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border border-slate-200 w-96 shadow-xl rounded-xl bg-white">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Edit Wallet</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleEditWallet({
                  label: formData.get('label') as string,
                });
              }}
            >
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Wallet ID
                </label>
                <input
                  type="text"
                  value={selectedWallet.wallet_id}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-sm"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Label
                </label>
                <input
                  type="text"
                  name="label"
                  defaultValue={selectedWallet.label || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedWallet(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Wallet Modal */}
      {showDeleteModal && selectedWallet && (
        <div className="fixed inset-0 bg-slate-900/40 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border border-slate-200 w-96 shadow-xl rounded-xl bg-white">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Close Wallet</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Are you sure you want to close this wallet? This action cannot be undone.
              </p>
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm"><strong>Wallet ID:</strong> {selectedWallet.wallet_id}</p>
                <p className="text-sm"><strong>User ID:</strong> {selectedWallet.external_user_id}</p>
                <p className="text-sm"><strong>Balance:</strong> {selectedWallet.currency} {selectedWallet.balance}</p>
              </div>
            </div>
            <form>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for closing *
                </label>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter reason for closing this wallet..."
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type wallet ID to confirm *
                </label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Enter: ${selectedWallet.wallet_id}`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This action cannot be undone. Please type the wallet ID exactly as shown above.
                </p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedWallet(null);
                    setDeleteConfirmation('');
                    setCloseReason('');
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (deleteConfirmation === selectedWallet.wallet_id && closeReason.trim()) {
                      handleDeleteWallet();
                    }
                  }}
                  disabled={deleteConfirmation !== selectedWallet.wallet_id || !closeReason.trim()}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    deleteConfirmation === selectedWallet.wallet_id && closeReason.trim()
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Close Wallet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
