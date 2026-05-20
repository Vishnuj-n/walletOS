'use client';

import { FormEvent, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, API_BASE_URL, parseSupabaseCallbackHash } from '../../lib/supabase';
import { ShieldCheck, Lock, AlertCircle, KeyRound } from 'lucide-react';

function getSupabaseCallbackError() {
  const parsed = parseSupabaseCallbackHash();
  if (parsed?.errorCode === 'otp_expired') {
    return {
      state: 'expired-invite' as const,
      message: parsed.errorDescription || 'This invite link has expired. Ask the tenant owner to send a new invite.',
    };
  }
  return null;
}

type ClaimState =
  | 'waiting-session'
  | 'ready'
  | 'submitting'
  | 'missing-session'
  | 'expired-invite'
  | 'already-activated'
  | 'unauthorized-tenant'
  | 'success'
  | 'error';

function mapActivationError(message: string): ClaimState {
  const normalized = message.toLowerCase();
  if (normalized.includes('expired') || normalized.includes('invalid or expired')) return 'expired-invite';
  if (normalized.includes('already been activated')) return 'already-activated';
  if (normalized.includes('pending invite not found') || normalized.includes('tenant scope')) return 'unauthorized-tenant';
  return 'error';
}

function ClaimContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenant_id') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<ClaimState>('waiting-session');
  const [message, setMessage] = useState('Waiting for the invited Supabase session.');

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const callbackError = getSupabaseCallbackError();
      if (callbackError) {
        if (active) {
          setState(callbackError.state);
          setMessage(callbackError.message);
        }

        await supabase.auth.signOut();
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!tenantId) {
        setState('unauthorized-tenant');
        setMessage('Missing tenant context in the invite link.');
        return;
      }

      if (!session?.access_token) {
        setState('missing-session');
        setMessage('Open the latest invite link again to establish the claim session.');
        return;
      }

      setState('ready');
      setMessage('Set a password to finish claiming this tenant admin invite.');
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;

      if (!tenantId) {
        setState('unauthorized-tenant');
        setMessage('Missing tenant context in the invite link.');
      } else if (session?.access_token) {
        setState('ready');
        setMessage('Set a password to finish claiming this tenant admin invite.');
      } else {
        setState('missing-session');
        setMessage('Open the latest invite link again to establish the claim session.');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [tenantId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      setState('error');
      setMessage('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setState('error');
      setMessage('Passwords do not match.');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setState('missing-session');
      setMessage('Open the latest invite link again to establish the claim session.');
      return;
    }

    setState('submitting');
    setMessage('Finalizing your tenant admin activation.');

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setState('error');
      setMessage(passwordError.message);
      return;
    }

    const activationResponse = await fetch(`${API_BASE_URL}/admin/invitations/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ tenant_id: tenantId }),
    });

    if (!activationResponse.ok) {
      let errorMessage = 'Failed to activate invitation.';
      try {
        const payload = (await activationResponse.json()) as { error?: { message?: string } };
        errorMessage = payload.error?.message ?? errorMessage;
      } catch {
        // fall through with the default message
      }
      const mappedState = mapActivationError(errorMessage);
      setState(mappedState);
      setMessage(errorMessage);
      return;
    }

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      setState('error');
      setMessage(refreshError.message);
      return;
    }

    setState('success');
    setMessage('Activation complete. Redirecting to the dashboard.');
    window.setTimeout(() => router.push('/dashboard'), 800);
  };

  const isTerminalState =
    state === 'missing-session' ||
    state === 'expired-invite' ||
    state === 'already-activated' ||
    state === 'unauthorized-tenant' ||
    state === 'error' ||
    state === 'success';

  let HeaderIcon = KeyRound;
  let badgeColor = 'bg-blue-50 text-blue-600';

  if (state === 'success') {
    HeaderIcon = ShieldCheck;
    badgeColor = 'bg-emerald-50 text-emerald-600';
  } else if (state === 'waiting-session' || state === 'missing-session') {
    HeaderIcon = ShieldCheck;
    badgeColor = 'bg-amber-50 text-amber-600';
  } else if (
    state === 'expired-invite' ||
    state === 'already-activated' ||
    state === 'unauthorized-tenant' ||
    state === 'error'
  ) {
    HeaderIcon = AlertCircle;
    badgeColor = 'bg-red-50 text-red-600';
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <div>
          <div className={`mx-auto mb-4 w-10 h-10 rounded-lg ${badgeColor} flex items-center justify-center`}>
            <HeaderIcon size={20} />
          </div>
          <h2 className="text-center text-lg font-semibold text-slate-900">
            Tenant Claim
          </h2>
          <p className="mt-2 text-center text-xs text-slate-500">
            {message}
          </p>
        </div>

        {state === 'ready' || state === 'submitting' ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                New password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="appearance-none block w-full pl-9 pr-3 py-2 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Set a password"
                  disabled={state === 'submitting'}
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Confirm password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="appearance-none block w-full pl-9 pr-3 py-2 border border-slate-300 placeholder-slate-400 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Repeat the password"
                  disabled={state === 'submitting'}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {state === 'submitting' ? 'Activating...' : 'Claim access'}
              </button>
            </div>
          </form>
        ) : null}

        {isTerminalState ? (
          <div
            className={`mt-6 rounded-lg border p-4 text-xs ${
              state === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : state === 'missing-session'
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {state === 'success'
              ? 'Your session is being refreshed before redirect.'
              : state === 'expired-invite'
                ? 'This invite link has expired. Ask the tenant owner to send a fresh invite.'
                : 'Use the latest invite email if you need to restart the claim flow.'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center text-sm text-slate-500">
          Loading claim session...
        </div>
      </div>
    }>
      <ClaimContent />
    </Suspense>
  );
}
