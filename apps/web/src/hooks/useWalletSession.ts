'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { SessionBootstrapState } from '../types/wallet';
import { validateSessionBootstrap } from '../lib/api-client';

const STORAGE_KEYS = {
  token: 'walletos.session.token',
  walletId: 'walletos.session.wallet_id',
  expiresAt: 'walletos.session.expires_at',
} as const;

export function useWalletSession(): SessionBootstrapState & { isReady: boolean } {
  const searchParams = useSearchParams();

  const state = useMemo(() => {
    const tokenFromQuery =
      searchParams.get('token') || searchParams.get('session_token') || searchParams.get('session');
    const walletIdFromQuery = searchParams.get('wallet_id');
    const expiresAtFromQuery = searchParams.get('expires_at');

    if (tokenFromQuery && walletIdFromQuery) {
      window.localStorage.setItem(STORAGE_KEYS.token, tokenFromQuery);
      window.localStorage.setItem(STORAGE_KEYS.walletId, walletIdFromQuery);
      if (expiresAtFromQuery) {
        window.localStorage.setItem(STORAGE_KEYS.expiresAt, expiresAtFromQuery);
      }
      const validated = validateSessionBootstrap({
        token: tokenFromQuery,
        walletId: walletIdFromQuery,
        expiresAt: expiresAtFromQuery || null,
      });
      return { ...validated, source: 'query' as const, isReady: !validated.error };
    }

    const fromStorage = validateSessionBootstrap({
      token: window.localStorage.getItem(STORAGE_KEYS.token),
      walletId: window.localStorage.getItem(STORAGE_KEYS.walletId),
      expiresAt: window.localStorage.getItem(STORAGE_KEYS.expiresAt) || null,
    });
    return { ...fromStorage, source: 'storage' as const, isReady: !fromStorage.error };
  }, [searchParams]);

  return state;
}
