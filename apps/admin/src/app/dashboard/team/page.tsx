'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Search, UserPlus, Users, ShieldCheck, RefreshCcw, UserCheck, Clock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { PermissionGate } from '../../../components/PermissionGate';
import {
  fetchCurrentTenantEmployees,
  inviteTenantUser,
} from '../../../services/adminService';
import type { AdminRole, TenantEmployee } from '@walletos/types';

export default function TeamPage() {
  const { adminUser } = useAuth();
  const isSuperadmin = adminUser?.role === 'superadmin';
  
  const [employees, setEmployees] = useState<TenantEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [debouncedEmployeeSearch, setDebouncedEmployeeSearch] = useState('');
  
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('finance');

  // Adjust default invite role when adminUser loads
  useEffect(() => {
    if (isSuperadmin) {
      setInviteRole('superadmin');
    } else {
      setInviteRole('finance');
    }
  }, [adminUser, isSuperadmin]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const loadEmployees = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCurrentTenantEmployees(search);
      setEmployees(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search trigger
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedEmployeeSearch(employeeSearch.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [employeeSearch]);

  // Load when tab/search changes
  useEffect(() => {
    loadEmployees(debouncedEmployeeSearch || undefined);
  }, [debouncedEmployeeSearch, loadEmployees]);

  const openInviteModal = () => {
    setInviteError(null);
    setInviteSuccess(null);
    setInviteModalOpen(true);
  };

  const closeInviteModal = () => {
    if (inviteLoading) return;
    setInviteModalOpen(false);
    setInviteError(null);
  };

  const handleInviteEmployee = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviteLoading) return;

    const normalizedEmail = inviteEmail.trim();
    if (!normalizedEmail) {
      setInviteError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setInviteError('Please enter a valid email address');
      return;
    }

    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const response = await inviteTenantUser({
        email: normalizedEmail,
        role: inviteRole,
      });

      await loadEmployees(debouncedEmployeeSearch || undefined);
      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole(isSuperadmin ? 'superadmin' : 'finance');
      setInviteSuccess(`Invitation successfully created for ${response.admin_user.email}.`);
      
      // Auto-clear success message after 5 seconds
      setTimeout(() => {
        setInviteSuccess(null);
      }, 5000);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  // Helper stats computed from employees list
  const stats = React.useMemo(() => {
    const total = employees.length;
    const active = employees.filter(e => e.is_active).length;
    const pending = total - active;
    return { total, active, pending };
  }, [employees]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header section with layout matching wallets spec */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Team Management</h1>
          <p className="text-xs text-slate-500">
            Manage tenant employees, configure access privileges, and invite new administrators.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadEmployees(debouncedEmployeeSearch || undefined)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors border border-slate-200 shadow-sm"
          >
            <RefreshCcw size={15} className={`${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <PermissionGate minRole="tenant_admin">
            <button
              onClick={openInviteModal}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-sm"
            >
              <UserPlus size={16} />
              Invite Member
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Success Banner */}
      {inviteSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 flex items-center gap-3 animate-fade-in mb-4">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{inviteSuccess}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800 flex items-center gap-3 mb-4">
          <div className="h-2 w-2 rounded-full bg-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Overview Cards Row */}
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Total Members</p>
            <p className="text-2xl font-bold text-slate-900">{loading ? '...' : stats.total}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600 border border-slate-100">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Active Admins</p>
            <p className="text-2xl font-bold text-emerald-600">{loading ? '...' : stats.active}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 border border-emerald-100">
            <UserCheck size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Pending Invites</p>
            <p className="text-2xl font-bold text-amber-600">{loading ? '...' : stats.pending}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600 border border-amber-100">
            <Clock size={20} />
          </div>
        </div>
      </div>

      {/* Spacious Grid Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-4">
        {/* Search controls bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Team Directory</h2>
            <p className="text-xs text-slate-500 mt-0.5">Filter team records by email, admin ID, or role.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              placeholder="Search team members..."
              className="w-full rounded-lg border border-slate-300 py-1.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all bg-white"
              aria-label="Search tenant employees"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Member Details</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Invited</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Activated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && employees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCcw className="animate-spin text-blue-500" size={24} />
                      <span>Loading team directory...</span>
                    </div>
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="text-slate-300" size={32} />
                      <span className="font-semibold text-slate-600">No members found</span>
                      <span className="text-xs text-slate-400">Try broadening your search or invite a new member.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map((employee) => {
                  const initial = employee.email?.charAt(0).toUpperCase() || 'U';
                  return (
                    <tr key={employee.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-4 py-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold shadow-sm group-hover:scale-105 transition-transform">
                          {initial}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{employee.email}</div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">{employee.id}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 capitalize font-medium">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck size={14} className="text-slate-400" />
                          {employee.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold border transition-colors ${
                          employee.is_active
                            ? 'bg-green-50 text-green-700 border-green-150'
                            : 'bg-amber-50 text-amber-700 border-amber-150'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${employee.is_active ? 'bg-green-500' : 'bg-amber-500'}`} />
                          {employee.is_active ? 'Active' : 'Invited'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {employee.invited_at ? new Date(employee.invited_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {employee.activated_at ? new Date(employee.activated_at).toLocaleString() : (
                          <span className="text-amber-500 font-semibold italic text-xs">Pending claim</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Member dialog */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 transform scale-100 transition-all">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Invite Team Member</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Sends an access link to register an account in this active tenant.
                </p>
              </div>
              <button
                type="button"
                onClick={closeInviteModal}
                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-lg p-1"
                aria-label="Close invite dialog"
              >
                ×
              </button>
            </div>

            {inviteError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInviteEmployee} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                    placeholder="employee@company.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Select Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AdminRole)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium text-slate-700"
                >
                  {isSuperadmin ? (
                    <>
                      <option value="superadmin">Superadmin (Root Platform Access)</option>
                      <option value="finance">Platform Finance (Global Reversals)</option>
                      <option value="support">Platform Support (Global Read-Only)</option>
                    </>
                  ) : (
                    <>
                      <option value="finance">Finance (Transactional Actions)</option>
                      <option value="support">Support (Read-Only Search)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeInviteModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inviteLoading ? (
                    <>
                      <RefreshCcw size={14} className="animate-spin" />
                      Inviting...
                    </>
                  ) : (
                    <>
                      <Mail size={14} />
                      Send Invite
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
