'use client';

import { useMemo, useState } from 'react';
import { ApiError } from '../lib/api-client';
import { BalanceCard } from '../components/wallet/BalanceCard';
import { LedgerActivityTable } from '../components/wallet/LedgerActivityTable';
import { QuickStatsCards } from '../components/wallet/QuickStatsCards';
import { TransactionDetailModal } from '../components/wallet/TransactionDetailModal';
import { TransactionFilters } from '../components/wallet/TransactionFilters';
import { WalletStatusBanner } from '../components/wallet/WalletStatusBanner';
import { useLedgerActivities } from '../hooks/useLedgerActivities';
import { useTransactionDetail } from '../hooks/useTransactionDetail';
import { useWalletSession } from '../hooks/useWalletSession';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { LedgerActivityFilters } from '../types/wallet';

const initialFilters: LedgerActivityFilters = {
  type: 'all',
  from: null,
  to: null,
};

function renderTopLevelError(error: unknown) {
  if (!(error instanceof Error)) return null;

  const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL;
  const isServiceUnavailable = error instanceof ApiError && error.status === 503;

  return (
    <section className="card state-panel state-panel--error">
      <p className="font-semibold">
        {isServiceUnavailable ? 'Service temporarily unavailable' : 'Unable to load your wallet'}
      </p>
      <p className="text-sm text-muted">{error.message}</p>
      {isServiceUnavailable && supportUrl ? (
        <a href={supportUrl} target="_blank" rel="noreferrer" className="action-link">
          Contact support
        </a>
      ) : null}
    </section>
  );
}

export default function Index() {
  const session = useWalletSession();
  const [filters, setFilters] = useState<LedgerActivityFilters>(initialFilters);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const activeCursor = cursorStack[cursorStack.length - 1];
  const walletId = session.walletId ?? '';
  const token = session.token;

  const walletQuery = useWalletBalance(walletId, token);
  const activitiesQuery = useLedgerActivities(walletId, token, filters, activeCursor);
  const transactionDetailQuery = useTransactionDetail(selectedTransactionId, token);

  const activities = activitiesQuery.data?.data ?? [];
  const nextCursor = activitiesQuery.data?.next_cursor ?? null;
  const lastUpdatedAt = activities.length > 0
    ? activities.reduce((latest, tx) =>
        tx.created_at > latest.created_at ? tx : latest
      ).created_at
    : null;
  const topLevelError = walletQuery.error || activitiesQuery.error;

  const quickStats = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    return (activitiesQuery.data?.data ?? []).reduce(
      (accumulator, activity) => {
        const amount = Number(activity.amount);
        if (!Number.isFinite(amount)) return accumulator;
        const createdAt = new Date(activity.created_at);

        if (activity.type === 'credit') accumulator.totalEarned += amount;
        if (activity.type === 'debit') accumulator.totalSpent += amount;
        if (
          createdAt.getMonth() === currentMonth &&
          createdAt.getFullYear() === currentYear
        ) {
          accumulator.transactionsThisMonth += 1;
        }

        return accumulator;
      },
      {
        totalEarned: 0,
        totalSpent: 0,
        transactionsThisMonth: 0,
      }
    );
  }, [activitiesQuery.data?.data?.length, activitiesQuery.data?.data?.map(a => a.type).join(',')]);

  if (!session.isReady) {
    return (
      <main className="page-shell">
        <section className="card state-panel state-panel--warning">
          <p className="font-semibold">Wallet session required</p>
          <p className="text-sm text-muted">
            {session.error || 'Pass `token=sess_...` and `wallet_id=...` to load this wallet embed.'}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">WalletOS</p>
          <h1 className="hero-panel__title">My Wallet</h1>
        </div>
        <p className="hero-panel__copy">
          Review your balance, recent activity, and transaction history. This wallet view is read-only.
        </p>
      </header>

      {topLevelError ? renderTopLevelError(topLevelError) : null}

      <div className="layout-grid">
        <section className="space-y-4">
          <BalanceCard
            wallet={walletQuery.data}
            loading={walletQuery.isLoading}
            lastUpdatedAt={lastUpdatedAt}
          />
          {walletQuery.data ? <WalletStatusBanner wallet={walletQuery.data} /> : null}
          {walletQuery.data ? (
            <QuickStatsCards
              currency={walletQuery.data.currency}
              totalEarned={quickStats.totalEarned}
              totalSpent={quickStats.totalSpent}
              transactionsThisMonth={quickStats.transactionsThisMonth}
            />
          ) : null}
        </section>

        <section className="space-y-4">
          <TransactionFilters
            filters={filters}
            onChange={(nextFilters) => {
              setFilters(nextFilters);
              setCursorStack([null]);
            }}
          />
          <LedgerActivityTable
            items={activities}
            currency={walletQuery.data?.currency ?? 'USD'}
            loading={activitiesQuery.isLoading}
            error={activitiesQuery.error instanceof Error ? activitiesQuery.error.message : String(activitiesQuery.error ?? 'Unknown error')}
            nextCursor={nextCursor}
            total={activitiesQuery.data?.total}
            canGoBack={cursorStack.length > 1}
            onRetry={() => {
              void activitiesQuery.refetch();
            }}
            onPrevPage={() => {
              if (cursorStack.length <= 1) return;
              setCursorStack((previous) => previous.slice(0, -1));
            }}
            onNextPage={() => {
              if (!nextCursor) return;
              setCursorStack((previous) => [...previous, nextCursor]);
            }}
            onSelect={setSelectedTransactionId}
          />
        </section>
      </div>

      <TransactionDetailModal
        open={Boolean(selectedTransactionId)}
        transaction={transactionDetailQuery.data}
        loading={transactionDetailQuery.isLoading}
        error={transactionDetailQuery.error instanceof Error ? transactionDetailQuery.error.message : String(transactionDetailQuery.error ?? 'Unknown error')}
        currency={walletQuery.data?.currency}
        onClose={() => setSelectedTransactionId(null)}
      />
    </main>
  );
}
