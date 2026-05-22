import { API_BASE_URL } from './supabase';
import { getAdminToken, setAdminSession } from './adminSession';
import { mapErrorCodeToMessage } from './errorMap';

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: object;
  signal?: AbortSignal;
  requireIdempotencyKey?: boolean;
  fallbackMessage: string;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function buildQueryString(query?: object): string {
  if (!query) return '';

  const queryParams = new URLSearchParams();
  Object.entries(query as Record<string, unknown>).forEach(([key, value]) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    ) {
      return;
    }
    queryParams.append(key, String(value));
  });

  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : '';
}

function getAuthToken(): string | null {
  return getAdminToken();
}

async function parseApiError(response: Response, fallbackMessage: string): Promise<never> {
  if (response.status === 401) {
    setAdminSession(null);
    throw new Error('Session expired. Please sign in again.');
  }

  try {
    const error = await response.json() as { error?: { code?: string; message?: string }; message?: string };
    const mappedMessage = mapErrorCodeToMessage(error.error?.code, fallbackMessage);
    throw new Error(mappedMessage || error.message || fallbackMessage);
  } catch (jsonError) {
    if (jsonError instanceof SyntaxError) {
      throw new Error(fallbackMessage);
    }
    throw jsonError;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  const token = getAuthToken();
  if (!token) throw new Error('No active session');

  const query = buildQueryString(options.query);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.requireIdempotencyKey) {
    headers['Idempotency-Key'] = generateUUID();
  }

  const response = await fetch(`${API_BASE_URL}${path}${query}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    return parseApiError(response, options.fallbackMessage);
  }

  return (await response.json()) as T;
}
