import React from 'react';
import { TransactionResponse as LedgerActivityDto } from '@walletOS/types';
import { Skeleton } from '../common/Skeleton';
import { ActivityRow } from './ActivityRow';

export function LedgerActivityTable({
  items,
  loading,
  nextCursor,
  onNextPage,
  onPrevPage,
  canGoBack,
}: {
  items: LedgerActivityDto[];
  loading?: boolean;
  nextCursor: string | null;
  onNextPage: () => void;
  onPrevPage: () => void;
  canGoBack: boolean;
}) {
  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Recent Ledger Activity</h3>
        <span className="text-sm text-muted">20 per page</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 text-xs uppercase text-muted">Type</th>
                  <th className="px-4 py-2 text-xs uppercase text-muted">Amount</th>
                  <th className="px-4 py-2 text-xs uppercase text-muted">Description</th>
                  <th className="px-4 py-2 text-xs uppercase text-muted">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-muted" colSpan={4}>
                      No activities available yet.
                    </td>
                  </tr>
                ) : (
                  items.map((activity) => <ActivityRow key={activity.transaction_id} activity={activity} />)
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onPrevPage}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={!canGoBack}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={onNextPage}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={!nextCursor}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
