'use client';

import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Bird, AlertCircle, Loader2 } from 'lucide-react';

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyShell><Loading /></VerifyShell>}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const t = useTranslations('verify');
  const { consumeToken, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState<string | null>(() => (token ? null : t('tokenMissing')));
  const [working, setWorking] = useState(() => Boolean(token));

  useEffect(() => {
    if (!token) return;
    consumeToken(token).then((result) => {
      setWorking(false);
      if (result.ok) {
        router.replace('/dashboard' as const);
      } else {
        setError(result.error ?? t('invalid'));
      }
    });
  }, [consumeToken, router, token, t]);

  useEffect(() => {
    if (isAuthenticated && !working && !error) {
      router.replace('/dashboard' as const);
    }
  }, [isAuthenticated, working, error, router]);

  return (
    <VerifyShell>
      {working ? (
        <Loading />
      ) : error ? (
        <div className="space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm text-destructive">{error}</p>
          <Link
            href="/login"
            className="inline-block text-xs underline text-muted-foreground hover:text-foreground"
          >
            {t('retry')}
          </Link>
        </div>
      ) : null}
    </VerifyShell>
  );
}

function VerifyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
          <Bird className="h-5 w-5" strokeWidth={2.5} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Loading() {
  const t = useTranslations('verify');
  return (
    <div className="flex flex-col items-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t('verifying')}</p>
    </div>
  );
}
