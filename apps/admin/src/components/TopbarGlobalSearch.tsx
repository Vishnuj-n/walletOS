'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useUnifiedSearch } from '../hooks/useUnifiedSearch';

interface TopbarGlobalSearchProps {
  compact?: boolean;
  autoOpen?: boolean;
  initialQuery?: string;
}

export function TopbarGlobalSearch({ compact = false, autoOpen = false, initialQuery = '' }: TopbarGlobalSearchProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isMac, setIsMac] = useState(false);

  const state = useUnifiedSearch(query);

  const { groupsWithIndex, flatItems } = useMemo(() => {
    let absoluteIndex = 0;
    const groupsWithIndex = state.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        absoluteIndex: absoluteIndex++,
      })),
    }));
    const flatItems = groupsWithIndex.flatMap((group) => group.items);
    return { groupsWithIndex, flatItems };
  }, [state.groups]);

  useEffect(() => {
    setInputValue(initialQuery);
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [state.groups]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')) {
      setIsMac(true);
    }
  }, []);

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

  const openItem = (href: string) => {
    setIsOpen(false);
    router.push(href);
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
      openItem(flatItems[highlightedIndex].href);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${compact ? 'w-full' : 'max-w-[28rem] w-full'} flex-shrink`}
    >
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => setInputValue(event.target.value)}
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
          {isMac ? 'CMD+K' : 'CTRL+K'}
        </kbd>
      </div>

      {isOpen && (
        <div
          id="admin-global-search-results"
          role="listbox"
          className="absolute z-50 mt-1 max-h-[28rem] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          {!inputValue.trim() && (
            <div className="px-4 py-3 text-sm text-slate-500">
              Search by ID (e.g., wal_, txn_), email, label, reference, or external user ID.
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

          {!state.loading && !state.error && inputValue.trim() && groupsWithIndex.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500" aria-live="polite">
              No matches found.
            </div>
          )}

          {!state.loading && !state.error && groupsWithIndex.map((group) => (
            <div key={group.key} className="border-t border-slate-100 first:border-t-0">
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </div>
              {group.items.map((item) => {
                const index = item.absoluteIndex;
                const isHighlighted = index === highlightedIndex;

                return (
                  <button
                    key={`${item.group}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => openItem(item.href)}
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
