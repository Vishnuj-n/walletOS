'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, API_BASE_URL } from '../../lib/supabase';

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

export default function ClaimPage() {
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

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Tenant Claim</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Claim your admin access</h1>
        <p className="mt-3 text-sm text-slate-300">{message}</p>

        {state === 'ready' || state === 'submitting' ? (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-200">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-400"
                placeholder="Set a password"
                disabled={state === 'submitting'}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-200">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-400"
                placeholder="Repeat the password"
                disabled={state === 'submitting'}
              />
            </div>

            <button
              type="submit"
              disabled={state === 'submitting'}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === 'submitting' ? 'Activating...' : 'Claim access'}
            </button>
          </form>
        ) : null}

        {isTerminalState ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
            {state === 'success' ? 'Your session is being refreshed before redirect.' : 'Use the latest invite email if you need to restart the claim flow.'}
          </div>
        ) : null}
      </div>
    </div>
  );
}
