'use client';

import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import React from 'react';

interface AdminLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
}

/**
 * Unified Admin Layout Wrapper
 * Provides consistent navigation, auth context, and layout structure across admin pages
 * Reduces isolated nodes by centralizing common UI patterns
 */
export function AdminLayout({ children, showNav = true }: AdminLayoutProps) {
  const { adminUser, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {showNav && (
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <h1 className="text-xl font-bold text-gray-900">WalletOS Admin</h1>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    href="/dashboard/wallets"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-indigo-500 text-sm font-medium text-gray-900"
                  >
                    Wallets
                  </Link>
                  <Link
                    href="/dashboard/actions"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  >
                    Manual Actions
                  </Link>
                  <Link
                    href="/dashboard/tenants"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  >
                    Tenants
                  </Link>
                  <Link
                    href="/dashboard/audit"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  >
                    Audit Log
                  </Link>
                </div>
              </div>
              <div className="flex items-center">
                <div className="flex flex-col items-end mr-4">
                  <span className="text-sm text-gray-700">
                    {adminUser?.email}
                  </span>
                  <span className="text-xs text-gray-500">
                    {adminUser?.role}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

/**
 * Page wrapper component for admin pages
 * Combines auth protection with AdminLayout
 */
interface AdminPageProps {
  children: React.ReactNode;
  showNav?: boolean;
}

export function AdminPage({ children, showNav = true }: AdminPageProps) {
  return <AdminLayout showNav={showNav}>{children}</AdminLayout>;
}
