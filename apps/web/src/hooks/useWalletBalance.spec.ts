import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWalletBalance } from './useWalletBalance';

// Mock the api-client
jest.mock('../lib/api-client', () => ({
  fetchWallet: jest.fn(),
}));

const { fetchWallet } = require('../lib/api-client');

describe('useWalletBalance', () => {
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

  it('should fetch wallet balance when walletId and token are provided', async () => {
    const mockWallet = {
      wallet_id: 'wallet_123',
      external_user_id: 'user_123',
      label: 'Test Wallet',
      balance: '100.0000',
      currency: 'INR',
      status: 'active',
      is_sandbox: true,
      metadata: {},
    };
    (fetchWallet as jest.Mock).mockResolvedValue(mockWallet);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletBalance('wallet_123', 'sess_test_token'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchWallet).toHaveBeenCalledWith('wallet_123', 'sess_test_token');
    expect(result.current.data).toEqual(mockWallet);
  });

  it('should not be enabled if walletId is missing', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletBalance('', 'sess_test_token'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchWallet).not.toHaveBeenCalled();
  });

  it('should not be enabled if token is missing', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletBalance('wallet_123', undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchWallet).not.toHaveBeenCalled();
  });

  it('should handle loading state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletBalance('wallet_123', 'sess_test_token'), {
      wrapper,
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('should handle fetch errors', async () => {
    (fetchWallet as jest.Mock).mockRejectedValue(new Error('Wallet fetch failed'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useWalletBalance('wallet_123', 'sess_test_token'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
