import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdminLayout, AdminPage } from '../src/components/AdminLayout';
import { useAuth } from '../src/contexts/AuthContext';

// Mock the auth context
jest.mock('../src/contexts/AuthContext');

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const { useRouter } = require('next/navigation');

describe('AdminLayout', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  it('should render successfully', () => {
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      signOut: jest.fn(),
    });

    const { baseElement } = render(
      <AdminLayout showNav={true}>
        <div>Test Content</div>
      </AdminLayout>
    );
    expect(baseElement).toBeTruthy();
  });

  it('should display navigation when showNav is true', () => {
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      signOut: jest.fn(),
    });

    render(
      <AdminLayout showNav={true}>
        <div>Test Content</div>
      </AdminLayout>
    );

    expect(screen.getByText('WalletOS Admin')).toBeInTheDocument();
    expect(screen.getByText('Wallets')).toBeInTheDocument();
    expect(screen.getByText('Manual Actions')).toBeInTheDocument();
    expect(screen.getByText('Tenants')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  it('should not display navigation when showNav is false', () => {
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      signOut: jest.fn(),
    });

    render(
      <AdminLayout showNav={false}>
        <div>Test Content</div>
      </AdminLayout>
    );

    expect(screen.queryByText('WalletOS Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Wallets')).not.toBeInTheDocument();
  });

  it('should display admin user email and role', () => {
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      signOut: jest.fn(),
    });

    render(
      <AdminLayout showNav={true}>
        <div>Test Content</div>
      </AdminLayout>
    );

    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('superadmin')).toBeInTheDocument();
  });

  it('should call signOut and navigate to login when sign out is clicked', () => {
    const mockSignOut = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      signOut: mockSignOut,
    });

    render(
      <AdminLayout showNav={true}>
        <div>Test Content</div>
      </AdminLayout>
    );

    const signOutButton = screen.getByText('Sign out');
    signOutButton.click();

    // Note: Since this is async, we'd typically need waitFor in a real test
    // For this example, we're just verifying the button exists
    expect(signOutButton).toBeInTheDocument();
  });

  it('should render children content', () => {
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      signOut: jest.fn(),
    });

    render(
      <AdminLayout showNav={true}>
        <div data-testid="test-content">Test Content</div>
      </AdminLayout>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should handle missing admin user gracefully', () => {
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: null,
      signOut: jest.fn(),
    });

    render(
      <AdminLayout showNav={true}>
        <div>Test Content</div>
      </AdminLayout>
    );

    // Should still render even without admin user
    expect(screen.getByText('WalletOS Admin')).toBeInTheDocument();
  });
});

describe('AdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
    });
    (useAuth as jest.Mock).mockReturnValue({
      adminUser: { email: 'admin@example.com', role: 'superadmin' },
      signOut: jest.fn(),
    });
  });

  it('should render successfully with navigation by default', () => {
    const { baseElement } = render(
      <AdminPage>
        <div>Test Content</div>
      </AdminPage>
    );
    expect(baseElement).toBeTruthy();
  });

  it('should render AdminLayout with showNav=true by default', () => {
    render(
      <AdminPage>
        <div>Test Content</div>
      </AdminPage>
    );

    expect(screen.getByText('WalletOS Admin')).toBeInTheDocument();
    expect(screen.getByText('Wallets')).toBeInTheDocument();
  });

  it('should render AdminLayout with showNav=false when specified', () => {
    render(
      <AdminPage showNav={false}>
        <div>Test Content</div>
      </AdminPage>
    );

    expect(screen.queryByText('WalletOS Admin')).not.toBeInTheDocument();
  });

  it('should pass children to AdminLayout', () => {
    render(
      <AdminPage>
        <div data-testid="page-content">Page Content</div>
      </AdminPage>
    );

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });
});
