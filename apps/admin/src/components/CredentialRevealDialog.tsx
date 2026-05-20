'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Copy, KeyRound, ShieldAlert } from 'lucide-react';

const REVEAL_TIMEOUT_MS = 30000;

export interface RevealedCredential {
  id: string;
  label: string;
  value: string;
  tone: 'live' | 'test';
}

interface CredentialRevealDialogProps {
  title: string;
  tenantName?: string;
  credentials: RevealedCredential[];
  onClear: () => void;
}

export function CredentialRevealDialog({
  title,
  tenantName,
  credentials,
  onClear,
}: CredentialRevealDialogProps) {
  const pathname = usePathname();
  const initialPathnameRef = useRef(pathname);
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;
  const expiresAtRef = useRef(Date.now() + REVEAL_TIMEOUT_MS);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(() => Math.ceil(REVEAL_TIMEOUT_MS / 1000));

  useEffect(() => {
    const expiresAt = expiresAtRef.current;
    const clearTimer = window.setTimeout(() => onClearRef.current(), REVEAL_TIMEOUT_MS);
    const tickTimer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    }, 1000);

    return () => {
      window.clearTimeout(clearTimer);
      window.clearInterval(tickTimer);
    };
  }, []);

  useEffect(() => {
    if (pathname !== initialPathnameRef.current) {
      onClearRef.current();
    }
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (credential: RevealedCredential) => {
    try {
      await navigator.clipboard.writeText(credential.value);
      setCopiedId(credential.id);
      setCopyError(null);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId((current) => (current === credential.id ? null : current)), 1500);
    } catch {
      setCopiedId(null);
      setCopyError(`Failed to copy ${credential.label}. Please copy manually.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">One-Time Reveal</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {tenantName ? `${tenantName}. ` : ''}These secrets are shown once and clear automatically in {secondsRemaining}s.
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {copyError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <div className="flex items-start gap-3">
                <ShieldAlert size={18} className="mt-0.5 text-red-600" />
                <div>
                  <p className="font-semibold">Copy failed</p>
                  <p className="mt-1 text-red-800">{copyError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold">Store these keys now.</p>
                <p className="mt-1 text-amber-800">
                  They are never reloaded from storage, URLs, logs, or audit history after this panel closes.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {credentials.map((credential) => (
              <section
                key={credential.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    <div
                      className={`rounded-xl p-2 ${
                        credential.tone === 'live'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      <KeyRound size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{credential.label}</h3>
                      <p className="text-xs text-slate-500">
                        {credential.tone === 'live' ? 'Production traffic' : 'Sandbox traffic'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(credential)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy size={14} />
                    {copiedId === credential.id ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <code className="break-all text-sm text-slate-950">{credential.value}</code>
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
