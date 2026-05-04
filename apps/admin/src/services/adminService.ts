import type {
  AdminActivityQuery,
  AdminActivityResponse,
  AdminAuditQuery,
  AuditLog,
  AuditLogListResponse,
  CreateTenantRequest,
  CreatedTenantResponse,
  CreditTransactionRequest,
  DebitTransactionRequest,
  ReversalTransactionRequest,
  RevokeKeyRequest,
  RevokeKeyResponse,
  RotateKeyRequest,
  RotateKeyResponse,
  SystemBalanceResponse,
  SystemErrorsResponse,
  Tenant,
  TenantListResponse,
  TenantUsageResponse,
  TransactionResponse,
  TransactionSearchQuery,
  TransactionSearchResponse,
  WalletSearchResponse,
} from '@walletOS/types';
import { apiRequest } from '../lib/apiClient';

export async function fetchAuditLogs(
  params: AdminAuditQuery & { signal?: AbortSignal }
): Promise<AuditLog[]> {
  const { signal, ...query } = params;
  const response = await apiRequest<AuditLogListResponse>('/admin/audit', {
    query,
    signal,
    fallbackMessage: 'Failed to fetch audit logs',
  });
  return response.data;
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

export async function rotateTenantKey(
  tenantId: string,
  request: RotateKeyRequest
): Promise<RotateKeyResponse> {
  return apiRequest<RotateKeyResponse>(`/admin/tenants/${tenantId}/rotate-key`, {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to rotate API key',
  });
}

export async function fetchTenantUsage(tenantId: string, hours = 24): Promise<TenantUsageResponse> {
  return apiRequest<TenantUsageResponse>(`/admin/tenants/${tenantId}/usage`, {
    query: { hours },
    fallbackMessage: 'Failed to fetch tenant usage',
  });
}

export async function revokeTenantKey(
  tenantId: string,
  request: RevokeKeyRequest
): Promise<RevokeKeyResponse> {
  return apiRequest<RevokeKeyResponse>(`/admin/tenants/${tenantId}/revoke-key`, {
    method: 'POST',
    body: request,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to revoke API key',
  });
}

export async function searchWallets(query: string): Promise<WalletSearchResponse> {
  return apiRequest<WalletSearchResponse>('/admin/search/wallets', {
    query: { q: query },
    fallbackMessage: 'Failed to search wallets',
  });
}

export async function searchTransactions(
  params: TransactionSearchQuery
): Promise<TransactionSearchResponse> {
  return apiRequest<TransactionSearchResponse>('/admin/search/transactions', {
    query: params,
    fallbackMessage: 'Failed to search transactions',
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
