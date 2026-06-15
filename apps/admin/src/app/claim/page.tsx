'use client';

import { FormEvent, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { API_BASE_URL } from '../../lib/supabase';

function getClaimToken(searchParams: ReturnType<typeof useSearchParams>): string {
  const token = searchParams.get('token')?.trim();
  return token ?? '';
}

function isHexToken(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token);
}

function ClaimAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => getClaimToken(searchParams), [searchParams]);
  const [isMounted, setIsMounted] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasValidToken = isHexToken(token);
  const apiBaseUrl = API_BASE_URL?.trim();

  const passwordRequirements = useMemo(() => {
    const hasLength = password.length >= 8;
    const hasLetter = /[a-z]/i.test(password);
    const hasNumber = /\d/.test(password);

    return {
      hasLength,
      hasLetter,
      hasNumber,
      isValid: hasLength && hasLetter && hasNumber,
    };
  }, [password]);

  const passwordValidationError = useMemo(() => {
    if (!password) return '';
    if (!passwordRequirements.hasLength) return 'Password must be at least 8 characters.';
    if (!passwordRequirements.hasLetter || !passwordRequirements.hasNumber) {
      return 'Password must include at least one letter and one number.';
    }
    return '';
  }, [password, passwordRequirements]);

  const canSubmit =
    !loading &&
    hasValidToken &&
    !!apiBaseUrl &&
    passwordRequirements.isValid &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!hasValidToken) {
      setError('This claim link is invalid. Please request a new invitation.');
      return;
    }

    if (!apiBaseUrl) {
      setError('Admin API is not configured. Set NEXT_PUBLIC_API_URL and retry.');
      return;
    }

    if (!passwordRequirements.isValid) {
      setError('Password must be at least 8 characters and include at least one letter and one number.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/claim-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      if (!response.ok) {
        let message = 'Failed to activate account. Please try again.';
        try {
          const payload = (await response.json()) as
            | { error?: { message?: string }; message?: string }
            | undefined;
          message = payload?.error?.message || payload?.message || message;
        } catch {
          // Ignore JSON parse failures and use fallback message.
        }

        setError(message);
        return;
      }

      setSuccess('Account activated successfully. Redirecting to sign in...');
      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Network error while activating account.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Claim Admin Account</h1>
          <p className="mt-2 text-xs text-slate-500">
            Set your password to activate dashboard access
          </p>
        </div>

        {!hasValidToken && (
          <div className="mt-6 flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>Invalid or missing claim token.</span>
          </div>
        )}

        {!!hasValidToken && !apiBaseUrl && (
          <div className="mt-6 flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>Missing NEXT_PUBLIC_API_URL configuration.</span>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          {isMounted ? (
            <div className="space-y-3">
              <div className="relative">
                <label htmlFor="password" className="sr-only">
                  New password
                </label>
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-rules password-error"
                  className="appearance-none block w-full pl-9 pr-3 py-2 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Create password"
                />
              </div>

              <div className="relative">
                <label htmlFor="confirmPassword" className="sr-only">
                  Confirm password
                </label>
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-describedby="confirm-password-error"
                  className="appearance-none block w-full pl-9 pr-3 py-2 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Confirm password"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="h-10 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-10 animate-pulse rounded-lg bg-slate-200" />
              <p className="text-xs text-slate-500">Loading secure password form...</p>
            </div>
          )}

          <div id="password-rules" className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Password rules</p>
            <ul className="mt-2 space-y-2">
              <li className={passwordRequirements.hasLength ? 'text-emerald-700' : 'text-slate-500'}>
                {passwordRequirements.hasLength ? '✓' : '•'} At least 8 characters
              </li>
              <li className={passwordRequirements.hasLetter ? 'text-emerald-700' : 'text-slate-500'}>
                {passwordRequirements.hasLetter ? '✓' : '•'} At least one letter
              </li>
              <li className={passwordRequirements.hasNumber ? 'text-emerald-700' : 'text-slate-500'}>
                {passwordRequirements.hasNumber ? '✓' : '•'} At least one number
              </li>
              <li className={confirmPassword && password === confirmPassword ? 'text-emerald-700' : 'text-slate-500'}>
                {confirmPassword && password === confirmPassword ? '✓' : '•'} Both password fields must match
              </li>
            </ul>
          </div>

          {passwordValidationError && (
            <p id="password-error" className="text-xs text-amber-700">{passwordValidationError}</p>
          )}

          {!!confirmPassword && password !== confirmPassword && (
            <p id="confirm-password-error" className="text-xs text-amber-700">Passwords must match.</p>
          )}

          {hasValidToken && (
            <p className="text-xs text-slate-500">
              Invitation link verified. Your token remains hidden.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Activating...' : 'Activate Account'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/login" className="text-xs text-slate-500 hover:text-slate-700">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ClaimAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-slate-500">Loading claim page...</p>
        </div>
      </div>
    }>
      <ClaimAccountContent />
    </Suspense>
  );
}
