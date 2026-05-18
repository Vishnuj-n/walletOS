import { LedgerActivityFilters } from '../types/wallet';

export const walletQueryKeys = {
  wallet: (walletId: string) => ['wallet', walletId] as const,
  activities: (walletId: string, cursor: string | null, filters: LedgerActivityFilters) => {
    const key: any[] = ['wallet-activities', walletId, cursor];
    if (filters.type && filters.type !== 'all') key.push(filters.type);
    if (filters.from) key.push(filters.from);
    if (filters.to) key.push(filters.to);
    return key as const;
  },
  transaction: (txId: string | null) => ['wallet-transaction', txId] as const,
};
