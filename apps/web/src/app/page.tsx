'use client';

import { useMemo, useState } from 'react';
import { BalanceCard } from '../components/wallet/BalanceCard';
import { LedgerActivityTable } from '../components/wallet/LedgerActivityTable';
import { WalletStatusBanner } from '../components/wallet/WalletStatusBanner';
import { useLedgerActivities } from '../hooks/useLedgerActivities';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { useWalletMount } from '../hooks/useWalletMount';
import { useWalletSession } from '../hooks/useWalletSession';

export default function Index() {
  const { walletId, isReady } = useWalletMount();
  const sessionQuery = useWalletSession(walletId);
  const sessionToken = sessionQuery.data?.token;

  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const activeCursor = cursorStack[cursorStack.length - 1];

  const walletQuery = useWalletBalance(walletId, sessionToken);
  const activitiesQuery = useLedgerActivities(walletId, sessionToken, activeCursor);

  const nextCursor = activitiesQuery.data?.next_cursor ?? null;
  const activities = useMemo(() => activitiesQuery.data?.data ?? [], [activitiesQuery.data?.data]);

  if (!isReady) {
    return (
      <main className="page-shell">
        <div className="card text-sm text-danger">
          Missing `wallet_id` in URL and `NEXT_PUBLIC_DEMO_WALLET_ID` in environment.
        </div>
      </main>
    );
  }

  const hasError = sessionQuery.error || walletQuery.error || activitiesQuery.error;

  return (
    <main className="page-shell">
      <header className="card">
        <p className="text-sm text-muted">WalletOS Demo</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">End-user Wallet Visibility</h1>
      </header>

      {hasError ? (
        <div className="card text-sm text-danger">
          {(sessionQuery.error as Error)?.message ||
            (walletQuery.error as Error)?.message ||
            (activitiesQuery.error as Error)?.message}
        </div>
      ) : null}

      <BalanceCard wallet={walletQuery.data} loading={sessionQuery.isLoading || walletQuery.isLoading} />

      {walletQuery.data ? (
        <WalletStatusBanner
          walletId={walletQuery.data.wallet_id}
          externalUserId={walletQuery.data.external_user_id}
          isSandbox={walletQuery.data.is_sandbox}
        />
      ) : null}

      <LedgerActivityTable
        items={activities}
        loading={sessionQuery.isLoading || activitiesQuery.isLoading}
        nextCursor={nextCursor}
        canGoBack={cursorStack.length > 1}
        onPrevPage={() => {
          if (cursorStack.length <= 1) return;
          setCursorStack((prev) => prev.slice(0, -1));
        }}
        onNextPage={() => {
          if (!nextCursor) return;
          setCursorStack((prev) => [...prev, nextCursor]);
        }}
      />
    </main>
  );
}
