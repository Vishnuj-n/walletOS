'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

interface Wallet {
  wallet_id: string;
  external_user_id: string;
  label: string | null;
  balance: string;
  currency: string;
  status: string;
  is_sandbox: boolean;
  metadata: any;
}

export default function WalletDetailPage() {
  const { walletId } = useParams();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWallet();
  }, [walletId]);

  const fetchWallet = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `http://localhost:3333/api/v1/admin/wallets/${walletId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch wallet');
      }

      const data = await response.json();
      setWallet(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFreeze = async () => {
    const reason = prompt('Enter reason for freezing this wallet:');
    if (!reason) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `http://localhost:3333/api/v1/admin/wallets/${walletId}/freeze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ reason }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to freeze wallet');
      }

      fetchWallet();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUnfreeze = async () => {
    const reason = prompt('Enter reason for unfreezing this wallet:');
    if (!reason) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `http://localhost:3333/api/v1/admin/wallets/${walletId}/unfreeze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ reason }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to unfreeze wallet');
      }

      fetchWallet();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-gray-600">Loading...</div>;

  if (error || !wallet) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error || 'Wallet not found'}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="text-indigo-600 hover:text-indigo-700 mb-4"
      >
        ← Back to Wallets
      </button>
      
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Wallet Details</h2>
      
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-gray-500">Wallet ID</p>
            <p className="text-lg text-gray-900">{wallet.wallet_id}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">External User ID</p>
            <p className="text-lg text-gray-900">{wallet.external_user_id}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Label</p>
            <p className="text-lg text-gray-900">{wallet.label || '-'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Balance</p>
            <p className="text-lg text-gray-900">
              {wallet.currency} {wallet.balance}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Status</p>
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
              wallet.status === 'active' ? 'bg-green-100 text-green-800' :
              wallet.status === 'frozen' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {wallet.status}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Environment</p>
            <p className="text-lg text-gray-900">
              {wallet.is_sandbox ? 'Sandbox' : 'Live'}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Account Controls</h3>
          <div className="flex gap-4">
            {wallet.status === 'active' && (
              <button
                onClick={handleFreeze}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Freeze Wallet
              </button>
            )}
            {wallet.status === 'frozen' && (
              <button
                onClick={handleUnfreeze}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Unfreeze Wallet
              </button>
            )}
            <button
              onClick={() => router.push(`/dashboard/actions?walletId=${wallet.wallet_id}`)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Perform Manual Action
            </button>
          </div>
        </div>

        {wallet.metadata && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Metadata</h3>
            <pre className="bg-gray-50 p-4 rounded-md overflow-auto text-sm">
              {JSON.stringify(wallet.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
