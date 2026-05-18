import { formatCompactNumber, formatCurrency } from '../../lib/formatters';

interface QuickStatsCardsProps {
  currency: string;
  totalEarned: number;
  totalSpent: number;
  transactionsThisMonth: number;
}

export function QuickStatsCards({
  currency,
  totalEarned,
  totalSpent,
  transactionsThisMonth,
}: QuickStatsCardsProps) {
  return (
    <section aria-label="Wallet summary statistics" className="grid gap-3 sm:grid-cols-3">
      <article className="stat-card">
        <p className="stat-card__label">Total Earned</p>
        <p className="stat-card__value text-success">{formatCurrency(totalEarned, currency)}</p>
      </article>
      <article className="stat-card">
        <p className="stat-card__label">Total Spent</p>
        <p className="stat-card__value text-danger">{formatCurrency(totalSpent, currency)}</p>
      </article>
      <article className="stat-card">
        <p className="stat-card__label">Transactions This Month</p>
        <p className="stat-card__value">{formatCompactNumber(transactionsThisMonth)}</p>
      </article>
    </section>
  );
}
