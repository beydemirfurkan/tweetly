'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bird, AlertCircle, MailCheck } from 'lucide-react';

export default function LoginPage() {
  const { requestLink, isAuthenticated } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const getNextPath = () => {
    if (typeof window === 'undefined') return '/';
    const next = new URLSearchParams(window.location.search).get('next');
    return next?.startsWith('/') ? next : '/';
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(getNextPath());
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
      setError(result.error ?? 'Bir hata oluştu');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 50%, oklch(0.72 0.148 196 / 0.07) 0%, transparent 65%)',
        }}
      />

      <div className="relative w-full max-w-sm animate-fade-up px-4">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-primary/10 border border-primary/20" />
            <div
              className="absolute inset-[-6px] rounded-[22px] border border-primary/8"
              style={{ boxShadow: '0 0 30px oklch(0.72 0.148 196 / 0.15)' }}
            />
            <Bird className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <h1
              className="text-2xl font-bold tracking-[0.15em] text-foreground uppercase"
              style={{ fontFamily: 'var(--font-syne)' }}
            >
              Tweetly
            </h1>
            <p className="mt-1 text-xs tracking-widest text-muted-foreground uppercase">
              MCP Platform
            </p>
          </div>
        </div>

        <div
          className="rounded-xl border border-border bg-card p-6"
          style={{
            boxShadow:
              '0 0 0 1px oklch(0.72 0.148 196 / 0.08), 0 20px 60px oklch(0.05 0.02 258 / 0.6)',
          }}
        >
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MailCheck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Bağlantı gönderildi</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {email} adresine giriş bağlantısı gönderildi. 15 dakika içinde geçerli.
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
                Farklı bir e-posta dene
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  E-posta
                </label>
                <Input
                  type="email"
                  placeholder="you@example.com"
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
                className="h-10 w-full text-sm font-medium tracking-wide"
                disabled={loading || !email.trim()}
              >
                {loading ? 'Gönderiliyor...' : 'Giriş bağlantısı gönder'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
