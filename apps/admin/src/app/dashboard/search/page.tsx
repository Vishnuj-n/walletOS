'use client';

import { useSearchParams } from 'next/navigation';
import { PermissionGate } from '../../../components/PermissionGate';
import { TopbarGlobalSearch } from '../../../components/TopbarGlobalSearch';

export default function GlobalSearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  return (
    <PermissionGate
      minRole="superadmin"
      fallback={
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-yellow-800">Access Denied</h3>
          <p className="text-yellow-700 mt-2">This feature is only available to superadmins.</p>
        </div>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Search</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use the top navigation search for fastest lookup. This page is kept as a lightweight compatibility surface.
        </p>
        <div className="mt-4 max-w-2xl">
          <TopbarGlobalSearch compact autoOpen initialQuery={initialQuery} />
        </div>
      </div>
    </PermissionGate>
  );
}
