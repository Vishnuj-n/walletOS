import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

import Page from '../src/app/dashboard/team/page';
import { useAuth } from '../src/contexts/AuthContext';
import {
  fetchCurrentTenantApiKeys,
  fetchCurrentTenantEmployees,
} from '../src/services/adminService';

jest.mock('../src/contexts/AuthContext');
jest.mock('../src/services/adminService', () => ({
  fetchCurrentTenantApiKeys: jest.fn(),
  fetchCurrentTenantEmployees: jest.fn(),
  inviteTenantUser: jest.fn(),
}));

jest.mock('../src/components/PermissionGate', () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Settings employee tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'tenant_admin', tenantId: 'tenant-1' },
      loading: false,
      hasRole: jest.fn().mockReturnValue(true),
      signOut: jest.fn(),
    });

    (fetchCurrentTenantApiKeys as jest.Mock).mockResolvedValue({
      tenant_id: 'tenant-1',
      tenant_name: 'Tenant One',
      keys: [],
    });

    (fetchCurrentTenantEmployees as jest.Mock).mockResolvedValue({
      tenant_id: 'tenant-1',
      total: 1,
      query: null,
      data: [
        {
          id: 'usr_1',
          email: 'alice@tenant.com',
          role: 'finance',
          is_active: true,
          invited_at: '2026-05-23T10:00:00.000Z',
          activated_at: '2026-05-23T10:05:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('loads tenant-scoped employees and forwards scoped search query', async () => {
    render(<Page />);

    expect(await screen.findByText('Team Management')).toBeInTheDocument();

    expect(await screen.findByText('alice@tenant.com')).toBeInTheDocument();
    expect(fetchCurrentTenantEmployees).toHaveBeenCalledWith(undefined);

    fireEvent.change(screen.getByLabelText('Search tenant employees'), {
      target: { value: 'finance' },
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(fetchCurrentTenantEmployees).toHaveBeenLastCalledWith('finance');
    });
  });
});
