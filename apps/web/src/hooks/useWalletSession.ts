'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fetchSessionForWallet } from '../lib/api-client';
import { walletQueryKeys } from '../lib/queries';

export function useWalletSession(walletId: string) {
  const query = useQuery({
    queryKey: walletQueryKeys.session(walletId),
    queryFn: () => fetchSessionForWallet(walletId),
    enabled: Boolean(walletId),
  });

  useEffect(() => {
    if (!query.data?.expires_at) return;

    const expiresAt = new Date(query.data.expires_at).getTime();
    const refreshInMs = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 0);
    const timerId = window.setTimeout(() => {
      void query.refetch();
    }, refreshInMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [query.data?.expires_at, query.refetch]);

  return query;
}
