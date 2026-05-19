import { EmptyTransactionsState } from './EmptyTransactionsState';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import { LedgerActivityDto } from '../../types/wallet';
import { Skeleton } from '../common/Skeleton';

function typeTone(type: LedgerActivityDto['type']) {
  switch (type) {
    case 'credit':
      return 'text-success';
    case 'debit':
      return 'text-danger';
    case 'reversal':
      return 'text-info';
    default:
      return 'text-warning';
  }
}

function typeIcon(type: LedgerActivityDto['type']) {
  switch (type) {
    case 'credit':
      return '↑';
    case 'debit':
      return '↓';
    default:
      return '↺';
  }
}

interface LedgerActivityTableProps {
  items: LedgerActivityDto[];
  currency: string;
  loading?: boolean;
  error?: string | null;
  nextCursor: string | null;
  total?: number;
  canGoBack: boolean;
  onRetry: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSelect: (txId: string) => void;
}

export function LedgerActivityTable({
  items,
  currency,
  loading,
  error,
  nextCursor,
  total,
  onNextPage,
  onPrevPage,
  canGoBack,
  onRetry,
  onSelect,
}: LedgerActivityTableProps) {
  let safeErrorMessage = 'Unable to load transactions, please try again';
  if (error) {
    console.error('LedgerActivityTable error:', error);
  }

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Transaction history</h3>
          <p className="mt-1 text-sm text-muted">
            {typeof total === 'number' ? `${total} matching transactions` : '20 items per page'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : error ? (
        <div className="state-panel state-panel--error">
          <p className="font-semibold">Unable to load transactions</p>
          <p className="text-sm text-muted">{safeErrorMessage}</p>
          <button type="button" className="action-button mt-2" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyTransactionsState />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted">Type</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted">Description</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted">Created</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-[0.18em] text-muted">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((activity) => (
                  <tr key={activity.transaction_id} className="border-b border-border last:border-b-0">
                    <td colSpan={4} className="p-0">
                      <button
                        type="button"
                        className="transaction-row"
                        onClick={() => onSelect(activity.transaction_id)}
                        aria-label={`Open details for ${activity.description || activity.type} transaction`}
                      >
                        <span className={`transaction-row__type ${typeTone(activity.type)}`}>
                          <span className="transaction-row__icon" aria-hidden="true">
                            {typeIcon(activity.type)}
                          </span>
                          {activity.type}
                        </span>
                        <span className="transaction-row__description">
                          <strong>{activity.description || 'Ledger entry'}</strong>
                          <small>{activity.reference_id || 'No reference ID'}</small>
                        </span>
                        <span className="transaction-row__date">{formatDateTime(activity.created_at)}</span>
                        <span className={`transaction-row__amount ${typeTone(activity.type)}`}>
                          {activity.type === 'debit' ? '-' : '+'}
                          {formatCurrency(activity.amount, currency)}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onPrevPage}
              className="secondary-button"
              disabled={!canGoBack}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={onNextPage}
              className="secondary-button"
              disabled={!nextCursor}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
