import React, { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLedgerActivities } from './useLedgerActivities';
import { fetchLedgerActivities } from '../lib/api-client';

// Mock the api-client
jest.mock('../lib/api-client');
const mockedFetchLedgerActivities = jest.mocked(fetchLedgerActivities);

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

  it('should fetch ledger activities with 20 rows per page', async () => {
    const mockActivities = {
      data: [
        {
          transaction_id: 'tx_1',
          wallet_id: 'wallet_123',
          type: 'credit',
          amount: '100.0000',
          balance_before: '0.0000',
          balance_after: '100.0000',
          description: 'Test credit',
          reference_id: 'ref_1',
          idempotency_key: 'idem_1',
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ],
      next_cursor: 'cursor_123',
      total: 1,
    };
    mockedFetchLedgerActivities.mockResolvedValue(mockActivities);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useLedgerActivities('wallet_123', 'sess_test_token', null),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchLedgerActivities).toHaveBeenCalledWith('wallet_123', 'sess_test_token', null, 20);
    expect(result.current.data).toEqual(mockActivities);
  });

  it('should fetch ledger activities with cursor for pagination', async () => {
    const mockActivities = {
      data: [],
      next_cursor: null,
      total: 0,
    };
    mockedFetchLedgerActivities.mockResolvedValue(mockActivities);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useLedgerActivities('wallet_123', 'sess_test_token', 'cursor_123'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchLedgerActivities).toHaveBeenCalledWith(
      'wallet_123',
      'sess_test_token',
      'cursor_123',
      20
    );
  });

  it('should not be enabled if walletId is missing', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useLedgerActivities('', 'sess_test_token', null), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchLedgerActivities).not.toHaveBeenCalled();
  });

  it('should not be enabled if token is missing', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useLedgerActivities('wallet_123', undefined, null), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchLedgerActivities).not.toHaveBeenCalled();
  });

  it('should keep previous data when refetching', async () => {
    const mockActivities1 = {
      data: [{ transaction_id: 'tx_1' }],
      next_cursor: 'cursor_1',
      total: 1,
    };
    const mockActivities2 = {
      data: [{ transaction_id: 'tx_2' }],
      next_cursor: 'cursor_2',
      total: 1,
    };
    mockedFetchLedgerActivities
      .mockResolvedValueOnce(mockActivities1)
      .mockResolvedValueOnce(mockActivities2);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(
      ({ cursor }) => useLedgerActivities('wallet_123', 'sess_test_token', cursor),
      {
        wrapper,
        initialProps: { cursor: null as string | null },
      }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const firstData = result.current.data;

    // Change cursor to trigger refetch
    rerender({ cursor: 'cursor_1' });

    // Should keep previous data while loading
    expect(result.current.data).toEqual(firstData);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('should handle fetch errors', async () => {
    mockedFetchLedgerActivities.mockRejectedValue(
      new Error('Activities fetch failed')
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useLedgerActivities('wallet_123', 'sess_test_token', null),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
