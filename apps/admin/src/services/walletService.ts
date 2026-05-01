import { supabase, API_BASE_URL } from '../lib/supabase';

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

/**
 * Get auth token from Supabase session
 */
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Fetch all wallets with optional filters
 */
export async function fetchWallets(params: {
  search?: string;
  status?: string;
  limit?: number;
  after?: string;
}): Promise<Wallet[]> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const queryParams = new URLSearchParams();
  if (params.search) queryParams.append('search', params.search);
  if (params.status) queryParams.append('status', params.status);
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.after) queryParams.append('after', params.after);

  const response = await fetch(
    `${API_BASE_URL}/admin/wallets?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch wallets');
  }

  const data: WalletListResponse = await response.json();
  return data.data;
}

/**
 * Fetch a single wallet by ID
 */
export async function fetchWallet(walletId: string): Promise<Wallet> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/wallets/${walletId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch wallet');
  }

  return await response.json();
}

/**
 * Create a new wallet
 */
export async function createWallet(data: CreateWalletRequest): Promise<Wallet> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/wallets`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create wallet');
  }

  return await response.json();
}

/**
 * Update wallet label or metadata
 */
export async function updateWallet(
  walletId: string,
  data: UpdateWalletRequest
): Promise<Wallet> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/wallets/${walletId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update wallet');
  }

  return await response.json();
}

/**
 * Close a wallet
 */
export async function closeWallet(
  walletId: string,
  reason: string
): Promise<Wallet> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/wallets/${walletId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to close wallet');
  }

  return await response.json();
}

/**
 * Freeze a wallet
 */
export async function freezeWallet(
  walletId: string,
  reason: string
): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/wallets/${walletId}/freeze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to freeze wallet');
  }
}

/**
 * Unfreeze a wallet
 */
export async function unfreezeWallet(
  walletId: string,
  reason: string
): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new Error('No active session');

  const response = await fetch(
    `${API_BASE_URL}/admin/wallets/${walletId}/unfreeze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to unfreeze wallet');
  }
}
