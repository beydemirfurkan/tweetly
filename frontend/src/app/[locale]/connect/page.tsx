'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  ArrowUpRight,
  Bird,
  Check,
  ChevronLeft,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { AnthropicLogo, OpenAILogo, CursorLogo } from '@/components/brand-logos';

const apiBase = (process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')
  ?? 'https://api.your-domain.com');
const mcpUrl = `${apiBase}/mcp`;
const mcpSseUrl = `${apiBase}/mcp/sse`;

type ClientKind = 'oauth' | 'apikey';
type ClientId = 'claudeDesktop' | 'claudeWeb' | 'chatgpt' | 'cursor' | 'codex' | 'claudeCode';

interface ClientConfig {
  id: ClientId;
  kind: ClientKind;
  icon: React.ReactNode;
  // Each step is either a translation key segment under `connect.<id>.*`
  // (e.g. 'step1') or an inline code block to render verbatim.
  steps: Array<string | { code: string }>;
  docUrl?: string;
}

export default function ConnectPage() {
  const t = useTranslations('connect');

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
              <Bird className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight">xtweetly</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('back')}
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(900px 420px at 80% -10%, color-mix(in oklab, var(--primary) 22%, transparent) 0%, transparent 60%), radial-gradient(700px 360px at 5% 110%, color-mix(in oklab, var(--primary) 14%, transparent) 0%, transparent 55%)',
          }}
        />
        <div className="mx-auto max-w-[1100px] px-5 py-16 lg:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary animate-pulse">●</span> {t('hero.eyebrow')}
          </p>
          <h1 className="mt-3 max-w-[20ch] text-[44px] font-black leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
            {t('hero.title1')} <span className="text-primary">{t('hero.title2')}</span>
          </h1>
          <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.6] text-muted-foreground">
            {t('hero.subtitle')}
          </p>

          <div className="mt-8 max-w-[640px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('hero.serverUrlLabel')}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-success">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                {t('hero.live')}
              </span>
            </div>
            <CopyBox value={mcpUrl} large />
            <p className="mt-2 text-[12px] text-muted-foreground">{t('hero.helper')}</p>
          </div>
        </div>
      </section>

      {/* CLIENTS */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1100px] px-5 py-16">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="text-primary">●</span> {t('clients.eyebrow')}
              </p>
              <h2 className="mt-3 text-[32px] font-black leading-[1.05] tracking-[-0.03em]">
                {t('clients.title')}
              </h2>
            </div>
            <p className="hidden max-w-[40ch] text-[14px] text-muted-foreground sm:block">
              {t('clients.helper')}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {clientConfigs.map((c) => (
              <ClientCard key={c.id} config={c} />
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold tracking-tight">
                  {t('noAccount.title')}
                </h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{t('noAccount.body')}</p>
                <Link
                  href="/login"
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
                >
                  {t('noAccount.cta')}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DEVELOPER */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-10 px-5 py-16 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <span className="text-primary">●</span> {t('developer.eyebrow')}
            </p>
            <h2 className="mt-3 text-[28px] font-black leading-[1.1] tracking-[-0.025em]">
              {t('developer.title')}
            </h2>
            <p className="mt-4 max-w-[44ch] text-[14px] leading-[1.65] text-muted-foreground">
              {t('developer.body')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`${apiBase}/.well-known/oauth-protected-resource`}
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[12px] font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t('developer.resourceMetadata')}
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={`${apiBase}/.well-known/oauth-authorization-server`}
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[12px] font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t('developer.authServer')}
                <ExternalLink className="h-3 w-3" />
              </a>
              <Link
                href={'/docs' as '/docs'}
                className="pill inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[12px] font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t('apiReference')}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <CodeBlock
            title={t('developer.codeTitle')}
            code={`# 1. Register a new OAuth client (no auth required)
curl -X POST ${apiBase}/oauth/register \\
  -H 'Content-Type: application/json' \\
  -d '{
    "client_name": "my-app",
    "redirect_uris": ["http://localhost:8080/cb"]
  }'

# Response:
# { "client_id": "oauth_...", "client_secret": "...", ... }

# 2. Send user to authorization endpoint with PKCE challenge:
# https://tw-panel.beydemir.dev/oauth/authorize?
#   response_type=code&client_id=...&redirect_uri=...
#   &code_challenge=BASE64URL(SHA256(verifier))&code_challenge_method=S256
#   &state=...

# 3. Exchange code for access token:
curl -X POST ${apiBase}/oauth/token \\
  -d 'grant_type=authorization_code' \\
  -d 'code=...' -d 'code_verifier=...' \\
  -d 'client_id=...' -d 'client_secret=...' \\
  -d 'redirect_uri=...'

# Response: { "access_token": "tk_...", "token_type": "Bearer" }`}
          />
        </div>
      </section>

      <footer>
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-7 text-[12px] text-muted-foreground">
          <span>{t('footer')}</span>
          <Link href="/docs" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Code2 className="h-3.5 w-3.5" />
            {t('apiReference')}
          </Link>
        </div>
      </footer>
    </div>
  );
}

