import React from 'react';
import { render, screen } from '@testing-library/react';
import Page from '../src/app/page';

jest.mock('../src/hooks/useWalletSession', () => ({
  useWalletSession: () => ({
    token: 'sess_demo',
    walletId: 'wallet_demo',
    expiresAt: null,
    error: null,
    source: 'query',
    isReady: true,
  }),
}));

jest.mock('../src/hooks/useWalletBalance', () => ({
  useWalletBalance: () => ({
    isLoading: false,
    data: {
      wallet_id: 'wallet_demo',
      external_user_id: 'user_123456',
      label: 'Zomato Credits',
      is_sandbox: true,
      balance: '125.0000',
      currency: 'INR',
      status: 'active',
      metadata: {},
    },
  }),
}));

jest.mock('../src/hooks/useLedgerActivities', () => ({
  useLedgerActivities: () => ({
    isLoading: false,
    data: {
      data: [
        {
          transaction_id: 'tx_demo_1',
          wallet_id: 'wallet_demo',
          type: 'credit',
          amount: '125.0000',
          balance_before: '0.0000',
          balance_after: '125.0000',
          description: 'Welcome credit',
          reference_id: 'order_123',
          idempotency_key: 'idem_123',
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ],
      next_cursor: null,
      total: 1,
    },
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useTransactionDetail', () => ({
  useTransactionDetail: () => ({
    isLoading: false,
    data: undefined,
    error: null,
  }),
}));

describe('Page', () => {
  it('renders wallet overview and quick stats', () => {
    render(<Page />);

    expect(screen.getByText('My Wallet')).toBeInTheDocument();
    expect(screen.getByText('Zomato Credits')).toBeInTheDocument();
    expect(screen.getByText('Total Earned')).toBeInTheDocument();
    expect(screen.getByText('Transaction history')).toBeInTheDocument();
  });
});
