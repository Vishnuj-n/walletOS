import React from 'react';
import { LedgerActivityDto } from '../../types/wallet';

export function ActivityRow({ activity }: { activity: LedgerActivityDto }) {
  const toneClass =
    activity.type === 'credit' ? 'text-success' : activity.type === 'debit' ? 'text-danger' : 'text-warning';

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 text-sm capitalize text-foreground">{activity.type}</td>
      <td className={`px-4 py-3 text-sm font-medium ${toneClass}`}>{activity.amount}</td>
      <td className="px-4 py-3 text-sm text-foreground">{activity.description || '-'}</td>
      <td className="px-4 py-3 text-sm text-muted">{new Date(activity.created_at).toLocaleString()}</td>
    </tr>
  );
}
