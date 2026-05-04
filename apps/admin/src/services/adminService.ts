import { supabase, API_BASE_URL } from '../lib/supabase';

/**
 * Get auth token from Supabase session
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      await supabase.auth.signOut();
      throw new Error('Session expired. Please sign in again.');
    }

    return session?.access_token || null;
  } catch (err) {
    await supabase.auth.signOut();
    throw err instanceof Error ? err : new Error('Session expired. Please sign in again.');
  }
}

async function parseApiError(response: Response, fallbackMessage: string): Promise<never> {
  if (response.status === 401) {
    await supabase.auth.signOut();
    throw new Error('Session expired. Please sign in again.');
  }

  try {
    const error = await response.json();
    throw new Error(error.error?.message || error.message || fallbackMessage);
  } catch (jsonError) {
    if (jsonError instanceof SyntaxError) {
      throw new Error(fallbackMessage);
    }
    throw jsonError;
  }
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

// ==================== Tenant Management Types ====================

export interface Tenant {
  tenant_id: string;
  name: string;
  contact_email: string;
  created_at: string;
  wallet_count: number;
  admin_count: number;
}

export interface TenantListResponse {
  data: Tenant[];
}

export interface RotateKeyRequest {
  scope: 'live' | 'test';
}

export interface RotateKeyResponse {
  api_key: string;
  scope: string;
  tenant_id: string;
  created_at: string;
}

export interface TenantUsageResponse {
  tenant_id: string;
  hours: number;
  usage: Array<{
    hour: string;
    requests: number;
  }>;
}

export interface RevokeKeyRequest {
  scope: 'live' | 'test';
}

export interface RevokeKeyResponse {
  tenant_id: string;
  scope: string;
  keys_deactivated: number;
}

export interface CreateTenantRequest {
  name: string;
  contact_email?: string;
}

export interface CreatedTenantResponse {
  tenant_id: string;
  name: string;
  contact_email: string | null;
  live_key: string;
  test_key: string;
  created_at: string;
}

// ==================== Global Search Types ====================

export interface WalletSearchResult {
  wallet_id: string;
  external_user_id: string;
  label: string;
  balance: string;
  currency: string;
  status: string;
  is_sandbox: boolean;
  tenant: {
    tenant_id: string;
    name: string;
  };
  created_at: string;
}

export interface WalletSearchResponse {
  query: string;
  results: WalletSearchResult[];
}

export interface TransactionSearchResult {
  transaction_id: string;
  type: string;
  amount: string;
  currency: string;
  balance_before: string;
  balance_after: string;
  reference_id: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  wallet: {
    wallet_id: string;
    external_user_id: string;
    tenant: {
      tenant_id: string;
      name: string;
    };
  };
  audit_trail: Array<{
    id: string;
    action: string;
    actor: string;
    changes: Record<string, unknown>;
    timestamp: string;
  }>;
}

export interface TransactionSearchResponse {
  query: {
    transactionId?: string;
    requestId?: string;
    idempotencyKey?: string;
  };
  results: TransactionSearchResult[];
}

export interface SystemBalanceResponse {
  total_live: string;
  total_sandbox: string;
  currency_breakdown: Record<string, { live: string; sandbox: string }>;
  calculated_at: string;
  currency?: string;
  currency_code?: string;
}

// ==================== Audit Enhancement Types ====================

export interface AdminActivityLog {
  id: string;
  tenant: {
    tenant_id: string;
    name: string;
  };
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  changes: Record<string, unknown>;
  timestamp: string;
  is_sandbox: boolean;
}

export interface AdminActivityResponse {
  data: AdminActivityLog[];
  next_cursor?: string;
}

export interface SystemError {
  id: string;
  timestamp: string;
  tenant: {
    tenant_id: string;
    name: string;
  };
  error_type: string;
  message: string;
  endpoint: string;
  request_id: string | null;
  actor: string;
  is_sandbox: boolean;
}

export interface SystemErrorsResponse {
  data: SystemError[];
  total_count: number;
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
    return parseApiError(response, 'Failed to fetch audit logs');
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
    return parseApiError(response, 'Credit transaction failed');
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
    return parseApiError(response, 'Debit transaction failed');
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
    return parseApiError(response, 'Transaction reversal failed');
  }

  return await response.json();
}

// ==================== Tenant Management Operations ====================

/**
 * List all tenants with wallet counts
 */