const clientConfigs: ClientConfig[] = [
  {
    id: 'claudeDesktop',
    kind: 'oauth',
    icon: <AnthropicLogo className="h-4 w-4" title="Anthropic" />,
    docUrl: 'https://support.anthropic.com/en/articles/10168395-setting-up-custom-connectors',
    steps: ['step1', 'step2', { code: mcpUrl }, 'step3', 'step4'],
  },
  {
    id: 'claudeWeb',
    kind: 'oauth',
    icon: <AnthropicLogo className="h-4 w-4" title="Anthropic" />,
    docUrl: 'https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp',
    steps: ['step1', 'step2', { code: mcpUrl }, 'step3'],
  },
  {
    id: 'chatgpt',
    kind: 'oauth',
    icon: <OpenAILogo className="h-4 w-4" title="OpenAI" />,
    docUrl: 'https://help.openai.com/en/articles/11487775-connectors-in-chatgpt',
    steps: ['step1', 'step2', { code: mcpUrl }, 'step3'],
  },
  {
    id: 'cursor',
    kind: 'oauth',
    icon: <CursorLogo className="h-4 w-4" title="Cursor" />,
    docUrl: 'https://docs.cursor.com/en/context/mcp',
    steps: ['step1', 'step2', { code: mcpUrl }, 'step3'],
  },
  {
    id: 'codex',
    kind: 'oauth',
    icon: <OpenAILogo className="h-4 w-4" title="OpenAI" />,
    docUrl: 'https://github.com/openai/codex',
    steps: [
      'step1',
      { code: `[mcp_servers.xtweetly]\nurl = "${mcpUrl}"` },
      'step2',
    ],
  },
  {
    id: 'claudeCode',
    kind: 'apikey',
    icon: <Terminal className="h-4 w-4" />,
    steps: [
      'step1',
      'step2',
      {
        code: `claude mcp add xtweetly \\\n  --transport sse \\\n  --url ${mcpSseUrl} \\\n  --header "Authorization: Bearer tk_***"`,
      },
      'step3',
    ],
  },
];

function ClientCard({ config }: { config: ClientConfig }) {
  const t = useTranslations(`connect.${config.id}`);
  const tShared = useTranslations('connect.clients');

  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            {config.icon}
          </div>
          <div>
            <h3 className="text-[14px] font-bold tracking-tight">{t('name')}</h3>
            <p className="text-[11px] text-muted-foreground">{t('blurb')}</p>
          </div>
        </div>
        <span
          className={
            config.kind === 'oauth'
              ? 'pill border border-success/40 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-success'
              : 'pill border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground'
          }
        >
          {config.kind === 'oauth'
            ? tShared('oauthBadge')
            : tShared('apikeyBadge')}
        </span>
      </div>
      <ol className="space-y-2.5 px-5 py-4 text-[13px] leading-[1.55]">
        {config.steps.map((step, i) => {
          if (typeof step === 'string') {
            return (
              <li key={i} className="flex gap-2.5">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-muted-foreground">{t(step)}</span>
              </li>
            );
          }
          return (
            <li key={i} className="ml-6">
              <CopyBox value={step.code} small />
            </li>
          );
        })}
      </ol>
      {config.docUrl && (
        <div className="border-t border-border px-5 py-2.5">
          <a
            href={config.docUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground transition-colors hover:text-foreground"
          >
            {tShared('officialDocs')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function CopyBox({
  value,
  small,
  large,
}: {
  value: string;
  small?: boolean;
  large?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      className={
        'flex items-start gap-2 rounded-md border border-border bg-popover transition-colors ' +
        (copied ? 'border-success/50 ' : 'hover:border-border/80 ') +
        (large ? 'px-4 py-3' : small ? 'px-3 py-2' : 'px-3 py-2.5')
      }
    >
      <pre
        className={
          'flex-1 overflow-x-auto whitespace-pre font-mono text-foreground ' +
          (large ? 'text-[15px]' : 'text-[12px]')
        }
      >
        {value}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-90"
        aria-label="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-popover">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-90"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre p-4 font-mono text-[12px] leading-[1.6] text-foreground">
        {code}
      </pre>
    </div>
  );
}
