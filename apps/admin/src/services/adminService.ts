import type {
  AdminActivityQuery,
  AdminActivityResponse,
  AdminAuditQuery,
  AuditLog,
  AuditLogListResponse,
  CreateTenantRequest,
  CreatedTenantResponse,
  InviteAdminUserRequest,
  InviteAdminUserResponse,
  CreditTransactionRequest,
  DebitTransactionRequest,
  ReversalTransactionRequest,
  ResendTenantInviteResponse,
  RotateKeyRequest,
  RotateKeyResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  SystemBalanceResponse,
  SystemErrorsResponse,
  Tenant,
  TenantEmployeeListResponse,
  TenantApiKeySettingsResponse,
  TenantListResponse,
  TenantUsageResponse,
  UnifiedSearchResponse,
  TransactionResponse,
} from '@walletos/types';
import { apiRequest } from '../lib/apiClient';
import { getAdminToken, setAdminSession } from '../lib/adminSession';
import { mapErrorCodeToMessage } from '../lib/errorMap';



export async function fetchAuditLogs(
  params: AdminAuditQuery & { signal?: AbortSignal }
): Promise<AuditLog[]> {
  const { signal, ...query } = params;
  // Pass tenantId from the caller; when omitted, superadmins see all tenants
  // (the backend's allowNoScope path). Non-superadmins are scoped server-side.
  const response = await apiRequest<AuditLogListResponse>('/admin/audit', {
    query,
    signal,
    fallbackMessage: 'Failed to fetch audit logs',
  });
  return response.data;
}

export async function fetchCurrentTenantApiKeys(): Promise<TenantApiKeySettingsResponse> {
  return apiRequest<TenantApiKeySettingsResponse>('/admin/account/api-keys', {
    fallbackMessage: 'Failed to fetch API key settings',
  });
}

export async function rotateCurrentTenantKey(request: RotateKeyRequest): Promise<RotateKeyResponse> {
  return apiRequest<RotateKeyResponse>('/admin/account/api-keys/rotate', {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to rotate API key',
  });
}

export async function createCurrentTenantApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return apiRequest<CreateApiKeyResponse>('/admin/account/api-keys', {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to generate API key',
  });
}

export async function revokeCurrentTenantApiKey(keyId: string): Promise<{ success: boolean; key_id: string }> {
  return apiRequest<{ success: boolean; key_id: string }>(`/admin/account/api-keys/${keyId}/revoke`, {
    method: 'POST',
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to revoke API key',
  });
}

export async function creditWallet(request: CreditTransactionRequest): Promise<TransactionResponse> {
  return apiRequest<TransactionResponse>('/admin/transactions/credit', {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Credit transaction failed',
  });
}

export async function debitWallet(request: DebitTransactionRequest): Promise<TransactionResponse> {
  return apiRequest<TransactionResponse>('/admin/transactions/debit', {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Debit transaction failed',
  });
}

export async function reverseTransaction(
  transactionId: string,
  request: ReversalTransactionRequest
): Promise<TransactionResponse> {
  return apiRequest<TransactionResponse>(`/admin/transactions/${transactionId}/reverse`, {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Transaction reversal failed',
  });
}

export async function fetchTenants(): Promise<Tenant[]> {
  const response = await apiRequest<TenantListResponse>('/admin/tenants', {
    fallbackMessage: 'Failed to fetch tenants',
  });
  return response.data;
}