export async function fetchTenants(): Promise<Tenant[]> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(`${API_BASE_URL}/admin/tenants`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return parseApiError(response, 'Failed to fetch tenants');
  }

  const data: TenantListResponse = await response.json();
  return data.data;
}

/**
 * Create a new tenant (superadmin only)
 */
export async function createTenant(request: CreateTenantRequest): Promise<CreatedTenantResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE_URL}/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      return parseApiError(response, 'Failed to create tenant');
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tenant creation timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Rotate API key for a tenant
 */
export async function rotateTenantKey(
  tenantId: string,
  request: RotateKeyRequest
): Promise<RotateKeyResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/tenants/${tenantId}/rotate-key`,
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
    return parseApiError(response, 'Failed to rotate API key');
  }

  return await response.json();
}

/**
 * Get API usage stats for a tenant
 */
export async function fetchTenantUsage(
  tenantId: string,
  hours = 24
): Promise<TenantUsageResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/tenants/${tenantId}/usage?hours=${hours}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    return parseApiError(response, 'Failed to fetch tenant usage');
  }

  return await response.json();
}

/**
 * Revoke API keys for a tenant
 */
export async function revokeTenantKey(
  tenantId: string,
  request: RevokeKeyRequest
): Promise<RevokeKeyResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/tenants/${tenantId}/revoke-key`,
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
    return parseApiError(response, 'Failed to revoke API key');
  }

  return await response.json();
}

// ==================== Global Search Operations ====================

/**
 * Search wallets across all tenants
 */
export async function searchWallets(query: string): Promise<WalletSearchResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/search/wallets?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    return parseApiError(response, 'Failed to search wallets');
  }

  return await response.json();
}

/**
 * Search transactions by ID, request ID, or idempotency key
 */
export async function searchTransactions(params: {
  transactionId?: string;
  requestId?: string;
  idempotencyKey?: string;
}): Promise<TransactionSearchResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const queryParams = new URLSearchParams();
  if (params.transactionId) queryParams.append('transactionId', params.transactionId);
  if (params.requestId) queryParams.append('requestId', params.requestId);
  if (params.idempotencyKey) queryParams.append('idempotencyKey', params.idempotencyKey);

  const response = await fetch(
    `${API_BASE_URL}/admin/search/transactions?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    return parseApiError(response, 'Failed to search transactions');
  }

  return await response.json();
}

/**
 * Get total system balance across all tenants
 */
export async function fetchSystemBalance(): Promise<SystemBalanceResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(`${API_BASE_URL}/admin/system/balance`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    // Don't auto-signout for balance endpoint errors - let the widget handle it
    if (response.status === 401) {
      throw new Error('Unauthorized: Superadmin access required');
    }
    if (response.status === 403) {
      throw new Error('Forbidden: Superadmin access required');
    }
    return parseApiError(response, 'Failed to fetch system balance');
  }

  return await response.json();
}

// ==================== Audit Enhancement Operations ====================

/**
 * Fetch admin activity across all tenants
 */
export async function fetchAdminActivity(params: {
  adminEmail?: string;
  actionType?: string;
  limit?: number;
  after?: string;
}): Promise<AdminActivityResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const queryParams = new URLSearchParams();
  if (params.adminEmail) queryParams.append('adminEmail', params.adminEmail);
  if (params.actionType) queryParams.append('actionType', params.actionType);
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.after) queryParams.append('after', params.after);

  const response = await fetch(
    `${API_BASE_URL}/admin/audit/admin-activity?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    return parseApiError(response, 'Failed to fetch admin activity');
  }

  return await response.json();
}

/**
 * Fetch recent system errors
 */
export async function fetchSystemErrors(limit = 50): Promise<SystemErrorsResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/system/errors?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    return parseApiError(response, 'Failed to fetch system errors');
  }

  return await response.json();
}
