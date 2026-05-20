'use client';

import { AuthProvider } from '../contexts/AuthContext';

/**
 * Client-side provider boundary.
 * Allows the root Server Component layout to export `metadata`
 * while delegating all hook-based providers to a client tree.
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
