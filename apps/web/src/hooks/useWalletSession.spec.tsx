import React, { act } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWalletSession } from './useWalletSession';
import { fetchSessionForWallet } from '../lib/api-client';

// Mock the api-client
jest.mock('../lib/api-client');

describe('useWalletSession', () => {
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
    jest.useFakeTimers({ doNotFake: ['setInterval'] });
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should fetch session token for wallet', async () => {
    const mockSession = {
      token: 'sess_test_token',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      wallet_id: 'wallet_123',
    };
    (fetchSessionForWallet as jest.Mock).mockResolvedValue(mockSession);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletSession('wallet_123'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSessionForWallet).toHaveBeenCalledWith('wallet_123');
    expect(result.current.data).toEqual(mockSession);
  });

  it('should schedule refresh 5 minutes before expiry', async () => {
    const now = Date.now();
    const oneHourFromNow = now + 60 * 60 * 1000;
    const refreshDelay = oneHourFromNow - now - 5 * 60 * 1000; // 55 minutes

    const mockSession = {
      token: 'sess_test_token',
      expires_at: new Date(oneHourFromNow).toISOString(),
      wallet_id: 'wallet_123',
    };
    (fetchSessionForWallet as jest.Mock).mockResolvedValue(mockSession);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletSession('wallet_123'), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Fast-forward to the scheduled refresh point (5 minutes before expiry)
    act(() => {
      jest.advanceTimersByTime(refreshDelay);
    });

    await waitFor(() => {
      expect(fetchSessionForWallet).toHaveBeenCalledTimes(2);
    });
  });

  it('should not schedule refresh if expires_at is missing', async () => {
    const mockSession = {
      token: 'sess_test_token',
      wallet_id: 'wallet_123',
    };
    (fetchSessionForWallet as jest.Mock).mockResolvedValue(mockSession);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useWalletSession('wallet_123'), { wrapper });

    await waitFor(() => {
      expect(fetchSessionForWallet).toHaveBeenCalledTimes(1);
    });

    // Fast-forward significantly - should not trigger refresh
    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1000);
    });

    expect(fetchSessionForWallet).toHaveBeenCalledTimes(1);
  });

  it('should not be enabled if walletId is empty', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletSession(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSessionForWallet).not.toHaveBeenCalled();
  });

  it('should handle fetch errors', async () => {
    (fetchSessionForWallet as jest.Mock).mockRejectedValue(new Error('Session fetch failed'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletSession('wallet_123'), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
