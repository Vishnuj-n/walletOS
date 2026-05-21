'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { searchTransactions, searchWallets } from '../services/adminService';
import type { TransactionSearchResult, WalletSearchResult } from '@walletOS/types';

type SearchGroupKey = 'wallets' | 'transactions' | 'requests' | 'users';

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  group: SearchGroupKey;
  hint?: string;
}

interface SearchGroup {
  key: SearchGroupKey;
  label: string;
  items: SearchItem[];
}

interface UnifiedSearchState {
  groups: SearchGroup[];
  loading: boolean;
  error: string | null;
}

function toCurrency(amount: string, currency: string): string {
  return `${currency} ${amount}`;
}

function toWalletItem(wallet: WalletSearchResult): SearchItem {
  return {
    id: `wallet-${wallet.wallet_id}`,
    title: wallet.wallet_id,
    subtitle: `${wallet.external_user_id} - ${wallet.tenant.name}`,
    href: `/dashboard/wallets/${wallet.wallet_id}`,
    group: 'wallets',
    hint: `${toCurrency(wallet.balance, wallet.currency)} - ${wallet.status}`,
  };
}

function toTransactionItem(tx: TransactionSearchResult): SearchItem {
  return {
    id: `transaction-${tx.transaction_id}`,
    title: tx.transaction_id,
    subtitle: `${tx.wallet.wallet_id} - ${tx.wallet.tenant.name}`,
    href: `/dashboard/search?q=${encodeURIComponent(tx.transaction_id)}`,
    group: 'transactions',
    hint: `${tx.type} - ${toCurrency(tx.amount, tx.currency)}`,
  };
}

function toRequestItem(tx: TransactionSearchResult): SearchItem | null {
  if (!tx.reference_id) {
    return null;
  }

  return {
    id: `request-${tx.reference_id}`,
    title: tx.reference_id,
    subtitle: `${tx.transaction_id} - ${tx.wallet.tenant.name}`,
    href: `/dashboard/search?q=${encodeURIComponent(tx.reference_id)}`,
    group: 'requests',
    hint: `${tx.type} - ${toCurrency(tx.amount, tx.currency)}`,
  };
}

function toUserItems(wallets: WalletSearchResult[], rawQuery: string): SearchItem[] {
  const normalized = rawQuery.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return wallets
    .filter((wallet) => wallet.external_user_id.toLowerCase().includes(normalized))
    .map((wallet) => ({
      id: `user-${wallet.wallet_id}`,
      title: wallet.external_user_id,
      subtitle: `Wallet ${wallet.wallet_id} - ${wallet.tenant.name}`,
      href: `/dashboard/wallets/${wallet.wallet_id}`,
      group: 'users' as const,
      hint: wallet.status,
    }));
}

async function runUnifiedSearch(query: string): Promise<SearchGroup[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const [walletsResult, txByIdResult, txByRequestResult, txByIdempotencyResult] = await Promise.allSettled([
    searchWallets(trimmedQuery),
    searchTransactions({ transactionId: trimmedQuery }),
    searchTransactions({ requestId: trimmedQuery }),
    searchTransactions({ idempotencyKey: trimmedQuery }),
  ]);

  const wallets = walletsResult.status === 'fulfilled' ? walletsResult.value.results : [];
  const txCandidates: TransactionSearchResult[] = [];

  if (txByIdResult.status === 'fulfilled') {
    txCandidates.push(...txByIdResult.value.results);
  }

  if (txByRequestResult.status === 'fulfilled') {
    txCandidates.push(...txByRequestResult.value.results);
  }

  if (txByIdempotencyResult.status === 'fulfilled') {
    txCandidates.push(...txByIdempotencyResult.value.results);
  }

  const txSeen = new Set<string>();
  const transactions = txCandidates.filter((tx) => {
    if (txSeen.has(tx.transaction_id)) {
      return false;
    }
    txSeen.add(tx.transaction_id);
    return true;
  });

  const requestSeen = new Set<string>();
  const requests = transactions
    .map(toRequestItem)
    .filter((item): item is SearchItem => Boolean(item))
    .filter((item) => {
      if (requestSeen.has(item.title)) {
        return false;
      }
      requestSeen.add(item.title);
      return true;
    });

  const users = toUserItems(wallets, trimmedQuery);

  return [
    { key: 'wallets', label: 'Wallets', items: wallets.slice(0, 5).map(toWalletItem) },
    { key: 'transactions', label: 'Transactions', items: transactions.slice(0, 5).map(toTransactionItem) },
    { key: 'requests', label: 'Requests', items: requests.slice(0, 5) },
    { key: 'users', label: 'External Users', items: users.slice(0, 5) },
  ].filter((group) => group.items.length > 0);
}

