import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  ArrowUpRight,
  Bird,
  BookOpen,
  ChevronLeft,
  Code2,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';

const apiBase = (process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '');
const swaggerUrl = apiBase ? `${apiBase}/docs` : '';
const openapiUrl = apiBase ? `${apiBase}/api/openapi.json` : '';

export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Top nav — landing parity */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
              <Bird className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight">Tweetly</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back home
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(900px 420px at 80% -10%, color-mix(in oklab, var(--primary) 22%, transparent) 0%, transparent 60%), radial-gradient(700px 360px at 5% 110%, color-mix(in oklab, var(--primary) 14%, transparent) 0%, transparent 55%)',
          }}
        />
        <div className="mx-auto max-w-[1100px] px-5 py-20 lg:py-24">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> API Reference
          </p>
          <h1 className="mt-3 max-w-[18ch] text-[48px] font-black leading-[1.05] tracking-[-0.035em] sm:text-[64px]">
            Tweetly <span className="text-primary">API</span>
          </h1>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.55] text-muted-foreground">
            Production-grade Swagger UI, served live from the backend. Every route
            documented, every error envelope spelled out — the same OpenAPI 3.1
            spec our MCP tools are generated from.
          </p>

          {apiBase ? (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={swaggerUrl}
                target="_blank"
                rel="noreferrer"
                className="pill group inline-flex items-center gap-2 bg-foreground px-7 py-3.5 text-[15px] font-bold text-background transition-transform hover:scale-[1.02]"
              >
                <BookOpen className="h-4 w-4" strokeWidth={2.75} />
                Open Swagger UI
                <ArrowUpRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.75}
                />
              </a>
              <a
                href={openapiUrl}
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border px-5 py-3.5 font-mono text-[12px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                openapi.json
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </a>
            </div>
          ) : (
            <div className="mt-8 max-w-[640px] rounded-2xl border border-primary/40 bg-primary/5 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold tracking-tight text-foreground">
                    Backend URL not configured
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.55] text-muted-foreground">
                    Set <span className="font-mono text-foreground">NEXT_PUBLIC_API_URL</span> in your
                    environment to point this page (and every Docs link) at your live
                    backend. In production it&apos;s usually
                    something like <span className="font-mono text-foreground">https://api.tweetly.app</span>.
                  </p>
                  <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-popover px-4 py-3 font-mono text-[12px] leading-[1.65] text-muted-foreground">
<span className="text-muted-foreground"># frontend/.env.local</span>{'\n'}
<span className="text-foreground">NEXT_PUBLIC_API_URL=</span><span className="text-primary">http://localhost:3000</span>
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Endpoint preview — same panel as on landing */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 px-5 py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <span className="text-primary">●</span> Surface
            </p>
            <h2 className="mt-3 max-w-[20ch] text-[34px] font-black leading-[1.05] tracking-[-0.03em]">
              What you can do over HTTP.
            </h2>
            <p className="mt-5 max-w-[44ch] text-[14px] leading-[1.65] text-muted-foreground">
              Bearer-token auth, JSON in/out, deterministic error envelopes, and an
              idempotency contract on every write endpoint. Pick your client — REST,
              MCP, or the generated SDK.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/"
                className="pill inline-flex items-center gap-2 border border-border px-5 py-3 text-[13px] font-semibold transition-colors hover:bg-accent"
              >
                <Code2 className="h-4 w-4" />
                See MCP setup
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-popover">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.78_0.155_80)]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
              </div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                tweetly · openapi 3.1
              </span>
              <span className="font-mono text-[11px] text-success">
                {apiBase ? '● live' : '○ unset'}
              </span>
            </div>
            <ul className="divide-y divide-border font-mono text-[12px]">
              <Endpoint method="POST" path="/api/v1/actions/post" desc="post a tweet" />
              <Endpoint method="POST" path="/api/v1/actions/reply" desc="reply to tweet" />
              <Endpoint method="POST" path="/api/v1/actions/quote" desc="quote tweet" />
              <Endpoint method="POST" path="/api/v1/actions/retweet" desc="retweet" />
              <Endpoint method="POST" path="/api/v1/actions/like" desc="like tweet" />
              <Endpoint method="POST" path="/api/v1/actions/follow" desc="follow user" />
              <Endpoint method="POST" path="/api/v1/actions/dm" desc="send direct message" />
              <Endpoint method="GET" path="/api/v1/search/tweets" desc="search tweets" />
              <Endpoint method="GET" path="/api/v1/users/:handle" desc="fetch user profile" />
              <Endpoint method="GET" path="/api/v1/me/summary" desc="account summary" />
              <Endpoint method="POST" path="/api/v1/monitors" desc="create monitor + webhook" />
            </ul>
            <div className="border-t border-border px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground">
              + 23 more · open Swagger UI for the full list
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-7 text-[12px] text-muted-foreground">
          <span>© 2026 Tweetly</span>
          <span className="inline-flex items-center gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />
            OpenAPI 3.1
          </span>
        </div>
      </footer>
    </div>
  );
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  path: string;
  desc: string;
}) {
  const methodColor = {
    GET: 'text-success border-success/40',
    POST: 'text-primary border-primary/40',
    DELETE: 'text-destructive border-destructive/40',
    PATCH: 'text-[oklch(0.78_0.155_80)] border-[oklch(0.78_0.155_80)]/40',
  }[method];
  return (
    <li className="row-hover flex items-center gap-3 px-4 py-2.5">
      <span
        className={`pill min-w-[44px] border px-2 text-center text-[10px] font-bold tracking-wider ${methodColor}`}
      >
        {method}
      </span>
      <span className="text-foreground">{path}</span>
      <span className="ml-auto text-muted-foreground">{desc}</span>
    </li>
  );
}
