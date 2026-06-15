'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCcw,
  ArrowUpRight,
  ArrowDownLeft,
  Repeat2,
} from 'lucide-react';
import {
  fetchTransactionMetrics,
  exportAuditLogsCsv,
  type TransactionMetricsResponse,
  type TransactionMetricsDay,
} from '../../../services/adminService';

function formatAmount(value: string): string {
  return parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReportingPage() {
  const [metrics, setMetrics] = useState<TransactionMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSandbox, setIsSandbox] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDateRange, setExportDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTransactionMetrics({ is_sandbox: isSandbox });
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [isSandbox]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const stream = await exportAuditLogsCsv({
        from: exportDateRange.from ? new Date(exportDateRange.from).toISOString() : undefined,
        to: exportDateRange.to ? new Date(exportDateRange.to).toISOString() : undefined,
      });
      const response = new Response(stream);
      const blob = await response.blob();
      downloadBlob(blob, `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Compute chart max for bar scaling
  const maxAmount = metrics
    ? Math.max(...metrics.daily.map((d) => Math.max(parseFloat(d.credits), parseFloat(d.debits))), 1)
    : 1;

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transaction Reporting</h1>
          <p className="text-sm text-slate-500 mt-1">
            Aggregated volume, credits, debits, and net change over the last 30 days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Date range filters */}
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <label className="flex items-center gap-1 font-medium">
              <span>From:</span>
              <input
                type="date"
                value={exportDateRange.from}
                onChange={(e) => setExportDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="border-none bg-transparent p-0 text-sm focus:outline-none focus:ring-0 font-semibold text-slate-700"
              />
            </label>
            <span className="text-slate-300">|</span>
            <label className="flex items-center gap-1 font-medium">
              <span>To:</span>
              <input
                type="date"
                value={exportDateRange.to}
                onChange={(e) => setExportDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="border-none bg-transparent p-0 text-sm focus:outline-none focus:ring-0 font-semibold text-slate-700"
              />
            </label>
          </div>

          {/* Sandbox toggle */}
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
            <div
              onClick={() => setIsSandbox((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isSandbox ? 'bg-amber-400' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  isSandbox ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </div>
            {isSandbox ? 'Sandbox' : 'Live'}
          </label>

          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow transition-colors disabled:opacity-50"
          >
            <Download size={14} className={exporting ? 'animate-bounce' : ''} />
            {exporting ? 'Exporting...' : 'Export Audit CSV'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      )}
      {exportError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{exportError}</div>
      )}

      {/* Summary Cards */}
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : metrics ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Credits */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Credits</p>
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2 text-emerald-600">
                <ArrowUpRight size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">
              {formatAmount(metrics.summary.total_credits)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{metrics.summary.transaction_count} transactions</p>
          </div>

          {/* Total Debits */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Debits</p>
              <div className="rounded-xl bg-rose-50 border border-rose-100 p-2 text-rose-600">
                <ArrowDownLeft size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">
              {formatAmount(metrics.summary.total_debits)}
            </p>
            <p className="text-xs text-slate-400 mt-1">across {metrics.daily.length} days</p>
          </div>

          {/* Net Change */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net Change</p>
              <div
                className={`rounded-xl border p-2 ${
                  parseFloat(metrics.summary.net_change) >= 0
                    ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                    : 'bg-amber-50 border-amber-100 text-amber-600'
                }`}
              >
                {parseFloat(metrics.summary.net_change) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              </div>
            </div>
            <p
              className={`mt-3 text-2xl font-extrabold ${
                parseFloat(metrics.summary.net_change) >= 0 ? 'text-indigo-700' : 'text-amber-700'
              }`}
            >
              {parseFloat(metrics.summary.net_change) >= 0 ? '+' : ''}
              {formatAmount(metrics.summary.net_change)}
            </p>
            <p className="text-xs text-slate-400 mt-1">credits minus debits</p>
          </div>

          {/* Reversals */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Reversals</p>
              <div className="rounded-xl bg-slate-100 border border-slate-200 p-2 text-slate-500">
                <Repeat2 size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">
              {formatAmount(metrics.summary.total_reversals)}
            </p>
            <p className="text-xs text-slate-400 mt-1">transaction reversals</p>
          </div>
        </div>
      ) : null}

      {/* Daily Volume Chart */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart2 size={18} className="text-indigo-500" />
          <h2 className="text-base font-bold text-slate-800">Daily Volume (Last 30 Days)</h2>
          <div className="ml-auto flex items-center gap-4 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-emerald-500" />
              Credits
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-rose-400" />
              Debits
            </span>
          </div>
        </div>

        {loading ? (
          <div className="h-48 flex items-end gap-1 animate-pulse">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-slate-100 rounded-t"
                style={{ height: `${Math.random() * 80 + 20}%` }}
              />
            ))}
          </div>
        ) : metrics && metrics.daily.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 min-w-max" style={{ height: '200px' }}>
              {metrics.daily.map((day: TransactionMetricsDay) => {
                const creditH = (parseFloat(day.credits) / maxAmount) * 180;
                const debitH = (parseFloat(day.debits) / maxAmount) * 180;
                return (
                  <div key={day.date} className="flex flex-col items-center gap-0.5 group" style={{ width: '28px' }}>
                    <div className="relative flex items-end gap-0.5" style={{ height: '180px' }}>
                      <div
                        title={`Credits: ${day.credits}`}
                        className="w-2.5 rounded-t bg-emerald-500 hover:bg-emerald-400 transition-colors cursor-pointer"
                        style={{ height: `${Math.max(creditH, 2)}px` }}
                      />
                      <div
                        title={`Debits: ${day.debits}`}
                        className="w-2.5 rounded-t bg-rose-400 hover:bg-rose-300 transition-colors cursor-pointer"
                        style={{ height: `${Math.max(debitH, 2)}px` }}
                      />
                    </div>
                    <span className="text-[8px] text-slate-400 rotate-45 origin-left whitespace-nowrap mt-1">
                      {day.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-slate-400">
            <BarChart2 size={36} className="text-slate-200" />
            <span className="text-sm font-medium text-slate-500">No transaction data in this period</span>
          </div>
        )}
      </div>

      {/* Daily Breakdown Table */}
      {!loading && metrics && metrics.daily.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Daily Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/60">
                <tr>
                  {['Date', 'Credits', 'Debits', 'Reversals', 'Net', 'Txns'].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...metrics.daily].reverse().map((day) => (
                  <tr key={day.date} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-slate-700">{day.date}</td>
                    <td className="px-6 py-3 text-emerald-700 font-semibold">{formatAmount(day.credits)}</td>
                    <td className="px-6 py-3 text-rose-600 font-semibold">{formatAmount(day.debits)}</td>
                    <td className="px-6 py-3 text-slate-500">{formatAmount(day.reversals)}</td>
                    <td
                      className={`px-6 py-3 font-bold ${
                        parseFloat(day.net) >= 0 ? 'text-indigo-600' : 'text-amber-600'
                      }`}
                    >
                      {parseFloat(day.net) >= 0 ? '+' : ''}
                      {formatAmount(day.net)}
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs">{day.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
