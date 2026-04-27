'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase, API_BASE_URL } from '../../../lib/supabase';

export default function ManualActionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [actionType, setActionType] = useState<'credit' | 'debit' | 'reversal'>('credit');
  const [walletId, setWalletId] = useState(searchParams.get('walletId') || '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      let endpoint = '';
      let body: any = {};

      if (actionType === 'credit') {
        endpoint = `${API_BASE_URL}/admin/transactions/credit`;
        body = {
          wallet_id: walletId,
          amount: amount,
          description,
          reference_id: referenceId,
          reason,
        };
      } else if (actionType === 'debit') {
        endpoint = `${API_BASE_URL}/admin/transactions/debit`;
        body = {
          wallet_id: walletId,
          amount: amount,
          description,
          reference_id: referenceId,
          reason,
        };
      } else if (actionType === 'reversal') {
        endpoint = `${API_BASE_URL}/admin/transactions/${walletId}/reverse`;
        body = { reason };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Action failed');
      }

      const result = await response.json();
      setSuccess(`${actionType} completed successfully! Transaction ID: ${result.transaction_id}`);
      
      // Clear form
      setAmount('');
      setDescription('');
      setReferenceId('');
      setReason('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Manual Actions</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Action Type
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setActionType('credit')}
              className={`px-4 py-2 rounded-md ${
                actionType === 'credit'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Credit
            </button>
            <button
              type="button"
              onClick={() => setActionType('debit')}
              className={`px-4 py-2 rounded-md ${
                actionType === 'debit'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Debit
            </button>
            <button
              type="button"
              onClick={() => setActionType('reversal')}
              className={`px-4 py-2 rounded-md ${
                actionType === 'reversal'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Reversal
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {actionType !== 'reversal' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Wallet ID *
                </label>
                <input
                  type="text"
                  required
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter wallet ID"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter amount"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter description"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reference ID
                </label>
                <input
                  type="text"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter reference ID (optional)"
                />
              </div>
            </>
          )}

          {actionType === 'reversal' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transaction ID *
              </label>
              <input
                type="text"
                required
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter transaction ID to reverse"
              />
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason * <span className="text-red-500">(Mandatory for audit)</span>
            </label>
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter reason for this action"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : `Submit ${actionType}`}
          </button>
        </form>
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-yellow-800 mb-2">
          ⚠️ Important Notes
        </h3>
        <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
          <li>All manual actions are logged with your email and reason</li>
          <li>Reason field is mandatory for audit compliance</li>
          <li>Credits and debits require the wallet to be in active status</li>
          <li>Reversals cannot be applied to other reversals</li>
          <li>Debits require sufficient balance in the wallet</li>
        </ul>
      </div>
    </div>
  );
}
