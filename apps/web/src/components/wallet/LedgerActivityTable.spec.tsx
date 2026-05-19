import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LedgerActivityTable } from './LedgerActivityTable';
import { LedgerActivityDto } from '../../types/wallet';

describe('LedgerActivityTable', () => {
  const mockActivities: LedgerActivityDto[] = [
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
      created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    },
  ];

  it('renders loading state', () => {
    const { container } = render(
      <LedgerActivityTable
        items={[]}
        currency="INR"
        loading={true}
        error={null}
        nextCursor={null}
        total={0}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
        onRetry={jest.fn()}
        onSelect={jest.fn()}
      />
    );

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('renders activities and opens selection callback', () => {
    const onSelect = jest.fn();
    render(
      <LedgerActivityTable
        items={mockActivities}
        currency="INR"
        loading={false}
        error={null}
        nextCursor={null}
        total={1}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
        onRetry={jest.fn()}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open details/i }));
    expect(onSelect).toHaveBeenCalledWith('tx_1');
  });

  it('renders empty state copy when no activities exist', () => {
    render(
      <LedgerActivityTable
        items={[]}
        currency="INR"
        loading={false}
        error={null}
        nextCursor={null}
        total={0}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
        onRetry={jest.fn()}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('renders retry action for error states', () => {
    const onRetry = jest.fn();
    render(
      <LedgerActivityTable
        items={[]}
        currency="INR"
        loading={false}
        error="Failed"
        nextCursor={null}
        total={0}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
        onRetry={onRetry}
        onSelect={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables pagination buttons appropriately', () => {
    const { rerender } = render(
      <LedgerActivityTable
        items={[]}
        currency="INR"
        loading={false}
        error={null}
        nextCursor={null}
        total={0}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
        onRetry={jest.fn()}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('Previous').closest('button')).toBeDisabled();
    expect(screen.getByText('Next').closest('button')).toBeDisabled();

    rerender(
      <LedgerActivityTable
        items={[]}
        currency="INR"
        loading={false}
        error={null}
        nextCursor={'abc'}
        total={0}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={true}
        onRetry={jest.fn()}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('Previous').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Next').closest('button')).not.toBeDisabled();
  });
});
