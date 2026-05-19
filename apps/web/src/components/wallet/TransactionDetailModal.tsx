import { formatCurrency, formatDateTime, maskIdentifier } from '../../lib/formatters';
import { Skeleton } from '../common/Skeleton';
import { TransactionDetailDto } from '../../types/wallet';

interface TransactionDetailModalProps {
  open: boolean;
  transaction?: TransactionDetailDto;
  loading?: boolean;
  error?: string | null;
  currency?: string;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function TransactionDetailModal({
  open,
  transaction,
  loading,
  error,
  currency,
  onClose,
}: TransactionDetailModalProps) {
  if (!open) return null;

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title">
      <div className="modal-backdrop" onClick={onClose} />
      <aside className="modal-panel">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-muted">Transaction detail</p>
            <h2 id="transaction-detail-title" className="mt-2 text-2xl font-semibold text-foreground">
              {transaction?.description || 'Ledger entry'}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close transaction details">
            Close
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="state-panel state-panel--error">
            <p className="font-semibold">Unable to load transaction details</p>
            <p className="text-sm text-muted">{error}</p>
          </div>
        ) : transaction ? (
          <dl className="space-y-3">
            <DetailRow label="Transaction ID" value={maskIdentifier(transaction.transaction_id)} />
            <DetailRow label="Type" value={transaction.type} />
            <DetailRow
              label="Amount"
              value={formatCurrency(transaction.amount, currency ?? 'USD')}
            />
            <DetailRow label="Description" value={transaction.description || '-'} />
            <DetailRow label="Reference ID" value={transaction.reference_id ? maskIdentifier(transaction.reference_id) : '-'} />
            <DetailRow label="Created At" value={formatDateTime(transaction.created_at)} />
            <DetailRow
              label="Balance Before"
              value={formatCurrency(transaction.balance_before, currency ?? 'USD')}
            />
            <DetailRow
              label="Balance After"
              value={formatCurrency(transaction.balance_after, currency ?? 'USD')}
            />
          </dl>
        ) : null}
      </aside>
    </div>
  );
}
