'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SessionBootstrapState } from '../types/wallet';
import { validateSessionBootstrap } from '../lib/api-client';

const STORAGE_KEYS = {
  token: 'walletos.session.token',
  walletId: 'walletos.session.wallet_id',
  expiresAt: 'walletos.session.expires_at',
} as const;

const INITIAL_STATE: SessionBootstrapState & { isReady: boolean } = {
  error: null,
  isReady: false,
};

export function useWalletSession(): SessionBootstrapState & { isReady: boolean } {
  const searchParams = useSearchParams();
  const [state, setState] = useState<SessionBootstrapState & { isReady: boolean }>(INITIAL_STATE);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
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
      setState({ ...validated, source: 'query' as const, isReady: !validated.error });
    } else {
      const fromStorage = validateSessionBootstrap({
        token: window.localStorage.getItem(STORAGE_KEYS.token),
        walletId: window.localStorage.getItem(STORAGE_KEYS.walletId),
        expiresAt: window.localStorage.getItem(STORAGE_KEYS.expiresAt) || null,
      });
      setState({ ...fromStorage, source: 'storage' as const, isReady: !fromStorage.error });
    }

    setHasHydrated(true);
  }, [searchParams]);

  // Return initial state during hydration to prevent mismatch
  if (!hasHydrated) {
    return INITIAL_STATE;
  }

  return state;
}
