import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TenantsPage from '../src/app/dashboard/tenants/page';
import { createTenant, fetchTenants, revokeTenantKey, rotateTenantKey } from '../src/services/adminService';
import { useAuth } from '../src/contexts/AuthContext';

jest.mock('../src/services/adminService');
jest.mock('../src/contexts/AuthContext');
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/dashboard/tenants'),
}));

describe('Tenants credential reveal flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (fetchTenants as jest.Mock).mockResolvedValue([
      {
        tenant_id: 'tenant-1',
        name: 'Acme',
        contact_email: 'ops@acme.test',
        created_at: '2026-05-20T00:00:00.000Z',
        wallet_count: 2,
        admin_count: 1,
      },
    ]);
    (revokeTenantKey as jest.Mock).mockResolvedValue({ tenant_id: 'tenant-1', scope: 'live', keys_deactivated: 1 });
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'user-1', email: 'admin@test.com' },
      adminUser: { id: 'admin-1', email: 'admin@test.com', tenantId: 'default', role: 'superadmin' },
      loading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      isSuperadmin: true,
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reveals newly created keys only inside the dedicated dialog and clears on timeout', async () => {
    (createTenant as jest.Mock).mockResolvedValue({
      tenant_id: 'tenant-2',
      name: 'Created Tenant',
      contact_email: 'created@test.com',
      live_key: 'wlt_live_secret_value',
      test_key: 'wlt_test_secret_value',
      created_at: '2026-05-20T00:00:00.000Z',
      bootstrap_invite_sent: false,
      bootstrap_admin_email: null,
    });

    render(<TenantsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /create new tenant/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter tenant name'), {
      target: { value: 'Created Tenant' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /create tenant/i }));

    expect(await screen.findByText('One-Time Reveal')).toBeInTheDocument();
    expect(screen.getByText('Live API Key')).toBeInTheDocument();
    expect(screen.getByText('Test API Key')).toBeInTheDocument();
    expect(screen.getByText(/never reloaded from storage, urls, logs, or audit history/i)).toBeInTheDocument();

    jest.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(screen.queryByText('One-Time Reveal')).not.toBeInTheDocument();
    });
  });

  it('reveals rotated keys in the dedicated dialog and clears on close', async () => {
    (rotateTenantKey as jest.Mock).mockResolvedValue({
      tenant_id: 'tenant-1',
      scope: 'live',
      api_key: 'wlt_live_rotated_secret',
      created_at: '2026-05-20T00:00:00.000Z',
    });

    render(<TenantsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /rotate live key/i }));

    expect(await screen.findByText('One-Time Reveal')).toBeInTheDocument();
    expect(screen.getByText('Live API Key')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByText('One-Time Reveal')).not.toBeInTheDocument();
    });
  });
});
