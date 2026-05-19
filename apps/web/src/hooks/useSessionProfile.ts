import { useQuery } from '@tanstack/react-query';
import { fetchSessionProfile } from '../lib/api-client';
import { WalletDto } from '../types/wallet';

const sessionQueryKeys = {
  all: ['session'] as const,
  profile: (token?: string | null) => [...sessionQueryKeys.all, 'profile', token ?? null] as const,
};

export function useSessionProfile(token?: string | null) {
  return useQuery<{ wallet: WalletDto } | undefined>({
    queryKey: sessionQueryKeys.profile(token),
    queryFn: () => {
      if (!token) return undefined;
      return fetchSessionProfile(token);
    },
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

export function useWalletIdFromSession(token?: string | null) {
  const { data, isLoading, error } = useSessionProfile(token);
  return {
    walletId: data?.wallet.wallet_id ?? data?.wallet.id,
    isLoading,
    error,
  };
}
