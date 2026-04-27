/**
 * Transaction metadata types
 */

export interface TransactionMetadata {
  description?: string;
  createdBy?: string;
  transferType?: 'source' | 'destination';
  originalTxId?: string;
  reason?: string;
  originalDescription?: string;
  [key: string]: unknown; // Allow additional properties
}

export interface TransactionResponse {
  transaction_id: string;
  wallet_id: string;
  type: string;
  amount: string;
  balance_before: string;
  balance_after: string;
  description?: string;
  reference_id?: string;
  idempotency_key?: string;
  created_by?: string;
  is_sandbox: boolean;
  metadata: TransactionMetadata;
  created_at: Date;
}

export interface ListTransactionsQuery {
  wallet_id?: string;
  type?: string;
  from?: string;
  to?: string;
  min_amount?: string;
  max_amount?: string;
  reference_id?: string;
  limit?: string;
  after?: string;
}
