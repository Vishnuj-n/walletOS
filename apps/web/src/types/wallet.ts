export interface WalletDto {
  wallet_id: string;
  external_user_id: string;
  label: string | null;
  balance: string;
  currency: string;
  status: 'active' | 'frozen' | 'pending_closure' | 'closed';
  is_sandbox: boolean;
  metadata: Record<string, unknown> | null;
}

export interface LedgerActivityDto {
  transaction_id: string;
  wallet_id: string;
  type: 'credit' | 'debit' | 'reversal';
  amount: string;
  description?: string;
  created_at: string;
}

export interface LedgerActivityListDto {
  data: LedgerActivityDto[];
  next_cursor: string | null;
}

export interface SessionDto {
  token: string;
  wallet_id: string;
  expires_at: string;
}
