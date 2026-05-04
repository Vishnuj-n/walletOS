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

/**
 * Transaction response from API
 */
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
  created_at: string;
}

/**
 * Query parameters for listing transactions
 */
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

/**
 * Wallet entity
 */
export interface Wallet {
  wallet_id: string;
  external_user_id: string;
  label: string | null;
  balance: string;
  currency: string;
  status: string;
  is_sandbox: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Wallet list response with pagination
 */
export interface WalletListResponse {
  data: Wallet[];
  next_cursor?: string;
}

/**
 * Request to create a wallet
 */
export interface CreateWalletRequest {
  external_user_id: string;
  tenant_id?: string;
  currency: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update a wallet
 */
export interface UpdateWalletRequest {
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to freeze a wallet
 */
export interface FreezeWalletRequest {
  reason: string;
}

/**
 * Audit log entry
 */
export interface AuditLog {
  id: string;
  tenant_id: string;
  wallet_id: string | null;
  action: string;
  actor: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

/**
 * Audit log list response
 */
export interface AuditLogListResponse {
  data: AuditLog[];
  next_cursor?: string;
}

/**
 * Base transaction request fields
 */
export interface TransactionRequest {
  wallet_id: string;
  amount: string;
  description: string;
  reference_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Credit transaction request
 */
export type CreditTransactionRequest = TransactionRequest;

/**
 * Debit transaction request
 */
export type DebitTransactionRequest = TransactionRequest;

/**
 * Reversal transaction request
 */
export interface ReversalTransactionRequest {
  reason: string;
}
