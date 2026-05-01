import { supabase, API_BASE_URL } from '../lib/supabase';

/**
 * Get auth token from Supabase session
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Generate UUID for idempotency key
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ==================== Types ====================

export interface AuditLog {
  id: string;
  tenant_id: string;
  wallet_id: string | null;
  action: string;
  actor: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

export interface AuditLogListResponse {
  data: AuditLog[];
  next_cursor?: string;
}

export interface CreditTransactionRequest {
  wallet_id: string;
  amount: string;
  description: string;
  reference_id?: string;
  reason: string;
}

export interface DebitTransactionRequest {
  wallet_id: string;
  amount: string;
  description: string;
  reference_id?: string;
  reason: string;
}

export interface ReversalTransactionRequest {
  reason: string;
}

export interface TransactionResponse {
  transaction_id: string;
  wallet_id: string;
  amount: string;
  type: 'credit' | 'debit' | 'reversal';
  status: string;
  created_at: string;
}

// ==================== Audit Log Operations ====================

/**
 * Fetch audit logs with optional filters
 */
export async function fetchAuditLogs(params: {
  wallet_id?: string;
  action?: string;
  limit?: number;
  after?: string;
  signal?: AbortSignal;
}): Promise<AuditLog[]> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const queryParams = new URLSearchParams();
  if (params.wallet_id) queryParams.append('wallet_id', params.wallet_id);
  if (params.action) queryParams.append('action', params.action);
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.after) queryParams.append('after', params.after);

  const response = await fetch(
    `${API_BASE_URL}/admin/audit?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: params.signal,
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch audit logs');
  }

  const data: AuditLogListResponse = await response.json();
  return data.data;
}

// ==================== Manual Transaction Operations ====================

/**
 * Execute a credit transaction
 */
export async function creditWallet(
  request: CreditTransactionRequest
): Promise<TransactionResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/transactions/credit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': generateUUID(),
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Credit transaction failed');
  }

  return await response.json();
}

/**
 * Execute a debit transaction
 */
export async function debitWallet(
  request: DebitTransactionRequest
): Promise<TransactionResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/transactions/debit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': generateUUID(),
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Debit transaction failed');
  }

  return await response.json();
}

/**
 * Execute a transaction reversal
 */
export async function reverseTransaction(
  transactionId: string,
  request: ReversalTransactionRequest
): Promise<TransactionResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/transactions/${transactionId}/reverse`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': generateUUID(),
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Transaction reversal failed');
  }

  return await response.json();
}