export async function createTenant(request: CreateTenantRequest): Promise<CreatedTenantResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    return await apiRequest<CreatedTenantResponse>('/admin/tenants', {
      method: 'POST',
      body: request,
      signal: controller.signal,
      requireIdempotencyKey: true,
      fallbackMessage: 'Failed to create tenant',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tenant creation timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resendTenantInvite(tenantId: string): Promise<ResendTenantInviteResponse> {
  return apiRequest<ResendTenantInviteResponse>(`/admin/tenants/${tenantId}/resend-invite`, {
    method: 'POST',
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to resend tenant invite',
  });
}

export async function inviteTenantUser(request: InviteAdminUserRequest): Promise<InviteAdminUserResponse> {
  return apiRequest<InviteAdminUserResponse>('/admin/users/invite', {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to send employee invite',
  });
}

export async function fetchCurrentTenantEmployees(search?: string): Promise<TenantEmployeeListResponse> {
  return apiRequest<TenantEmployeeListResponse>('/admin/account/users', {
    query: { q: search },
    fallbackMessage: 'Failed to fetch tenant employees',
  });
}

export async function fetchTenantUsage(tenantId: string, hours = 24): Promise<TenantUsageResponse> {
  return apiRequest<TenantUsageResponse>(`/admin/tenants/${tenantId}/usage`, {
    query: { hours },
    fallbackMessage: 'Failed to fetch tenant usage',
  });
}

export async function fetchTenantApiKeys(tenantId: string): Promise<TenantApiKeySettingsResponse> {
  return apiRequest<TenantApiKeySettingsResponse>(`/admin/tenants/${tenantId}/api-keys`, {
    fallbackMessage: 'Failed to fetch tenant API keys',
  });
}

export async function revokeTenantApiKey(
  tenantId: string,
  keyId: string
): Promise<{ success: boolean; key_id: string }> {
  return apiRequest<{ success: boolean; key_id: string }>(
    `/admin/tenants/${tenantId}/api-keys/${keyId}/revoke`,
    {
      method: 'POST',
      requireIdempotencyKey: true,
      fallbackMessage: 'Failed to revoke API key',
    }
  );
}

export async function emergencyRevokeTenantKeys(
  tenantId: string
): Promise<{ tenant_id: string; keys_deactivated: number }> {
  return apiRequest<{ tenant_id: string; keys_deactivated: number }>(
    `/admin/tenants/${tenantId}/emergency-revoke`,
    {
      method: 'POST',
      requireIdempotencyKey: true,
      fallbackMessage: 'Failed to perform emergency key revocation',
    }
  );
}



export async function searchUnified(query: string): Promise<UnifiedSearchResponse> {
  return apiRequest<UnifiedSearchResponse>('/admin/search', {
    query: { q: query },
    fallbackMessage: 'Failed to run unified search',
  });
}

export async function fetchSystemBalance(): Promise<SystemBalanceResponse> {
  return apiRequest<SystemBalanceResponse>('/admin/system/balance', {
    fallbackMessage: 'Failed to fetch system balance',
  });
}

export async function fetchAdminActivity(params: AdminActivityQuery): Promise<AdminActivityResponse> {
  return apiRequest<AdminActivityResponse>('/admin/audit/admin-activity', {
    query: params,
    fallbackMessage: 'Failed to fetch admin activity',
  });
}

export async function fetchSystemErrors(limit = 50): Promise<SystemErrorsResponse> {
  return apiRequest<SystemErrorsResponse>('/admin/system/errors', {
    query: { limit },
    fallbackMessage: 'Failed to fetch system errors',
  });
}

// ─── Webhook CRUD ─────────────────────────────────────────────────────────────

export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  status: string;
  is_active: boolean;
  failure_count: number;
  last_attempt: string | null;
  delivery_count: number;
  created_at: string;
}

export interface CreateWebhookResponse {
  id: string;
  url: string;
  events: string[];
  secret: string;
  status: string;
  is_active: boolean;
  created_at: string;
}

export async function fetchWebhooks(): Promise<WebhookRecord[]> {
  return apiRequest<WebhookRecord[]>('/admin/webhooks', {
    fallbackMessage: 'Failed to fetch webhooks',
  });
}

export async function createWebhook(payload: {
  url: string;
  events: string[];
}): Promise<CreateWebhookResponse> {
  return apiRequest<CreateWebhookResponse>('/admin/webhooks', {
    method: 'POST',
    body: payload,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to create webhook',
  });
}

export async function deleteWebhook(webhookId: string): Promise<{ id: string; is_active: boolean; status: string }> {
  return apiRequest<{ id: string; is_active: boolean; status: string }>(`/admin/webhooks/${webhookId}`, {
    method: 'DELETE',
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to delete webhook',
  });
}

export async function testWebhook(webhookId: string): Promise<{ delivery_id: string; message: string }> {
  return apiRequest<{ delivery_id: string; message: string }>(`/admin/webhooks/${webhookId}/test`, {
    method: 'POST',
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to send test webhook',
  });
}

// ─── Tenant Config ─────────────────────────────────────────────────────────────



// ─── Reporting & Exports ──────────────────────────────────────────────────────

export interface TransactionMetricsDay {
  date: string;
  credits: string;
  debits: string;
  reversals: string;
  net: string;
  count: number;
}

export interface TransactionMetricsResponse {
  from: string;
  to: string;
  is_sandbox: boolean;
  summary: {
    total_credits: string;
    total_debits: string;
    total_reversals: string;
    net_change: string;
    transaction_count: number;
  };
  daily: TransactionMetricsDay[];
}

export async function fetchTransactionMetrics(params?: {
  from?: string;
  to?: string;
  is_sandbox?: boolean;
}): Promise<TransactionMetricsResponse> {
  return apiRequest<TransactionMetricsResponse>('/admin/reporting/transactions', {
    query: params,
    fallbackMessage: 'Failed to fetch transaction metrics',
  });
}

export async function exportAuditLogsCsv(params?: {
  from?: string;
  to?: string;
  entity_type?: string;
}): Promise<ReadableStream<Uint8Array>> {
  const token = getAdminToken();
  if (!token) throw new Error('No active session');

  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.entity_type) query.set('entity_type', params.entity_type);

  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';
  const url = `${baseUrl}/admin/audit-logs/export${query.toString() ? `?${query.toString()}` : ''}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'text/csv',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      setAdminSession(null);
      throw new Error('Session expired. Please sign in again.');
    }
    const fallbackMessage = 'Failed to export audit logs';
    let errorObj: { error?: { code?: string }; message?: string } | null = null;
    try {
      errorObj = await res.json();
    } catch {
      // Ignore JSON parse errors
    }

    if (errorObj) {
      const mappedMessage = mapErrorCodeToMessage(errorObj.error?.code, fallbackMessage);
      throw new Error(mappedMessage || errorObj.message || fallbackMessage);
    }
    throw new Error(fallbackMessage);
  }

  if (!res.body) {
    throw new Error('Response body is empty');
  }

  return res.body;
}

export interface TenantConfigResponse {
  id: string;
  tenant_id: string;
  default_currency: string;
  auto_create_wallet: boolean;
  allowed_origins: string[];
  updated_at: string;
}

export interface UpdateTenantConfigRequest {
  defaultCurrency?: string;
  autoCreateWallet?: boolean;
  allowedOrigins?: string[];
}

export async function fetchTenantConfig(): Promise<TenantConfigResponse> {
  return apiRequest<TenantConfigResponse>('/admin/tenant-config', {
    fallbackMessage: 'Failed to fetch tenant configuration',
  });
}

export async function updateTenantConfig(request: UpdateTenantConfigRequest): Promise<TenantConfigResponse> {
  return apiRequest<TenantConfigResponse>('/admin/tenant-config', {
    method: 'PUT',
    body: request,
    fallbackMessage: 'Failed to update tenant configuration',
  });
}
