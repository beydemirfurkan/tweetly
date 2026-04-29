'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bird, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

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
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    const ok = await login(token.trim());
    if (ok) {
      router.replace(getNextPath());
    } else {
      setError('Token geçersiz veya sunucuya ulaşılamıyor.');
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 50%, oklch(0.72 0.148 196 / 0.07) 0%, transparent 65%)',
        }}
      />

      {/* Login card */}
      <div className="relative w-full max-w-sm animate-fade-up px-4">
        {/* Logo */}
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
              Admin Paneli
            </p>
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-xl border border-border bg-card p-6"
          style={{ boxShadow: '0 0 0 1px oklch(0.72 0.148 196 / 0.08), 0 20px 60px oklch(0.05 0.02 258 / 0.6)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Admin Token
              </label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Token girin..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={loading}
                  className="h-10 bg-input pr-10 font-mono text-sm placeholder:font-sans placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
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
              disabled={loading || !token.trim()}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin-slow" />
                  Doğrulanıyor...
                </span>
              ) : (
                'Giriş Yap'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
