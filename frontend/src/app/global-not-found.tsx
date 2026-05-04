import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { ArrowUpRight, Bird, Home, ScrollText } from 'lucide-react';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: '404 — xtweetly',
  description: 'This page is not in the timeline.',
};

export default function GlobalNotFound() {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(700px 360px at 80% 0%, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 60%), radial-gradient(600px 320px at 10% 100%, color-mix(in oklab, var(--primary) 12%, transparent) 0%, transparent 55%)',
            }}
          />

          <main className="relative w-full max-w-[520px] animate-fade-up">
            <Link
              href="/"
              className="mb-10 inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
                <Bird className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </div>
              <span className="text-[15px] font-extrabold tracking-tight">
                xtweetly
              </span>
            </Link>

            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
              <span className="animate-pulse-dot">●</span> 404 · Not found
            </p>
            <h1 className="mt-3 text-[80px] font-black leading-[0.95] tracking-[-0.04em] sm:text-[112px]">
              4<span className="text-primary">0</span>4
            </h1>
            <p className="mt-2 max-w-[40ch] text-[20px] font-semibold leading-[1.25] tracking-tight">
              This page is not in the timeline.
            </p>
            <p className="mt-3 max-w-[44ch] text-[14px] leading-[1.6] text-muted-foreground">
              The route you tried to reach doesn&apos;t exist — either it never did,
              or it moved.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="pill group inline-flex items-center gap-2 bg-foreground px-6 py-3 text-[14px] font-bold text-background transition-transform hover:scale-[1.02]"
              >
                <Home className="h-4 w-4" strokeWidth={2.5} />
                Take me home
                <ArrowUpRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.75}
                />
              </Link>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border px-5 py-3 text-[13px] font-semibold transition-colors hover:bg-accent"
              >
                <ScrollText className="h-4 w-4" />
                API Reference
              </a>
            </div>

            <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-popover">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.78_0.155_80)]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
                </div>
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  xtweetly · router
                </span>
                <span className="font-mono text-[11px] text-destructive">● 404</span>
              </div>
              <pre className="px-4 py-3 font-mono text-[12px] leading-[1.7] text-muted-foreground">
<span className="text-muted-foreground">{'> '}</span><span className="text-foreground">resolve(request.url)</span>{'\n'}
<span className="text-destructive">{'!'}</span><span className="text-muted-foreground"> no matching route — falling through to /global-not-found</span>
              </pre>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
