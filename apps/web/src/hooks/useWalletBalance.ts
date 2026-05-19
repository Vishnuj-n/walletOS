'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWallet } from '../lib/api-client';
import { walletQueryKeys } from '../lib/queries';

export function useWalletBalance(walletId: string, token?: string | null) {
  const pollingInterval = process.env.NEXT_PUBLIC_WALLET_POLL_INTERVAL
    ? parseInt(process.env.NEXT_PUBLIC_WALLET_POLL_INTERVAL, 10)
    : 10_000;

  return useQuery({
    queryKey: walletQueryKeys.wallet(walletId, token),
    queryFn: () => {
      if (!token) throw new Error('Session token is required');
      return fetchWallet(walletId, token);
    },
    enabled: Boolean(walletId && token),
    refetchInterval: pollingInterval,
  });
}
