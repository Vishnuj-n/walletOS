'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  fetchWallet,
  freezeWallet,
  unfreezeWallet,
} from '../../../../services/walletService';
import type { Wallet } from '@walletos/types';
import { ArrowLeft, ArrowRightLeft, Snowflake, Sun } from 'lucide-react';

export default function WalletDetailPage() {
  const { walletId } = useParams();
  const router = useRouter();
  
  // Validate walletId is a string
  if (typeof walletId !== 'string') {
    return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">Invalid wallet ID</div>;
  }
  
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWallet = async () => {
    setLoading(true);
    try {
      const data = await fetchWallet(walletId);
      setWallet(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch wallet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
  }, [walletId]);

  const handleFreeze = async () => {
    const reason = prompt('Enter reason for freezing this wallet:');
    if (!reason) return;

    try {
      await freezeWallet(walletId, reason);
      loadWallet();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to freeze wallet');
    }
  };

  const handleUnfreeze = async () => {
    const reason = prompt('Enter reason for unfreezing this wallet:');
    if (!reason) return;

    try {
      await unfreezeWallet(walletId, reason);
      loadWallet();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to unfreeze wallet');
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading...</div>;

  if (error || !wallet) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        {error || 'Wallet not found'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <button
        onClick={() => router.back()}
        className="text-blue-600 hover:text-blue-700 mb-4 text-sm font-semibold inline-flex items-center gap-2"
      >
        <ArrowLeft size={14} /> Back to Wallets
      </button>
      
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Wallet Details</h2>
      
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-slate-500">Wallet ID</p>
            <p className="text-sm font-semibold text-slate-900 font-mono">{wallet.wallet_id}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">External User ID</p>
            <p className="text-sm font-semibold text-slate-900">{wallet.external_user_id}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Label</p>
            <p className="text-sm font-semibold text-slate-900">{wallet.label || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Balance</p>
            <p className="text-sm font-semibold text-slate-900">
              {wallet.currency} {wallet.balance}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
              wallet.status === 'active' ? 'bg-green-100 text-green-800' :
              wallet.status === 'frozen' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {wallet.status}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500">Environment</p>
            <p className="text-sm font-semibold text-slate-900">
              {wallet.is_sandbox ? 'Sandbox' : 'Live'}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Account Controls</h3>
          <div className="flex gap-4">
            {wallet.status === 'active' && (
              <button
                onClick={handleFreeze}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold inline-flex items-center gap-2"
              >
                <Snowflake size={14} /> Freeze Wallet
              </button>
            )}
            {wallet.status === 'frozen' && (
              <button
                onClick={handleUnfreeze}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold inline-flex items-center gap-2"
              >
                <Sun size={14} /> Unfreeze Wallet
              </button>
            )}
            <button
              onClick={() => router.push(`/dashboard/actions?walletId=${wallet.wallet_id}`)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold inline-flex items-center gap-2"
            >
              <ArrowRightLeft size={14} /> Perform Manual Action
            </button>
          </div>
        </div>

        {wallet.metadata && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Metadata</h3>
            <pre className="bg-slate-50 p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(wallet.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
