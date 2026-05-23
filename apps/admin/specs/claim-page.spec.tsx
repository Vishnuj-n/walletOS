import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Page from '../src/app/claim/page';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('../src/lib/supabase', () => ({
  API_BASE_URL: 'http://api.test',
}));

const { useRouter, useSearchParams } = require('next/navigation');

describe('ClaimAccountPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
      refresh: jest.fn(),
    });
    (useSearchParams as jest.Mock).mockReturnValue({
      get: (name: string) => (name === 'token' ? 'e1c116b031968daa8d7fbe1539c920fb878e9cf0fa7cf51f14323e71b25ecd86' : null),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response);
  });

  it('submits the claim form when Activate Account is clicked', async () => {
    render(<Page />);

    fireEvent.change(screen.getByPlaceholderText('Create password'), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), {
      target: { value: 'Password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Activate Account' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('http://api.test/auth/claim-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'e1c116b031968daa8d7fbe1539c920fb878e9cf0fa7cf51f14323e71b25ecd86',
          password: 'Password123',
        }),
      });
    });
  });
});