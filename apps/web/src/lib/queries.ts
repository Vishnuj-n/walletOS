export const walletQueryKeys = {
  session: (walletId: string) => ['wallet-session', walletId] as const,
  wallet: (walletId: string) => ['wallet', walletId] as const,
  activities: (walletId: string, cursor: string | null) =>
    ['wallet-activities', walletId, cursor] as const,
};