function flattenGroups(groups: SearchGroup[]): SearchItem[] {
  return groups.flatMap((group) => group.items);
}

interface TopbarGlobalSearchProps {
  compact?: boolean;
  autoOpen?: boolean;
  initialQuery?: string;
}

export function TopbarGlobalSearch({ compact = false, autoOpen = false, initialQuery = '' }: TopbarGlobalSearchProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<UnifiedSearchState>({ groups: [], loading: false, error: null });
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const flatItems = useMemo(() => flattenGroups(state.groups), [state.groups]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandPalette = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isCommandPalette) {
        event.preventDefault();
        setIsOpen(true);
      }

      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setState({ groups: [], loading: false, error: null });
      setHighlightedIndex(0);
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const timeoutId = window.setTimeout(async () => {
      try {
        const groups = await runUnifiedSearch(query);
        setState({ groups, loading: false, error: null });
        setHighlightedIndex(0);
      } catch (error) {
        setState({ groups: [], loading: false, error: error instanceof Error ? error.message : 'Search failed' });
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const openItem = (item: SearchItem) => {
    setIsOpen(false);
    router.push(item.href);
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((idx) => (flatItems.length ? (idx + 1) % flatItems.length : 0));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((idx) => (flatItems.length ? (idx - 1 + flatItems.length) % flatItems.length : 0));
    }

    if (event.key === 'Enter' && flatItems[highlightedIndex]) {
      event.preventDefault();
      openItem(flatItems[highlightedIndex]);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${compact ? 'w-full' : 'w-[30rem] max-w-[42vw] min-w-[22rem]'}`}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Search wallets, transactions, requests, users"
          className="w-full rounded-full border border-slate-300 bg-white py-1.5 pl-8 pr-20 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Global search"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="admin-global-search-results"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 xl:block">
          {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC') ? 'CMD+K' : 'CTRL+K'}
        </kbd>
      </div>

      {isOpen && (
        <div
          id="admin-global-search-results"
          role="listbox"
          className="absolute z-50 mt-1 max-h-[28rem] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          {!query.trim() && (
            <div className="px-4 py-3 text-sm text-slate-500">
              Type a wallet ID, transaction ID, request ID, idempotency key, or external user ID.
            </div>
          )}

          {state.loading && (
            <div className="px-4 py-3 text-sm text-slate-500" aria-live="polite">
              Searching...
            </div>
          )}

          {!state.loading && state.error && (
            <div className="px-4 py-3 text-sm text-red-700" aria-live="polite">
              Search unavailable. Please retry.
            </div>
          )}

          {!state.loading && !state.error && query.trim() && state.groups.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500" aria-live="polite">
              No matches found.
            </div>
          )}

          {!state.loading && !state.error && state.groups.map((group) => (
            <div key={group.key} className="border-t border-slate-100 first:border-t-0">
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </div>
              {group.items.map((item) => {
                const index = flatItems.findIndex((flatItem) => flatItem.id === item.id);
                const isHighlighted = index === highlightedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => openItem(item)}
                    className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left ${
                      isHighlighted ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.subtitle}</div>
                    </div>
                    {item.hint && <div className="text-xs text-slate-500">{item.hint}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
