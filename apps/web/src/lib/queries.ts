import { LedgerActivityFilters } from '../types/wallet';

export const walletQueryKeys = {
  wallet: (walletId: string, token?: string | null) => ['wallet', walletId, token ?? null] as const,
  // include `token` in the key when provided to avoid cross-session caching
  activities: (
    walletId: string,
    cursor: string | null,
    filters: LedgerActivityFilters,
    token?: string | null
  ) => {
    const key: Array<string | number | null> = ['wallet-activities', walletId, token ?? null, cursor];
    if (filters.type && filters.type !== 'all') key.push(filters.type);
    if (filters.from) key.push(filters.from);
    if (filters.to) key.push(filters.to);
    return key;
  },
  transaction: (txId: string | null, token?: string | null) => ['wallet-transaction', txId, token ?? null] as const,
};
