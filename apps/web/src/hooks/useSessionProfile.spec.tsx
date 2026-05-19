import React, { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionProfile } from './useSessionProfile';
import { fetchSessionProfile } from '../lib/api-client';

jest.mock('../lib/api-client', () => ({
  fetchSessionProfile: jest.fn(),
}));

describe('useSessionProfile', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  it('refetches the session profile when the session token changes', async () => {
    (fetchSessionProfile as jest.Mock).mockImplementation(async (token: string) => ({
      wallet: {
        wallet_id: token === 'sess_a' ? 'wallet_a' : 'wallet_b',
      },
    }));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(
      ({ token }) => useSessionProfile(token),
      {
        wrapper,
        initialProps: { token: 'sess_a' as string | null },
      }
    );

    await waitFor(() => {
      expect(result.current.data?.wallet.wallet_id).toBe('wallet_a');
    });

    rerender({ token: 'sess_b' });

    await waitFor(() => {
      expect(result.current.data?.wallet.wallet_id).toBe('wallet_b');
    });

    expect(fetchSessionProfile).toHaveBeenNthCalledWith(1, 'sess_a');
    expect(fetchSessionProfile).toHaveBeenNthCalledWith(2, 'sess_b');
    expect(fetchSessionProfile).toHaveBeenCalledTimes(2);
  });
});
