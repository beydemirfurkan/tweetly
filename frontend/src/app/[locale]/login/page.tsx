'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bird, AlertCircle, MailCheck } from 'lucide-react';

export default function LoginPage() {
  const t = useTranslations('login');
  const { requestLink, isAuthenticated } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const getNextPath = () => {
    if (typeof window === 'undefined') return '/dashboard';
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next?.startsWith('/')) return '/dashboard';
    // Strip locale prefix so next-intl router doesn't double-add it
    const stripped = next.replace(/^\/(tr|en)/, '');
    return stripped || '/dashboard';
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(getNextPath() as '/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const result = await requestLink(email.trim());
    setLoading(false);
    if (result.ok) {
      setSent(true);
    } else {
      setError(result.error ?? t('genericError'));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(700px 360px at 80% 0%, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 60%), radial-gradient(600px 320px at 10% 100%, color-mix(in oklab, var(--primary) 12%, transparent) 0%, transparent 55%)',
        }}
      />

      <div className="relative flex w-full max-w-[420px] flex-col items-center gap-8 animate-fade-up">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
            <Bird className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> {t('subtitle')}
          </p>
          <h1 className="text-[32px] font-black leading-[1] tracking-[-0.03em]">
            {t.rich('title', {
              brand: (chunks) => <span className="text-primary">{chunks}</span>,
            })}
          </h1>
        </div>

        <div className="w-full rounded-2xl border border-border bg-card p-6">
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MailCheck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t('sentTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('sentDesc', { email })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail('');
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                {t('tryDifferent')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {t('email')}
                </label>
                <Input
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-10 bg-input text-sm placeholder:text-muted-foreground/50"
                  autoComplete="email"
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="pill h-10 w-full text-sm font-semibold"
                disabled={loading || !email.trim()}
              >
                {loading ? t('sending') : t('submit')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
