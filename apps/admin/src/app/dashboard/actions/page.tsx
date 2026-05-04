'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  creditWallet,
  debitWallet,
  reverseTransaction,
  type CreditTransactionRequest,
  type DebitTransactionRequest,
  type ReversalTransactionRequest,
} from '../../../services/adminService';
import { ArrowRightLeft, BadgeDollarSign, RotateCcw, ShieldAlert } from 'lucide-react';

export default function ManualActionsPage() {
  const searchParams = useSearchParams();
  const [actionType, setActionType] = useState<'credit' | 'debit' | 'reversal'>('credit');
  const [walletId, setWalletId] = useState(searchParams.get('walletId') || '');
  const [transactionId, setTransactionId] = useState('');
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
      let result;

      if (actionType === 'credit') {
        const request: CreditTransactionRequest = {
          wallet_id: walletId,
          amount,
          description,
          reference_id: referenceId || undefined,
          reason,
        };
        result = await creditWallet(request);
      } else if (actionType === 'debit') {
        const request: DebitTransactionRequest = {
          wallet_id: walletId,
          amount,
          description,
          reference_id: referenceId || undefined,
          reason,
        };
        result = await debitWallet(request);
      } else if (actionType === 'reversal') {
        const request: ReversalTransactionRequest = {
          reason,
        };
        result = await reverseTransaction(transactionId, request);
      }

      setSuccess(`${actionType} completed successfully! Transaction ID: ${result?.transaction_id || 'N/A'}`);
      
      // Clear form
      setAmount('');
      setDescription('');
      setReferenceId('');
      setReason('');
      setTransactionId('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Manual Actions</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {success}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            Action Type
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setActionType('credit')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${
                actionType === 'credit'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <BadgeDollarSign size={16} /> Credit
            </button>
            <button
              type="button"
              onClick={() => setActionType('debit')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${
                actionType === 'debit'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <ArrowRightLeft size={16} /> Debit
            </button>
            <button
              type="button"
              onClick={() => setActionType('reversal')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${
                actionType === 'reversal'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <RotateCcw size={16} /> Reversal
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {actionType !== 'reversal' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Wallet ID *
                </label>
                <input
                  type="text"
                  required
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter wallet ID"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter description"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Reference ID
                </label>
                <input
                  type="text"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter reference ID (optional)"
                />
              </div>
            </>
          )}

          {actionType === 'reversal' && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Transaction ID *
              </label>
              <input
                type="text"
                required
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter transaction ID to reverse"
              />
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Reason * <span className="text-red-500">(Mandatory for audit)</span>
            </label>
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter reason for this action"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
          >
            {loading ? 'Processing...' : `Submit ${actionType}`}
          </button>
        </form>
      </div>

      <div className="mt-4 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2 inline-flex items-center gap-2">
          <ShieldAlert size={16} className="text-amber-600" /> Important Notes
        </h3>
        <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
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
