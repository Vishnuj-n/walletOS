import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClaimPage from '../src/app/claim/page';

const mockPush = jest.fn();
const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();
const mockRefreshSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  API_BASE_URL: 'http://localhost:3333/api/v1',
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: mockPush })),
  useSearchParams: jest.fn(() => ({
    get: (key: string) => (key === 'tenant_id' ? 'tenant-123' : null),
  })),
}));

describe('ClaimPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    window.history.replaceState({}, '', 'http://localhost/claim?tenant_id=tenant-123');
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows a missing-session state when no invite session is present', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    render(<ClaimPage />);

    expect(await screen.findByText(/open the latest invite link again/i)).toBeInTheDocument();
  });

  it('shows an expired-invite state when the Supabase callback reports otp_expired', async () => {
    window.history.replaceState(
      {},
      '',
      'http://localhost/claim?tenant_id=tenant-123#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );

    render(<ClaimPage />);

    expect(await screen.findByText(/this invite link has expired/i)).toBeInTheDocument();
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('claims the invite, refreshes the session, and redirects to the dashboard', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'invite-session-token',
        },
      },
    });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockRefreshSession.mockResolvedValue({ error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tenant_id: 'tenant-123',
        email: 'invited-admin@test.com',
        role: 'tenant_admin',
        activated_at: '2026-05-20T00:00:00.000Z',
      }),
    }) as jest.Mock;

    render(<ClaimPage />);

    fireEvent.change(await screen.findByLabelText(/new password/i), {
      target: { value: 'supersafepassword' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'supersafepassword' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /claim access/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'supersafepassword' });
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3333/api/v1/admin/invitations/activate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer invite-session-token',
          }),
        })
      );
    });
    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled();
    });

    jest.advanceTimersByTime(800);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('maps already-activated invite responses into a clear terminal state', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'invite-session-token',
        },
      },
    });
    mockUpdateUser.mockResolvedValue({ error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          message: 'Invite has already been activated',
        },
      }),
    }) as jest.Mock;

    render(<ClaimPage />);

    fireEvent.change(await screen.findByLabelText(/new password/i), {
      target: { value: 'supersafepassword' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'supersafepassword' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /claim access/i }));

    expect(await screen.findByText(/invite has already been activated/i)).toBeInTheDocument();
  });
});
