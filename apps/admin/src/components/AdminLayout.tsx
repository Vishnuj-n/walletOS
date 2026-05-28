'use client';

import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { PermissionGate } from './PermissionGate';
import { DASHBOARD_CAPABILITIES } from './dashboardCapabilities';
import { TopbarGlobalSearch } from './TopbarGlobalSearch';

interface AdminLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
}

export function AdminLayout({ children, showNav = true }: AdminLayoutProps) {
  const { adminUser, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target instanceof Node)) return;
      const clickedDropdown = profileRef.current?.contains(e.target) ?? false;
      const clickedTrigger = profileTriggerRef.current?.contains(e.target) ?? false;
      if (!clickedDropdown && !clickedTrigger) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      console.error('Sign out failed');
    } finally {
      router.push('/login');
    }
  };

  const getNavLinkClass = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    return isActive
      ? 'inline-flex items-center px-1 pt-1 border-b-2 border-indigo-500 text-sm font-medium text-gray-900'
      : 'inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {showNav && (
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-start gap-4 flex-nowrap">
              <div className="flex min-w-0 items-center gap-6 flex-1">
                <div className="flex-shrink-0 flex items-center">
                  <Link href="/dashboard" className="text-xl font-bold text-gray-900 hover:text-gray-700">
                    WalletOS Admin
                  </Link>
                </div>
                <div className="hidden lg:block">
                  <PermissionGate minRole="superadmin">
                    <TopbarGlobalSearch />
                  </PermissionGate>
                </div>
                <div className="hidden sm:ml-2 sm:flex sm:space-x-6 sm:flex-shrink-0">
                  {DASHBOARD_CAPABILITIES.filter((c) => c.id !== 'settings').map((capability) => (
                    <PermissionGate key={capability.id} minRole={capability.minRole}>
                      <Link href={capability.href} className={getNavLinkClass(capability.href)}>
                        {capability.label}
                      </Link>
                    </PermissionGate>
                  ))}
                </div>
              </div>
              <div className="relative flex items-center ml-auto">
                <button
                  ref={profileTriggerRef}
                  type="button"
                  className="flex items-center gap-3 rounded-md p-2 hover:bg-gray-100 focus:outline-none"
                  onClick={() => setProfileOpen((o) => !o)}
                  aria-haspopup="true"
                  aria-expanded={profileOpen}
                >
                  <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                    {adminUser?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="hidden sm:flex flex-col items-start">
                    <span className="text-sm text-gray-700">{adminUser?.email}</span>
                    <span className="text-xs text-gray-500">{adminUser?.role}</span>
                  </div>
                </button>

                {profileOpen && (
                  <div
                    ref={profileRef}
                    className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-30 origin-top-right"
                    style={{ marginTop: '0.25rem' }}
                  >
                    <div className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 truncate">{adminUser?.email}</div>
                      <div className="text-xs text-gray-500">{adminUser?.role}</div>
                    </div>
                    <div className="border-t border-gray-100" />
                    <div className="py-1">
                      <PermissionGate minRole="support">
                        <Link
                          href="/dashboard/settings"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setProfileOpen(false)}
                        >
                          Account Settings
                        </Link>
                      </PermissionGate>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="pb-3 lg:hidden">
              <PermissionGate minRole="superadmin">
                <TopbarGlobalSearch compact />
              </PermissionGate>
            </div>
          </div>
        </nav>
      )}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

interface AdminPageProps {
  children: React.ReactNode;
  showNav?: boolean;
}

export function AdminPage({ children, showNav = true }: AdminPageProps) {
  return <AdminLayout showNav={showNav}>{children}</AdminLayout>;
}
