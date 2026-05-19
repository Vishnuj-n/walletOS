'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchLedgerActivities } from '../lib/api-client';
import { walletQueryKeys } from '../lib/queries';
import { LedgerActivityFilters } from '../types/wallet';

export function useLedgerActivities(
  walletId: string,
  token: string | null | undefined,
  filters: LedgerActivityFilters,
  cursor: string | null = null
) {
  return useQuery({
    queryKey: walletQueryKeys.activities(walletId, cursor, filters, token),
    queryFn: () => {
      if (!token) throw new Error('Session token is required');
      return fetchLedgerActivities(walletId, token, filters, cursor, 20);
    },
    enabled: Boolean(walletId && token),
    placeholderData: keepPreviousData,
  });
}
