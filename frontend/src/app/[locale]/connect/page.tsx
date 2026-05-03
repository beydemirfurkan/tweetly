'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ArrowUpRight,
  Bird,
  Check,
  ChevronLeft,
  Code2,
  Copy,
  ExternalLink,
  Globe2,
  KeyRound,
  MessageSquare,
  Sparkles,
  Terminal,
} from 'lucide-react';

const apiBase = (process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')
  ?? 'https://api.your-domain.com');
const mcpUrl = `${apiBase}/mcp`;
const mcpSseUrl = `${apiBase}/mcp/sse`;

type ClientKind = 'oauth' | 'apikey';

interface ClientGuide {
  id: string;
  name: string;
  kind: ClientKind;
  icon: React.ReactNode;
  blurb: string;
  steps: Array<string | { code: string; lang?: string }>;
  docUrl?: string;
}

export default function ConnectPage() {
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
            Anasayfa
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
            <span className="text-primary">●</span> Connect
          </p>
          <h1 className="mt-3 max-w-[20ch] text-[44px] font-black leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
            xtweetly&apos;yi <span className="text-primary">AI&apos;na bağla</span>
          </h1>
          <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.6] text-muted-foreground">
            Claude Desktop, ChatGPT, Cursor, Claude Code ve MCP konuşan her client
            doğrudan xtweetly&apos;ye bağlanabilir. OAuth ile tek tıkta veya API key
            ile manuel — ikisi de yayında.
          </p>

          {/* Quick URL */}
          <div className="mt-8 max-w-[640px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                MCP Server URL
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                live
              </span>
            </div>
            <CopyBox value={mcpUrl} large />
            <p className="mt-2 text-[12px] text-muted-foreground">
              Streamable HTTP + OAuth 2.1 (PKCE-S256). DCR otomatik —
              client_id/secret üretmene gerek yok.
            </p>
          </div>
        </div>
      </section>

      {/* CLIENTS */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1100px] px-5 py-16">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="text-primary">●</span> 1 dakikada kurulum
              </p>
              <h2 className="mt-3 text-[32px] font-black leading-[1.05] tracking-[-0.03em]">
                Client&apos;ı seç
              </h2>
            </div>
            <p className="hidden max-w-[40ch] text-[14px] text-muted-foreground sm:block">
              OAuth&apos;lı client&apos;larda hesap bağlama tarayıcıda; API key
              gerekmez. CLI/eski client&apos;lar için <code className="font-mono text-foreground">tk_</code> key kullan.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {clients.map((c) => (
              <ClientCard key={c.id} client={c} />
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold tracking-tight">
                  Henüz hesap yok mu?
                </h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  xtweetly&apos;ye 30 saniyede magic-link ile gir — X hesabını bağla,
                  API key veya OAuth flow&apos;uyla bu sayfaya geri dön.
                </p>
                <Link
                  href="/login"
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
                >
                  Hesap oluştur
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
              <span className="text-primary">●</span> Developer
            </p>
            <h2 className="mt-3 text-[28px] font-black leading-[1.1] tracking-[-0.025em]">
              Kendi MCP client&apos;ını mı yazıyorsun?
            </h2>
            <p className="mt-4 max-w-[44ch] text-[14px] leading-[1.65] text-muted-foreground">
              Standart MCP 2025-06-18 + RFC 9728 + RFC 8414. Discovery zinciri{' '}
              <code className="font-mono text-foreground">/.well-known/oauth-protected-resource</code>{' '}
              ile başlar. PKCE S256 zorunlu, refresh token şu anda yok (tk_* uzun-ömürlü).
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`${apiBase}/.well-known/oauth-protected-resource`}
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[12px] font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                resource metadata
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={`${apiBase}/.well-known/oauth-authorization-server`}
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[12px] font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                authorization server
                <ExternalLink className="h-3 w-3" />
              </a>
              <Link
                href={`/docs` as '/docs'}
                className="pill inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[12px] font-mono text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                API reference
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <CodeBlock
            title="DCR örneği"
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
          <span>© 2026 xtweetly</span>
          <Link href="/docs" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Code2 className="h-3.5 w-3.5" />
            API reference
          </Link>
        </div>
      </footer>
    </div>
  );
}

