'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWallet } from '../lib/api-client';
import { walletQueryKeys } from '../lib/queries';

export function useWalletBalance(walletId: string, token?: string) {
  return useQuery({
    queryKey: walletQueryKeys.wallet(walletId),
    queryFn: () => fetchWallet(walletId, token!),
    enabled: Boolean(walletId && token),
    refetchInterval: 10_000,
  });
}
