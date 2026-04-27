'use client';

import { useSearchParams } from 'next/navigation';

export function useWalletMount() {
  const searchParams = useSearchParams();
  const walletId = searchParams.get('wallet_id') || process.env.NEXT_PUBLIC_DEMO_WALLET_ID || '';

  return {
    walletId,
    isReady: walletId.length > 0,
  };
}
