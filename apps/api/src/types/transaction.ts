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
