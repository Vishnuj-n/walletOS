import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuditLogPage from '../src/app/dashboard/audit/page';
import { fetchAuditLogs } from '../src/services/adminService';

// Mock the admin service
jest.mock('../src/services/adminService');

describe('AuditLogPage', () => {
  const mockAuditLogs = [
    {
      id: '1',
      tenant_id: 'tenant-1',
      wallet_id: 'wallet-1',
      action: 'credit',
      actor: 'admin@example.com',
      changes: { amount: '100.00' },
      timestamp: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      tenant_id: 'tenant-1',
      wallet_id: 'wallet-2',
      action: 'debit',
      actor: 'admin@example.com',
      changes: { amount: '50.00' },
      timestamp: '2024-01-02T00:00:00Z',
    },
    {
      id: '3',
      tenant_id: 'tenant-1',
      wallet_id: 'wallet-1',
      action: 'freeze',
      actor: 'admin@example.com',
      changes: { status: 'frozen' },
      timestamp: '2024-01-03T00:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render successfully', () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    const { baseElement } = render(<AuditLogPage />);
    expect(baseElement).toBeTruthy();
  });

  it('should display Audit Log heading', () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  it('should display filter inputs', () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);
    expect(screen.getByPlaceholderText('Filter by entity ID...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filter by action...')).toBeInTheDocument();
  });

  it('should call fetchAuditLogs on mount with no filters', () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);
    expect(fetchAuditLogs).toHaveBeenCalledWith({});
  });

  it('should display audit logs in a table', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue(mockAuditLogs);
    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    });
  });

  it('should display action badges with correct colors', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue(mockAuditLogs);
    render(<AuditLogPage />);

    await waitFor(() => {
      const creditBadge = screen.getByText('credit');
      expect(creditBadge).toHaveClass('bg-blue-100', 'text-blue-800');

      const debitBadge = screen.getByText('debit');
      expect(debitBadge).toHaveClass('bg-orange-100', 'text-orange-800');

      const freezeBadge = screen.getByText('freeze');
      expect(freezeBadge).toHaveClass('bg-red-100', 'text-red-800');
    });
  });

  it('should display timestamp in readable format', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue(mockAuditLogs);
    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText(/1\/1\/2024/)).toBeInTheDocument();
    });
  });

  it('should display changes as JSON', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue(mockAuditLogs);
    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText(/"amount": "100.00"/)).toBeInTheDocument();
    });
  });

  it('should truncate wallet ID in display', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue(mockAuditLogs);
    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText(/wallet-1.../)).toBeInTheDocument();
    });
  });

  it('should display "—" for null wallet ID', async () => {
    const logsWithNullWallet = [
      {
        id: '1',
        tenant_id: 'tenant-1',
        wallet_id: null,
        action: 'system_action',
        actor: 'system',
        changes: {},
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    (fetchAuditLogs as jest.Mock).mockResolvedValue(logsWithNullWallet);
    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('should debounce wallet filter input', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);

    const walletFilter = screen.getByPlaceholderText('Filter by entity ID...');
    fireEvent.change(walletFilter, { target: { value: 'wallet-123' } });

    // Should not call immediately
    expect(fetchAuditLogs).toHaveBeenCalledTimes(1);

    // Fast-forward timer
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(fetchAuditLogs).toHaveBeenCalledWith({ wallet_id: 'wallet-123' });
    });
  });

  it('should debounce action filter input', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);

    const actionFilter = screen.getByPlaceholderText('Filter by action...');
    fireEvent.change(actionFilter, { target: { value: 'credit' } });

    // Should not call immediately
    expect(fetchAuditLogs).toHaveBeenCalledTimes(1);

    // Fast-forward timer
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(fetchAuditLogs).toHaveBeenCalledWith({ action: 'credit' });
    });
  });

  it('should apply both filters when both are provided', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);

    const walletFilter = screen.getByPlaceholderText('Filter by entity ID...');
    const actionFilter = screen.getByPlaceholderText('Filter by action...');

    fireEvent.change(walletFilter, { target: { value: 'wallet-123' } });
    fireEvent.change(actionFilter, { target: { value: 'debit' } });

    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(fetchAuditLogs).toHaveBeenCalledWith({
        wallet_id: 'wallet-123',
        action: 'debit',
      });
    });
  });

  it('should display loading state', () => {
    (fetchAuditLogs as jest.Mock).mockReturnValue(new Promise(() => {
      // Never resolves to keep loading state
    }));
    render(<AuditLogPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should display error message when fetch fails', async () => {
    (fetchAuditLogs as jest.Mock).mockRejectedValue(new Error('Network error'));
    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('should display empty state when no logs found', async () => {
    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('No audit logs found')).toBeInTheDocument();
    });
  });

  it('should handle unfreeze action badge color', async () => {
    const unfreezeLog = [
      {
        id: '1',
        tenant_id: 'tenant-1',
        wallet_id: 'wallet-1',
        action: 'unfreeze',
        actor: 'admin@example.com',
        changes: { status: 'active' },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    (fetchAuditLogs as jest.Mock).mockResolvedValue(unfreezeLog);
    render(<AuditLogPage />);

    await waitFor(() => {
      const unfreezeBadge = screen.getByText('unfreeze');
      expect(unfreezeBadge).toHaveClass('bg-green-100', 'text-green-800');
    });
  });

  it('should display gray badge for unknown actions', async () => {
    const unknownActionLog = [
      {
        id: '1',
        tenant_id: 'tenant-1',
        wallet_id: 'wallet-1',
        action: 'unknown_action',
        actor: 'admin@example.com',
        changes: {},
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    (fetchAuditLogs as jest.Mock).mockResolvedValue(unknownActionLog);
    render(<AuditLogPage />);

    await waitFor(() => {
      const badge = screen.getByText('unknown_action');
      expect(badge).toHaveClass('bg-gray-100', 'text-gray-800');
    });
  });

  it('should abort previous request when new filter is applied', async () => {
    const mockAbortController = {
      abort: jest.fn(),
      signal: {
        aborted: false,
        onabort: null,
        reason: undefined,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
        throwIfAborted: jest.fn(),
      },
    };

    jest.spyOn(global, 'AbortController').mockImplementation(
      () => mockAbortController as unknown as AbortController
    );

    (fetchAuditLogs as jest.Mock).mockResolvedValue([]);
    render(<AuditLogPage />);

    const walletFilter = screen.getByPlaceholderText('Filter by entity ID...');
    fireEvent.change(walletFilter, { target: { value: 'first' } });
    fireEvent.change(walletFilter, { target: { value: 'second' } });

    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    jest.restoreAllMocks();
  });
});
