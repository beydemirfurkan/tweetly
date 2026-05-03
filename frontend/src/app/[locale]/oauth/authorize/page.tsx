'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bird, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiUrl, apiFetch, getToken } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface ClientInfo {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

interface ConfirmResponse {
  redirect_to: string;
}

const REQUIRED_PARAMS = [
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
] as const;

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <OAuthAuthorizeInner />
    </Suspense>
  );
}

function SuspenseFallback() {
  const t = useTranslations('oauth');
  return <CenteredSpinner label={t('loading')} />;
}

function OAuthAuthorizeInner() {
  const t = useTranslations('oauth');
  const search = useSearchParams();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loadError, setLoadError] = useState<string>('');
  const [submitting, setSubmitting] = useState<'allow' | 'deny' | null>(null);
  const [submitError, setSubmitError] = useState<string>('');

  const params = useMemo(() => {
    const obj: Record<string, string> = {};
    for (const key of REQUIRED_PARAMS) obj[key] = search.get(key) ?? '';
    obj.state = search.get('state') ?? '';
    obj.scope = search.get('scope') ?? '*';
    obj.response_type = search.get('response_type') ?? 'code';
    return obj;
  }, [search]);

  const missing = REQUIRED_PARAMS.filter((k) => !params[k]);
  const wrongMethod = params.code_challenge_method && params.code_challenge_method !== 'S256';
  const wrongResponseType = params.response_type && params.response_type !== 'code';

  // Bounce to login while preserving full query string.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (typeof window === 'undefined') return;
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }, [isAuthenticated, isLoading]);

  // Fetch client metadata so the user sees who's asking for access.
  useEffect(() => {
    if (!params.client_id || !isAuthenticated) return;
    let cancelled = false;
    apiFetch<ClientInfo>(`/oauth/clients/${encodeURIComponent(params.client_id)}`, {
      skipAuthRedirect: true,
    })
      .then((c) => {
        if (cancelled) return;
        setClient(c);
        if (!c.redirect_uris.includes(params.redirect_uri)) {
          setLoadError(t('errors.redirectMismatch', { uri: params.redirect_uri }));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message || t('errors.clientFetch'));
      });
    return () => {
      cancelled = true;
    };
  }, [params.client_id, params.redirect_uri, isAuthenticated]);

  const submit = useCallback(
    async (decision: 'allow' | 'deny') => {
      setSubmitting(decision);
      setSubmitError('');
      try {
        const token = getToken();
        if (!token) throw new Error(t('errors.noSession'));
        const res = await fetch(apiUrl('/oauth/authorize/confirm'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            client_id: params.client_id,
            redirect_uri: params.redirect_uri,
            code_challenge: params.code_challenge,
            code_challenge_method: params.code_challenge_method,
            state: params.state,
            scope: params.scope,
            decision,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || t('errors.serverWithStatus', { status: res.status }));
        }
        const data = (await res.json()) as ConfirmResponse;
        window.location.href = data.redirect_to;
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : t('errors.unknown'));
        setSubmitting(null);
      }
    },
    [params, t],
  );

  if (isLoading || !isAuthenticated) {
    return <CenteredSpinner label={t('verifyingSession')} />;
  }

  if (missing.length > 0 || wrongResponseType || wrongMethod) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-bold tracking-tight">{t('invalid.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {missing.length > 0
            ? t('invalid.missing', { keys: missing.join(', ') })
            : wrongResponseType
              ? t('invalid.wrongResponseType', { got: params.response_type })
              : t('invalid.wrongMethod', { got: params.code_challenge_method })}
        </p>
      </CenteredCard>
    );
  }

  if (loadError) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-bold tracking-tight">{t('denied.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
      </CenteredCard>
    );
  }

  if (!client) {
    return <CenteredSpinner label={t('loadingClient')} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background">
            <Bird className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <span className="text-primary">●</span> {t('eyebrow')}
            </p>
            <h1 className="text-lg font-bold tracking-tight">{t('cardTitle')}</h1>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t.rich('requestLine', {
              name: client.client_name,
              strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
            })}
          </p>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {t.rich('scopeBlurb', {
              email: user?.email ?? '',
              strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background px-3 py-2 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono text-muted-foreground">
              {new URL(params.redirect_uri).host}
            </span>
          </div>
        </div>

        {submitError && (
          <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {submitError}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => submit('deny')}
            disabled={submitting !== null}
          >
            {submitting === 'deny' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('denyButton')}
          </Button>
          <Button
            className="flex-1"
            onClick={() => submit('allow')}
            disabled={submitting !== null}
          >
            {submitting === 'allow' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('allowButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">{children}</div>
    </div>
  );
}
