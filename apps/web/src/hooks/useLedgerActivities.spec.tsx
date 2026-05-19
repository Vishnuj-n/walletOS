import React, { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLedgerActivities } from './useLedgerActivities';
import { fetchLedgerActivities } from '../lib/api-client';

jest.mock('../lib/api-client', () => ({
  fetchLedgerActivities: jest.fn(),
}));

describe('useLedgerActivities', () => {
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

  it('fetches filtered ledger activities with 20 rows per page', async () => {
    (fetchLedgerActivities as jest.Mock).mockResolvedValue({
      data: [],
      next_cursor: null,
      total: 0,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useLedgerActivities(
          'wallet_123',
          'sess_test_token',
          { type: 'credit', from: '2026-05-01', to: '2026-05-31' },
          null
        ),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchLedgerActivities).toHaveBeenCalledWith(
      'wallet_123',
      'sess_test_token',
      { type: 'credit', from: '2026-05-01', to: '2026-05-31' },
      null,
      20
    );
  });
});