const clients: ClientGuide[] = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    kind: 'oauth',
    icon: <MessageSquare className="h-4 w-4" />,
    blurb: 'Custom Connectors UI. OAuth otomatik.',
    docUrl: 'https://support.anthropic.com/en/articles/10168395-setting-up-custom-connectors',
    steps: [
      'Settings → Connectors → "Add custom connector" düğmesine bas.',
      `Remote MCP server URL alanına yapıştır:`,
      { code: mcpUrl },
      'OAuth Client ID/Secret alanlarını boş bırak (DCR otomatik halleder).',
      '"Add" → tarayıcı açılır → xtweetly\'ye giriş yap → "İzin ver" → "Connected".',
    ],
  },
  {
    id: 'claude-web',
    name: 'Claude.ai (web)',
    kind: 'oauth',
    icon: <Globe2 className="h-4 w-4" />,
    blurb: 'Connectors paneli, aynı OAuth flow.',
    docUrl: 'https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp',
    steps: [
      'Sol menü → Settings → Connectors → "Add custom connector".',
      'Server URL:',
      { code: mcpUrl },
      'Tarayıcıda consent → Allow → tools listesi yüklendiğinde hazır.',
    ],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT (Connectors)',
    kind: 'oauth',
    icon: <MessageSquare className="h-4 w-4" />,
    blurb: 'Plus / Team / Enterprise — Connectors özelliği.',
    docUrl: 'https://help.openai.com/en/articles/11487775-connectors-in-chatgpt',
    steps: [
      'Settings → Connectors → "Add" → "Custom MCP server".',
      'URL:',
      { code: mcpUrl },
      'Authorize → ChatGPT yeni chat\'inde "@xtweetly" ile araçları çağır.',
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    kind: 'oauth',
    icon: <Code2 className="h-4 w-4" />,
    blurb: 'Settings → MCP. OAuth otomatik tetiklenir.',
    docUrl: 'https://docs.cursor.com/en/context/mcp',
    steps: [
      'Settings (Cmd/Ctrl+,) → MCP & Integrations → "+ Add custom MCP" → "HTTP".',
      'Name: xtweetly, URL:',
      { code: mcpUrl },
      'Save → Cursor tarayıcıda OAuth\'u açar → izin → araçlar Composer\'da görünür.',
    ],
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    kind: 'oauth',
    icon: <Terminal className="h-4 w-4" />,
    blurb: 'Remote HTTP MCP desteği. Config dosyası.',
    docUrl: 'https://github.com/openai/codex',
    steps: [
      '~/.codex/config.toml dosyana ekle:',
      {
        code: `[mcp_servers.xtweetly]
url = "${mcpUrl}"`,
      },
      'codex çalıştırınca terminal OAuth flow\'unu başlatır.',
    ],
  },
  {
    id: 'claude-code',
    name: 'Claude Code (CLI)',
    kind: 'apikey',
    icon: <Terminal className="h-4 w-4" />,
    blurb: 'Eski SSE transport + tk_* API key.',
    steps: [
      'Panel → API Keys → "+ Yeni Key" → "Full access" → secret\'ı kopyala.',
      'Terminal\'da:',
      {
        code: `claude mcp add xtweetly \\
  --transport sse \\
  --url ${mcpSseUrl} \\
  --header "Authorization: Bearer tk_***"`,
      },
      'claude başlat — "/mcp" komutuyla araçların listelendiğini gör.',
    ],
  },
];

function ClientCard({ client }: { client: ClientGuide }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/5 text-foreground">
            {client.icon}
          </div>
          <div>
            <h3 className="text-[14px] font-bold tracking-tight">{client.name}</h3>
            <p className="text-[11px] text-muted-foreground">{client.blurb}</p>
          </div>
        </div>
        <span
          className={
            client.kind === 'oauth'
              ? 'pill border border-success/40 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-success'
              : 'pill border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground'
          }
        >
          {client.kind === 'oauth' ? 'OAuth' : 'API key'}
        </span>
      </div>
      <ol className="space-y-2.5 px-5 py-4 text-[13px] leading-[1.55]">
        {client.steps.map((step, i) => {
          if (typeof step === 'string') {
            return (
              <li key={i} className="flex gap-2.5">
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-muted-foreground">{step}</span>
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
      {client.docUrl && (
        <div className="border-t border-border px-5 py-2.5">
          <a
            href={client.docUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground transition-colors hover:text-foreground"
          >
            resmi doküman
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
        'flex items-start gap-2 rounded-md border border-border bg-popover ' +
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
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
