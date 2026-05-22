import { apiRequest } from '../lib/apiClient';
import { getAdminSession, requireActiveTenantId, withActiveTenantScope } from '../lib/adminSession';

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

export interface WalletListResponse {
  data: Wallet[];
  next_cursor?: string;
}

export interface CreateWalletRequest {
  external_user_id: string;
  tenant_id?: string;
  currency: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateWalletRequest {
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface FreezeWalletRequest {
  reason: string;
}

export async function fetchWallets(params: {
  search?: string;
  status?: string;
  limit?: number;
  after?: string;
}): Promise<Wallet[]> {
  const adminSession = getAdminSession();
  const query = adminSession?.role === 'superadmin'
    ? params
    : withActiveTenantScope(params);

  const response = await apiRequest<WalletListResponse>('/admin/wallets', {
    query,
    fallbackMessage: 'Failed to fetch wallets',
  });

  return response.data;
}

export async function fetchWallet(walletId: string): Promise<Wallet> {
  return apiRequest<Wallet>(`/admin/wallets/${walletId}`, {
    fallbackMessage: 'Failed to fetch wallet',
  });
}

export async function createWallet(data: CreateWalletRequest): Promise<Wallet> {
  const tenantId = data.tenant_id ?? requireActiveTenantId('Active tenant is required to create a wallet');
  const scopedRequest = data.tenant_id ? data : {
    ...data,
    tenant_id: tenantId,
  };

  return apiRequest<Wallet>('/admin/wallets', {
    method: 'POST',
    body: scopedRequest,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to create wallet',
  });
}

export async function updateWallet(walletId: string, data: UpdateWalletRequest): Promise<Wallet> {
  return apiRequest<Wallet>(`/admin/wallets/${walletId}`, {
    method: 'PATCH',
    body: data,
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to update wallet',
  });
}

export async function closeWallet(walletId: string, reason: string): Promise<Wallet> {
  return apiRequest<Wallet>(`/admin/wallets/${walletId}`, {
    method: 'DELETE',
    body: { reason },
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to close wallet',
  });
}

export async function freezeWallet(walletId: string, reason: string): Promise<void> {
  await apiRequest<void>(`/admin/wallets/${walletId}/freeze`, {
    method: 'POST',
    body: { reason },
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to freeze wallet',
  });
}

export async function unfreezeWallet(walletId: string, reason: string): Promise<void> {
  await apiRequest<void>(`/admin/wallets/${walletId}/unfreeze`, {
    method: 'POST',
    body: { reason },
    requireIdempotencyKey: true,
    fallbackMessage: 'Failed to unfreeze wallet',
  });
}
