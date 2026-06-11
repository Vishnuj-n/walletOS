import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Page from '../src/app/dashboard/tenants/page';
import { useAuth } from '../src/contexts/AuthContext';
import { fetchTenants, fetchTenantUsage } from '../src/services/adminService';

jest.mock('../src/contexts/AuthContext');
jest.mock('../src/services/adminService', () => ({
  createTenant: jest.fn(),
  fetchTenants: jest.fn(),
  fetchTenantUsage: jest.fn(),
}));

jest.mock('../src/components/PermissionGate', () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockTenants = [
  {
    tenant_id: 'tenant-1',
    name: 'Tenant One',
    contact_email: 'admin@example.com',
    created_at: '2026-05-21T00:00:00.000Z',
    wallet_count: 2,
    admin_count: 1,
  },
];

describe('Tenant actions overflow menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      loading: false,
      hasRole: jest.fn().mockReturnValue(true),
      signOut: jest.fn(),
    });
    (fetchTenants as jest.Mock).mockResolvedValue(mockTenants);
    (fetchTenantUsage as jest.Mock).mockResolvedValue({
      summary: { totalRequests: 0, totalErrors: 0, totalAmount: 0 },
      byHour: [],
      recentTransactions: [],
    });
  });

  it('hides rotate and revoke actions behind overflow menu', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Page />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Tenant One')).toBeInTheDocument();
    expect(screen.getByText('View Usage')).toBeInTheDocument();
    expect(screen.queryByText('Rotate Live Key')).not.toBeInTheDocument();
    expect(screen.queryByText('Revoke Live Key')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Open tenant actions'));

    expect(await screen.findByText('Rotate Live Key')).toBeInTheDocument();
    expect(screen.getByText('Rotate Test Key')).toBeInTheDocument();
    expect(screen.getByText('Revoke Live Key')).toBeInTheDocument();
    expect(screen.getByText('Revoke Test Key')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Rotate Live Key')).not.toBeInTheDocument();
    });
  });
});