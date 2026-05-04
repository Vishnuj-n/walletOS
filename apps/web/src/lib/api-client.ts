import { SessionResponse as SessionDto, TransactionListResponse as LedgerActivityListDto } from '../types/wallet';
import { Wallet as WalletDto } from '@walletOS/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

async function requestJson<T>(
  path: string,
  options?: RequestInit,
  token?: string
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchSessionForWallet(walletId: string): Promise<SessionDto> {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ wallet_id: walletId }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'Unable to create session');
  }

  return (await response.json()) as SessionDto;
}

export function fetchWallet(walletId: string, token: string): Promise<WalletDto> {
  return requestJson<WalletDto>(`/wallets/${walletId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, token);
}

export function fetchLedgerActivities(
  walletId: string,
  token: string,
  cursor?: string | null,
  limit = 20
): Promise<LedgerActivityListDto> {
  const params = new URLSearchParams({ wallet_id: walletId, limit: String(limit) });
  if (cursor) params.set('after', cursor);

  return requestJson<LedgerActivityListDto>(`/transactions?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }, token);
}
