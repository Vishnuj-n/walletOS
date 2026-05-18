import { formatCurrency, formatDateTime, maskIdentifier, titleCaseStatus } from '../../lib/formatters';
import { WalletDto } from '../../types/wallet';
import { Skeleton } from '../common/Skeleton';

function statusTone(status: WalletDto['status']) {
  switch (status) {
    case 'active':
      return 'status-pill status-pill--active';
    case 'frozen':
      return 'status-pill status-pill--frozen';
    case 'closed':
      return 'status-pill status-pill--closed';
    case 'pending_closure':
      return 'status-pill status-pill--frozen';
    default:
      return 'status-pill';
  }
}

export function BalanceCard({
  wallet,
  loading,
  lastUpdatedAt,
}: {
  wallet?: WalletDto;
  loading?: boolean;
  lastUpdatedAt?: string | null;
}) {
  if (loading) {
    return (
      <section className="card space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-14 w-56" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </section>
    );
  }

  if (!wallet) return null;

  return (
    <section className="card wallet-balance-card" aria-label="Wallet balance summary">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-muted">Wallet balance</p>
          <h1 className="mt-3 text-balance font-semibold tracking-tight text-foreground">
            {formatCurrency(wallet.balance, wallet.currency)}
          </h1>
        </div>
        <span className={statusTone(wallet.status)}>{titleCaseStatus(wallet.status)}</span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="balance-meta-card">
          <p className="balance-meta-card__label">Wallet label</p>
          <p className="balance-meta-card__value">{wallet.label || `Wallet • ${maskIdentifier(wallet.wallet_id)}`}</p>
        </div>
        <div className="balance-meta-card">
          <p className="balance-meta-card__label">Last updated</p>
          <p className="balance-meta-card__value">
            {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : 'No recent activity'}
          </p>
        </div>
      </div>
    </section>
  );
}
