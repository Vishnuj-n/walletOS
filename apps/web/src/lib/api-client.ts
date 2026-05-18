import {
  LedgerActivityFilters,
  LedgerActivityListDto,
  SessionBootstrapState,
  TransactionDetailDto,
  WalletDto,
} from '../types/wallet';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function assertConfiguredApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured');
  }
}

async function requestJson<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  assertConfiguredApiBaseUrl();

  const method = options.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET') {
    throw new Error('Session-authenticated web client is read-only and only supports GET requests');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message || payload?.error || `Request failed with status ${response.status}`;
    const code = payload?.error?.code;
    throw new ApiError(response.status, message, code);
  }

  return (await response.json()) as T;
}

export function validateSessionBootstrap(
  input: Partial<SessionBootstrapState>
): SessionBootstrapState {
  const token = input.token?.trim() ?? '';
  const walletId = input.walletId?.trim() ?? '';
  const expiresAt = input.expiresAt?.trim() || null;

  if (!token) {
    return {
      token: null,
      walletId: walletId || null,
      expiresAt,
      error: 'Missing session token. Pass `token=sess_...` when loading the wallet embed.',
      source: 'missing',
    };
  }

  if (!token.startsWith('sess_')) {
    return {
      token: null,
      walletId: walletId || null,
      expiresAt,
      error: 'Invalid session token format. Wallet embeds only accept `sess_...` tokens.',
      source: 'invalid',
    };
  }

  if (!walletId) {
    return {
      token,
      walletId: null,
      expiresAt,
      error: 'Missing wallet identifier. Pass `wallet_id` alongside the session token.',
      source: 'missing',
    };
  }

  return {
    token,
    walletId,
    expiresAt,
    error: null,
    source: 'query',
  };
}

export function fetchWallet(walletId: string, token: string): Promise<WalletDto> {
  return requestJson<WalletDto>(`/wallets/${encodeURIComponent(walletId)}`, token);
}

export function fetchLedgerActivities(
  walletId: string,
  token: string,
  filters: LedgerActivityFilters,
  cursor?: string | null,
  limit = 20
): Promise<LedgerActivityListDto> {
  const params = new URLSearchParams({
    wallet_id: walletId,
    limit: String(limit),
  });

  if (cursor) params.set('after', cursor);
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.from && !isNaN(Date.parse(filters.from))) params.set('from', filters.from);
  if (filters.to && !isNaN(Date.parse(filters.to))) params.set('to', filters.to);

  return requestJson<LedgerActivityListDto>(`/transactions?${params.toString()}`, token);
}

export function fetchTransactionDetail(txId: string, token: string): Promise<TransactionDetailDto> {
  return requestJson<TransactionDetailDto>(`/transactions/${encodeURIComponent(txId)}`, token);
}
