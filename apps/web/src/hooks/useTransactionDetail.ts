'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchTransactionDetail } from '../lib/api-client';
import { walletQueryKeys } from '../lib/queries';

export function useTransactionDetail(txId: string | null, token?: string | null) {
  return useQuery({
    queryKey: walletQueryKeys.transaction(txId),
    queryFn: () => {
      if (!txId || !token) throw new Error('Transaction detail requires a session token and transaction id');
      return fetchTransactionDetail(txId, token);
    },
    enabled: Boolean(txId && token),
  });
}
