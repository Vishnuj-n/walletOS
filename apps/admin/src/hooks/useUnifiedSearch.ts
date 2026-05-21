'use client';

import { useEffect, useState } from 'react';
import { searchUnified } from '../services/adminService';

export type SearchGroupKey = 'wallets' | 'transactions' | 'requests' | 'users';

export interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  group: SearchGroupKey;
  hint?: string;
}

export interface SearchResultGroup {
  key: SearchGroupKey;
  label: string;
  items: SearchItem[];
}

interface UnifiedSearchState {
  groups: SearchResultGroup[];
  loading: boolean;
  error: string | null;
}

const SEARCH_QUERY_MAX_LENGTH = 256;
const SEARCH_QUERY_ALLOWED_CHARS = /^[\x20-\x7E]+$/;

function getValidatedSearchQuery(rawQuery: string): string | null {
  const trimmedQuery = rawQuery.trim();
  if (!trimmedQuery || trimmedQuery.length > SEARCH_QUERY_MAX_LENGTH) {
    return null;
  }

  if (!SEARCH_QUERY_ALLOWED_CHARS.test(trimmedQuery)) {
    return null;
  }

  return trimmedQuery;
}

export function useUnifiedSearch(query: string): UnifiedSearchState {
  const [state, setState] = useState<UnifiedSearchState>({
    groups: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const validatedQuery = getValidatedSearchQuery(query);
    if (!validatedQuery) {
      setState({ groups: [], loading: false, error: null });
      return;
    }

    let isCancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await searchUnified(validatedQuery);
        if (isCancelled) {
          return;
        }

        const groups: SearchResultGroup[] = [
          {
            key: 'wallets',
            label: 'Wallets',
            items: response.wallets.map((wallet) => ({
              id: wallet.id,
              title: wallet.id,
              subtitle: `${wallet.external_user_id} - ${wallet.tenant_name}`,
              href: `/dashboard/wallets/${wallet.id}`,
              group: 'wallets',
              hint: `${wallet.currency} ${wallet.balance} - ${wallet.status}`,
            })),
          },
          {
            key: 'transactions',
            label: 'Transactions',
            items: response.transactions.map((transaction) => ({
              id: transaction.id,
              title: transaction.id,
              subtitle: `${transaction.wallet_id} - ${transaction.tenant_name}`,
              href: `/dashboard/search?q=${encodeURIComponent(transaction.id)}`,
              group: 'transactions',
              hint: `${transaction.type} - ${transaction.currency} ${transaction.amount}`,
            })),
          },
          {
            key: 'requests',
            label: 'Requests',
            items: response.requests.map((request) => ({
              id: request.id,
              title: request.id,
              subtitle: `${request.transaction_id} - ${request.tenant_name}`,
              href: `/dashboard/search?q=${encodeURIComponent(request.id)}`,
              group: 'requests',
            })),
          },
          {
            key: 'users',
            label: 'Users',
            items: response.users.map((user) => ({
              id: user.id,
              title: user.email,
              subtitle: user.tenant_name,
              href: '/dashboard/tenants',
              group: 'users',
              hint: user.role,
            })),
          },
        ].filter((group) => group.items.length > 0);

        setState({ groups, loading: false, error: null });
      } catch (error) {
        if (isCancelled) {
          return;
        }
        setState({ groups: [], loading: false, error: error instanceof Error ? error.message : 'Search failed' });
      }
    }, 300);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  return state;
}
