import React from 'react';
import { render } from '@testing-library/react';
import Page from '../src/app/page';

jest.mock('../src/hooks/useWalletMount', () => ({
  useWalletMount: () => ({ walletId: 'wallet_demo', isReady: true }),
}));

jest.mock('../src/hooks/useWalletSession', () => ({
  useWalletSession: () => ({ isLoading: false, data: { token: 'sess_demo', expires_at: new Date().toISOString() } }),
}));

jest.mock('../src/hooks/useWalletBalance', () => ({
  useWalletBalance: () => ({
    isLoading: false,
    data: {
      wallet_id: 'wallet_demo',
      external_user_id: 'user_123456',
      is_sandbox: true,
      balance: '125.0000',
      currency: 'INR',
      status: 'active',
    },
  }),
}));

jest.mock('../src/hooks/useLedgerActivities', () => ({
  useLedgerActivities: () => ({ isLoading: false, data: { data: [], next_cursor: null } }),
}));

describe('Page', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<Page />);
    expect(baseElement).toBeTruthy();
  });
});
