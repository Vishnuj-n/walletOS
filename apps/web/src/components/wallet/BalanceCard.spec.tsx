import React from 'react';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from './BalanceCard';
import { WalletDto } from '../../types/wallet';

describe('BalanceCard', () => {
  it('renders loading state', () => {
    const { container } = render(<BalanceCard loading={true} />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('renders wallet balance, label, and status when data is available', () => {
    const mockWallet: WalletDto = {
      wallet_id: 'wallet_123',
      external_user_id: 'user_123',
      label: 'Rewards Wallet',
      balance: '125.0000',
      currency: 'INR',
      status: 'active',
      is_sandbox: true,
      metadata: {},
    };

    render(<BalanceCard wallet={mockWallet} loading={false} lastUpdatedAt="2024-01-02T00:00:00.000Z" />);

    expect(screen.getByText('Wallet balance')).toBeInTheDocument();
    expect(screen.getByText('Rewards Wallet')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
