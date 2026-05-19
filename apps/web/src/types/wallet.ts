export interface WalletDto {
  wallet_id: string;
  // Some API responses use `id` while others use `wallet_id`. Accept both.
  id?: string;
  external_user_id: string;
  label: string | null;
  balance: string;
  currency: string;
  status: 'active' | 'frozen' | 'pending_closure' | 'closed';
  is_sandbox: boolean;
  metadata: Record<string, unknown> | null;
}

export type LedgerActivityType = 'credit' | 'debit' | 'reversal';
export type LedgerActivityTypeFilter = 'all' | LedgerActivityType;

export interface LedgerActivityDto {
  transaction_id: string;
  wallet_id: string;
  type: LedgerActivityType;
  amount: string;
  balance_before: string;
  balance_after: string;
  description?: string;
  reference_id?: string | null;
  idempotency_key?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface LedgerActivityListDto {
  data: LedgerActivityDto[];
  next_cursor: string | null;
  total: number;
}

export type TransactionDetailDto = LedgerActivityDto;

export interface SessionBootstrapState {
  token: string | null;
  expiresAt: string | null;
  error: string | null;
  source: 'query' | 'storage' | 'missing' | 'invalid';
}

export interface LedgerActivityFilters {
  type: LedgerActivityTypeFilter;
  from: string | null;
  to: string | null;
}
