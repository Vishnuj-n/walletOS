import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LedgerActivityTable } from './LedgerActivityTable';

describe('LedgerActivityTable', () => {
  const mockActivities = [
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
    {
      transaction_id: 'tx_2',
      wallet_id: 'wallet_123',
      type: 'debit',
      amount: '50.0000',
      balance_before: '100.0000',
      balance_after: '50.0000',
      description: 'Test debit',
      reference_id: 'ref_2',
      idempotency_key: 'idem_2',
      metadata: {},
      created_at: new Date('2024-01-02T00:00:00Z').toISOString(),
    },
  ];

  it('should render loading state', () => {
    render(
      <LedgerActivityTable
        items={[]}
        loading={true}
        nextCursor={null}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
      />
    );

    expect(screen.getByText('Recent Ledger Activity')).toBeInTheDocument();
    expect(screen.getByText('20 per page')).toBeInTheDocument();
  });

  it('should render activities when data is available', () => {
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor={null}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
      />
    );

    expect(screen.getByText('Recent Ledger Activity')).toBeInTheDocument();
    expect(screen.getByText('credit')).toBeInTheDocument();
    expect(screen.getByText('debit')).toBeInTheDocument();
    expect(screen.getByText('Test credit')).toBeInTheDocument();
    expect(screen.getByText('Test debit')).toBeInTheDocument();
  });

  it('should render empty state when no activities', () => {
    render(
      <LedgerActivityTable
        items={[]}
        loading={false}
        nextCursor={null}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
      />
    );

    expect(screen.getByText('No activities available yet.')).toBeInTheDocument();
  });

  it('should disable next button when there is no next cursor', () => {
    const onNextPage = jest.fn();
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor={null}
        onNextPage={onNextPage}
        onPrevPage={jest.fn()}
        canGoBack={false}
      />
    );

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeDisabled();
    fireEvent.click(nextButton);
    expect(onNextPage).not.toHaveBeenCalled();
  });

  it('should enable next button when there is a next cursor', () => {
    const onNextPage = jest.fn();
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor='cursor_123'
        onNextPage={onNextPage}
        onPrevPage={jest.fn()}
        canGoBack={false}
      />
    );

    const nextButton = screen.getByText('Next');
    expect(nextButton).not.toBeDisabled();
  });

  it('should call onNextPage when next button is clicked', () => {
    const onNextPage = jest.fn();
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor='cursor_123'
        onNextPage={onNextPage}
        onPrevPage={jest.fn()}
        canGoBack={false}
      />
    );

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    expect(onNextPage).toHaveBeenCalledTimes(1);
  });

  it('should disable previous button when canGoBack is false', () => {
    const onPrevPage = jest.fn();
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor={null}
        onNextPage={jest.fn()}
        onPrevPage={onPrevPage}
        canGoBack={false}
      />
    );

    const prevButton = screen.getByText('Previous');
    expect(prevButton).toBeDisabled();
    fireEvent.click(prevButton);
    expect(onPrevPage).not.toHaveBeenCalled();
  });

  it('should enable previous button when canGoBack is true', () => {
    const onPrevPage = jest.fn();
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor={null}
        onNextPage={jest.fn()}
        onPrevPage={onPrevPage}
        canGoBack={true}
      />
    );

    const prevButton = screen.getByText('Previous');
    expect(prevButton).not.toBeDisabled();
  });

  it('should call onPrevPage when previous button is clicked', () => {
    const onPrevPage = jest.fn();
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor={null}
        onNextPage={jest.fn()}
        onPrevPage={onPrevPage}
        canGoBack={true}
      />
    );

    const prevButton = screen.getByText('Previous');
    fireEvent.click(prevButton);
    expect(onPrevPage).toHaveBeenCalledTimes(1);
  });

  it('should display table headers correctly', () => {
    render(
      <LedgerActivityTable
        items={mockActivities}
        loading={false}
        nextCursor={null}
        onNextPage={jest.fn()}
        onPrevPage={jest.fn()}
        canGoBack={false}
      />
    );

    expect(screen.getByText('TYPE')).toBeInTheDocument();
    expect(screen.getByText('AMOUNT')).toBeInTheDocument();
    expect(screen.getByText('DESCRIPTION')).toBeInTheDocument();
    expect(screen.getByText('CREATED')).toBeInTheDocument();
  });
});
