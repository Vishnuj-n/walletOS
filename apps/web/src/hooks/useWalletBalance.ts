'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWallet } from '../lib/api-client';
import { walletQueryKeys } from '../lib/queries';

export function useWalletBalance(walletId: string, token?: string) {
  return useQuery({
    queryKey: walletQueryKeys.wallet(walletId),
    queryFn: () => fetchWallet(walletId, token!),
    enabled: Boolean(walletId && token),
    // TODO: Replace with WebSockets or Server-Sent Events (SSE) for better scalability
    // Current 10-second polling will degrade database performance under high concurrency
    refetchInterval: 30000,
  });
}
