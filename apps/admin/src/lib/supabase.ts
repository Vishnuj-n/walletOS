import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl.trim() === '') {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set or is empty');
}

if (!supabaseAnonKey || supabaseAnonKey.trim() === '') {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set or is empty');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Parse Supabase auth callback hash for error information.
 * Returns structured error data if the hash contains an error, null otherwise.
 */
export function parseSupabaseCallbackHash(): {
  errorCode: string;
  errorDescription: string;
} | null {
  if (typeof window === 'undefined' || !window.location.hash) {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const errorCode = hashParams.get('error_code');

  if (!errorCode) {
    return null;
  }

  return {
    errorCode,
    errorDescription: hashParams.get('error_description') ?? '',
  };
}
