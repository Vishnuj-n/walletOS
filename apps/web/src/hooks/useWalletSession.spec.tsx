import { renderHook, waitFor } from '@testing-library/react';
import { useWalletSession } from './useWalletSession';

const mockedUseSearchParams = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockedUseSearchParams(),
}));

describe('useWalletSession', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedUseSearchParams.mockReset();
  });

  it('reads session token from query params and persists it', async () => {
    mockedUseSearchParams.mockReturnValue(
      new URLSearchParams('token=sess_123&expires_at=2026-05-18T10:00:00.000Z')
    );

    const { result } = renderHook(() => useWalletSession());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.token).toBe('sess_123');
    expect(window.localStorage.getItem('walletos.session.token')).toBe('sess_123');
  });

  it('falls back to local storage when query params are absent', async () => {
    window.localStorage.setItem('walletos.session.token', 'sess_stored');
    mockedUseSearchParams.mockReturnValue(new URLSearchParams(''));

    const { result } = renderHook(() => useWalletSession());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.token).toBe('sess_stored');
  });

  it('returns an error for invalid session token format', async () => {
    mockedUseSearchParams.mockReturnValue(new URLSearchParams('token=bad_token'));

    const { result } = renderHook(() => useWalletSession());

    await waitFor(() => {
      expect(result.current.isReady).toBe(false);
    });

    expect(result.current.error).toMatch(/Invalid session token format/);
  });
});
