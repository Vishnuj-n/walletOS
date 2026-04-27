import React from 'react';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from './BalanceCard';

describe('BalanceCard', () => {
  it('should render loading state', () => {
    render(<BalanceCard loading={true} />);

    expect(screen.getByText('Current Ledger Balance')).toBeInTheDocument();
  });

  it('should render wallet balance when data is available', () => {
    const mockWallet = {
      wallet_id: 'wallet_123',
      external_user_id: 'user_123',
      label: 'Test Wallet',
      balance: '125.0000',
      currency: 'INR',
      status: 'active',
      is_sandbox: true,
      metadata: {},
    };

    render(<BalanceCard wallet={mockWallet} loading={false} />);

    expect(screen.getByText('Current Ledger Balance')).toBeInTheDocument();
    expect(screen.getByText('INR 125.0000')).toBeInTheDocument();
    expect(screen.getByText('Status: active')).toBeInTheDocument();
  });

  it('should render nothing when wallet is not provided and not loading', () => {
    const { container } = render(<BalanceCard loading={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('should display currency and balance correctly', () => {
    const mockWallet = {
      wallet_id: 'wallet_123',
      external_user_id: 'user_123',
      label: 'Test Wallet',
      balance: '1000.5000',
      currency: 'USD',
      status: 'active',
      is_sandbox: false,
      metadata: {},
    };

    render(<BalanceCard wallet={mockWallet} loading={false} />);

    expect(screen.getByText('USD 1000.5000')).toBeInTheDocument();
  });

  it('should display wallet status correctly', () => {
    const mockWallet = {
      wallet_id: 'wallet_123',
      external_user_id: 'user_123',
      label: 'Test Wallet',
      balance: '100.0000',
      currency: 'INR',
      status: 'frozen',
      is_sandbox: true,
      metadata: {},
    };

    render(<BalanceCard wallet={mockWallet} loading={false} />);

    expect(screen.getByText('Status: frozen')).toBeInTheDocument();
  });
});
