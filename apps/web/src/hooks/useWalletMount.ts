'use client';

import { useWalletSession } from './useWalletSession';

export function useWalletMount() {
  const session = useWalletSession();

  return {
    walletId: session.walletId ?? '',
    token: session.token,
    isReady: session.isReady,
    error: session.error,
  };
}
