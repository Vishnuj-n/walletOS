import { ChangeEvent } from 'react';
import { LedgerActivityFilters, LedgerActivityTypeFilter } from '../../types/wallet';

interface TransactionFiltersProps {
  filters: LedgerActivityFilters;
  onChange: (next: LedgerActivityFilters) => void;
}

const filterOptions: Array<{ label: string; value: LedgerActivityTypeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Credits', value: 'credit' },
  { label: 'Debits', value: 'debit' },
  { label: 'Reversals', value: 'reversal' },
];

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const updateDate =
    (field: 'from' | 'to') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...filters,
        [field]: event.target.value || null,
      });
    };

  return (
    <section className="filter-bar" aria-label="Transaction filters">
      <div className="filter-tabs" role="group" aria-label="Transaction type">
        {filterOptions.map((option) => {
          const isActive = filters.type === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              className={`filter-tab ${isActive ? 'filter-tab--active' : ''}`}
              onClick={() => onChange({ ...filters, type: option.value })}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="filter-field">
          <span>From</span>
          <input
            type="date"
            aria-label="Filter transactions from date"
            value={filters.from ?? ''}
            onChange={updateDate('from')}
          />
        </label>
        <label className="filter-field">
          <span>To</span>
          <input
            type="date"
            aria-label="Filter transactions to date"
            value={filters.to ?? ''}
            onChange={updateDate('to')}
          />
        </label>
      </div>
    </section>
  );
}
