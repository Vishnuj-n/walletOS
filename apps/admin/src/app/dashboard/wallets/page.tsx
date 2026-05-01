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
  type Wallet,
  type CreateWalletRequest,
} from '../../../services/walletService';

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

  const handleDeleteWallet = async (reason: string) => {
    if (!selectedWallet) return;

    try {
      await closeWallet(selectedWallet.wallet_id, reason);
      setShowDeleteModal(false);
      setSelectedWallet(null);
      loadWallets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to close wallet');
    }
  };

  if (loading) return <div className="text-gray-600">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Wallet Management</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-4 flex-1">
            <input
              type="text"
              placeholder="Search by user ID or label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Create Wallet
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Wallet ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Label
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Balance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {wallets.map((wallet) => (
              <tr key={wallet.wallet_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <Link
                    href={`/dashboard/wallets/${wallet.wallet_id}`}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    {wallet.wallet_id.substring(0, 8)}...
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {wallet.external_user_id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {wallet.label || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {wallet.currency} {wallet.balance}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    wallet.status === 'active' ? 'bg-green-100 text-green-800' :
                    wallet.status === 'frozen' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {wallet.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <Link
                    href={`/dashboard/wallets/${wallet.wallet_id}`}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => {
                      setSelectedWallet(wallet);
                      setShowEditModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </button>
                  {wallet.status === 'active' && (
                    <button
                      onClick={() => handleFreeze(wallet.wallet_id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Freeze
                    </button>
                  )}
                  {wallet.status === 'frozen' && (
                    <button
                      onClick={() => handleUnfreeze(wallet.wallet_id)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Unfreeze
                    </button>
                  )}
                  {(wallet.status === 'active' || wallet.status === 'frozen') && wallet.balance === '0.0000' && (
                    <button
                      onClick={() => {
                        setSelectedWallet(wallet);
                        setShowDeleteModal(true);
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      Close
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {wallets.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No wallets found
          </div>
        )}
      </div>

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Wallet</h3>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency *
                </label>
                <select
                  name="currency"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Currency</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Label
                </label>
                <input
                  type="text"
                  name="label"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
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
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Wallet</h3>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedWallet(null);
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Close Wallet</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Are you sure you want to close this wallet? This action cannot be undone.
              </p>
              <div className="bg-gray-50 p-3 rounded">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget.closest('form') as HTMLFormElement;
                    const formData = new FormData(form);
                    if (deleteConfirmation === selectedWallet.wallet_id) {
                      handleDeleteWallet(formData.get('reason') as string);
                    }
                  }}
                  disabled={deleteConfirmation !== selectedWallet.wallet_id}
                  className={`px-4 py-2 rounded-md ${
                    deleteConfirmation === selectedWallet.wallet_id
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
