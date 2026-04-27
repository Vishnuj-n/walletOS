'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchLedgerActivities } from '../lib/api-client';
import { walletQueryKeys } from '../lib/queries';

export function useLedgerActivities(walletId: string, token?: string, cursor: string | null = null) {
  return useQuery({
    queryKey: walletQueryKeys.activities(walletId, cursor),
    queryFn: () => fetchLedgerActivities(walletId, token!, cursor, 20),
    enabled: Boolean(walletId && token),
    keepPreviousData: true,
  });
}
