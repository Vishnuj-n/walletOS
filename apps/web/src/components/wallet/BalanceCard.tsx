import React from 'react';
import { Wallet as WalletDto } from '@walletOS/types';
import { Skeleton } from '../common/Skeleton';

export function BalanceCard({
  wallet,
  loading,
}: {
  wallet?: WalletDto;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="card">
        <Skeleton className="mb-4 h-4 w-28" />
        <Skeleton className="h-10 w-52" />
      </div>
    );
  }

  if (!wallet) return null;

  return (
    <div className="card">
      <p className="mb-2 text-sm text-muted">Current Ledger Balance</p>
      <h2 className="text-safe-balance text-3xl font-semibold tracking-tight sm:text-4xl truncate">
        {wallet.currency} {wallet.balance}
      </h2>
      <p className="mt-3 text-sm text-muted">Status: {wallet.status}</p>
    </div>
  );
}
