import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManualActionsPage from '../src/app/dashboard/actions/page';
import { creditWallet, debitWallet, reverseTransaction } from '../src/services/adminService';

// Mock the admin service
jest.mock('../src/services/adminService');

// Mock useSearchParams
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

const { useSearchParams } = require('next/navigation');

describe('ManualActionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(null),
    });
  });

  it('should render successfully', () => {
    const { baseElement } = render(<ManualActionsPage />);
    expect(baseElement).toBeTruthy();
  });

  it('should display Manual Actions heading', () => {
    render(<ManualActionsPage />);
    expect(screen.getByText('Manual Actions')).toBeInTheDocument();
  });

  it('should have three action type buttons', () => {
    render(<ManualActionsPage />);
    expect(screen.getByText('Credit')).toBeInTheDocument();
    expect(screen.getByText('Debit')).toBeInTheDocument();
    expect(screen.getByText('Reversal')).toBeInTheDocument();
  });

  it('should switch to debit action type when Debit button is clicked', () => {
    render(<ManualActionsPage />);
    const debitButton = screen.getByText('Debit');
    fireEvent.click(debitButton);
    expect(debitButton).toHaveClass('bg-indigo-600', 'text-white');
  });

  it('should switch to reversal action type when Reversal button is clicked', () => {
    render(<ManualActionsPage />);
    const reversalButton = screen.getByText('Reversal');
    fireEvent.click(reversalButton);
    expect(reversalButton).toHaveClass('bg-indigo-600', 'text-white');
  });

  it('should show wallet ID, amount, description, reference ID, and reason fields for credit action', () => {
    render(<ManualActionsPage />);
    expect(screen.getByPlaceholderText('Enter wallet ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter amount')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter reference ID (optional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter reason for this action')).toBeInTheDocument();
  });

  it('should show transaction ID field instead of wallet ID for reversal action', () => {
    render(<ManualActionsPage />);
    const reversalButton = screen.getByText('Reversal');
    fireEvent.click(reversalButton);
    expect(screen.getByPlaceholderText('Enter transaction ID to reverse')).toBeInTheDocument();
  });

  it('should call creditWallet with correct parameters when credit form is submitted', async () => {
    (creditWallet as jest.Mock).mockResolvedValue({
      transaction_id: 'test-tx-id',
    });

    render(<ManualActionsPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter wallet ID'), {
      target: { value: 'wallet-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), {
      target: { value: '100.00' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter description'), {
      target: { value: 'Test credit' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter reason for this action'), {
      target: { value: 'Test reason' },
    });

    const submitButton = screen.getByText('Submit credit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(creditWallet).toHaveBeenCalledWith({
        wallet_id: 'wallet-123',
        amount: '100.00',
        description: 'Test credit',
        reference_id: undefined,
        reason: 'Test reason',
      });
    });
  });

  it('should call debitWallet with correct parameters when debit form is submitted', async () => {
    (debitWallet as jest.Mock).mockResolvedValue({
      transaction_id: 'test-tx-id',
    });

    render(<ManualActionsPage />);

    const debitButton = screen.getByText('Debit');
    fireEvent.click(debitButton);

    fireEvent.change(screen.getByPlaceholderText('Enter wallet ID'), {
      target: { value: 'wallet-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), {
      target: { value: '50.00' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter description'), {
      target: { value: 'Test debit' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter reason for this action'), {
      target: { value: 'Test reason' },
    });

    const submitButton = screen.getByText('Submit debit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(debitWallet).toHaveBeenCalledWith({
        wallet_id: 'wallet-123',
        amount: '50.00',
        description: 'Test debit',
        reference_id: undefined,
        reason: 'Test reason',
      });
    });
  });

  it('should call reverseTransaction with correct parameters when reversal form is submitted', async () => {
    (reverseTransaction as jest.Mock).mockResolvedValue({
      transaction_id: 'reversal-tx-id',
    });

    render(<ManualActionsPage />);

    const reversalButton = screen.getByText('Reversal');
    fireEvent.click(reversalButton);

    const transactionInput = screen.getByPlaceholderText('Enter transaction ID to reverse');
    fireEvent.change(transactionInput, {
      target: { value: 'tx-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter reason for this action'), {
      target: { value: 'Test reversal reason' },
    });

    const submitButton = screen.getByText('Submit reversal');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(reverseTransaction).toHaveBeenCalledWith('tx-123', {
        reason: 'Test reversal reason',
      });
    });
  });

  it('should display success message after successful credit transaction', async () => {
    (creditWallet as jest.Mock).mockResolvedValue({
      transaction_id: 'test-tx-id',
    });

    render(<ManualActionsPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter wallet ID'), {
      target: { value: 'wallet-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), {
      target: { value: '100.00' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter description'), {
      target: { value: 'Test credit' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter reason for this action'), {
      target: { value: 'Test reason' },
    });

    const submitButton = screen.getByText('Submit credit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/credit completed successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/test-tx-id/i)).toBeInTheDocument();
    });
  });

  it('should display error message when credit transaction fails', async () => {
    (creditWallet as jest.Mock).mockRejectedValue(
      new Error('Insufficient balance')
    );

    render(<ManualActionsPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter wallet ID'), {
      target: { value: 'wallet-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), {
      target: { value: '100.00' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter description'), {
      target: { value: 'Test credit' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter reason for this action'), {
      target: { value: 'Test reason' },
    });

    const submitButton = screen.getByText('Submit credit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Insufficient balance/i)).toBeInTheDocument();
    });
  });

  it('should show important notes section', () => {
    render(<ManualActionsPage />);
    expect(screen.getByText(/Important Notes/i)).toBeInTheDocument();
    expect(screen.getByText(/All manual actions are logged/i)).toBeInTheDocument();
    expect(screen.getByText(/Reason field is mandatory/i)).toBeInTheDocument();
  });

  it('should pre-fill wallet ID from URL search params', () => {
    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue('wallet-from-url'),
    });

    render(<ManualActionsPage />);
    const walletInput = screen.getByPlaceholderText('Enter wallet ID') as HTMLInputElement;
    expect(walletInput.value).toBe('wallet-from-url');
  });

  it('should disable submit button while loading', async () => {
    let resolvePromise: (value: any) => void;
    (creditWallet as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
    );

    render(<ManualActionsPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter wallet ID'), {
      target: { value: 'wallet-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), {
      target: { value: '100.00' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter description'), {
      target: { value: 'Test credit' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter reason for this action'), {
      target: { value: 'Test reason' },
    });

    const submitButton = screen.getByText('Submit credit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    resolvePromise!({ transaction_id: 'test-tx-id' });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });
});
