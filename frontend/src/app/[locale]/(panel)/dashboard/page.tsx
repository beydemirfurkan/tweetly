'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useApiFetch, apiUrl, type ApiKey, type UserSummary } from '@/lib/api';
import { useUser } from '@clerk/nextjs';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardData {
  summary: UserSummary;
  apiKeys: ApiKey[];
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<UserSummary>('/api/v1/me/summary'),
      apiFetch<ApiKey[]>('/auth/api-keys'),
    ])
      .then(([summary, apiKeys]) => setData({ summary, apiKeys }))
      .catch((err: Error) => setError(err.message));
  }, [apiFetch]);

  if (error) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t('serverError')}: {error}
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  const activeKeys = data.apiKeys.filter((k) => !k.revokedAt);
  const firstActiveKey = activeKeys[0];
  const totalDead = data.summary.queue.totalDead;
  const queueClean = data.summary.queue.totalPending === 0 && totalDead === 0;

  const copyCmd = async () => {
    const cmd = `claude mcp add xtweetly --url ${apiUrl('/mcp/sse')} --header "Authorization: Bearer ${firstActiveKey ? firstActiveKey.prefix + '...' : 'tk_...'}"`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="animate-fade-up">
      {/* HEADER — X profile-page silhouette */}
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> Dashboard
          </p>
          <h1 className="mt-2 text-[32px] font-black leading-tight tracking-[-0.025em]">
            {t('title')}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {t('welcome')}
            {user ? (
              <>
                {' '}
                <span className="font-medium text-foreground">{user.primaryEmailAddress?.emailAddress}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'pill inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider',
              queueClean
                ? 'border border-success/40 bg-success/10 text-success'
                : 'border border-primary/40 bg-primary/10 text-primary',
            )}
          >
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />
            {queueClean ? 'All systems green' : `${data.summary.queue.totalPending} in flight`}
          </span>
        </div>
      </header>

      {/* STATS — hairline-divided grid, no card chrome */}
      <section className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
        <Stat
          icon={<Users className="h-4 w-4" />}
          label={t('accounts')}
          value={`${data.summary.accounts.active}/${data.summary.accounts.total}`}
          sub={t('activeTotal')}
        />
        <Stat
          icon={<KeyRound className="h-4 w-4" />}
          label={t('apiKeys')}
          value={String(activeKeys.length)}
          sub={t('active')}
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label={t('pendingActions')}
          value={String(data.summary.queue.totalPending)}
          sub={totalDead > 0 ? `${totalDead} dead` : t('queueClean')}
          tone={totalDead > 0 ? 'warn' : undefined}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label={t('successLast24h')}
          value={String(data.summary.activity.succeededLast24h)}
          sub={t('actionsCompleted')}
          tone="positive"
        />
      </section>

      {/* QUEUE BY TYPE — feed-row pattern */}
      {data.summary.queue.byType.some((q) => q.pending + q.dead + q.failed > 0) && (
        <section className="border-b border-border py-7">
          <SectionLabel num="01" title={t('queueStatus')} />
          <div className="mt-5">
            <div className="grid grid-cols-5 gap-2 border-b border-border pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="col-span-2">{t('typeCol')}</span>
              <span className="text-right">{t('pendingCol')}</span>
              <span className="text-right">{t('workingCol')}</span>
              <span className="text-right">Dead</span>
            </div>
            {data.summary.queue.byType
              .filter((q) => q.pending + q.dead + q.claimed + q.running > 0)
              .map((q) => (
                <div
                  key={q.type}
                  className="row-hover grid grid-cols-5 items-center gap-2 border-b border-border/60 px-1 py-3 text-[13px]"
                >
                  <span className="col-span-2 font-mono font-semibold tracking-tight">
                    {q.type}
                  </span>
                  <span className="text-right font-mono text-foreground tnum">{q.pending}</span>
                  <span className="text-right font-mono text-foreground tnum">
                    {q.claimed + q.running}
                  </span>
                  <span
                    className={cn(
                      'text-right font-mono tnum',
                      q.dead > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {q.dead}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* GETTING STARTED — split: checklist + code */}
      <section className="grid grid-cols-1 gap-10 border-b border-border py-8 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <SectionLabel num="02" title={t('gettingStarted')} />
          <ol className="mt-5 space-y-0">
            <Step
              done={data.summary.accounts.total > 0}
              text={t('step1')}
              href="/accounts"
              cta={t('accountsLink')}
            />
            <Step
              done={activeKeys.length > 0}
              text={t('step2')}
              href="/api-keys"
              cta={t('apiKeysLink')}
            />
            <Step done={data.summary.activity.succeededLast24h > 0} text={t('step3')} last />
          </ol>
        </div>
        <div>
          <SectionLabel num="03" title="Wire it up" />
          <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-popover">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.78_0.155_80)]/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
              </div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                claude · mcp · register
              </span>
              <button
                onClick={copyCmd}
                className="pill inline-flex items-center gap-1.5 border border-border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {copied ? <CheckCircle2 className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7]">
<span className="text-muted-foreground">$ </span><span className="text-foreground">claude mcp add xtweetly \</span>{'\n'}
<span className="text-muted-foreground">    --url </span><span className="text-primary">{apiUrl('/mcp/sse')}</span><span className="text-foreground"> \</span>{'\n'}
<span className="text-muted-foreground">    --header </span><span className="text-[oklch(0.78_0.155_80)]">{`"Authorization: Bearer ${firstActiveKey ? firstActiveKey.prefix + '...' : 'tk_...'}"`}</span>
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- bits ---------- */

function SectionLabel({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      <span className="font-mono text-primary">{num}</span>
      <span className="h-px w-10 bg-border" />
      <span>{title}</span>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: 'positive' | 'warn';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'warn'
        ? 'text-destructive'
        : 'text-foreground';
  return (
    <div className="px-5 py-6 first:pl-0 last:pr-0 sm:px-6 sm:first:pl-0 sm:last:pr-0 lg:px-7">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-foreground/70">{icon}</span>
        {label}
      </div>
      <p className={cn('mt-3 font-sans text-[34px] font-black leading-none tracking-tight tnum', valueClass)}>
        {value}
      </p>
      <p className="mt-2 text-[12px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Step({
  done,
  text,
  href,
  cta,
  last,
}: {
  done: boolean;
  text: string;
  href?: string;
  cta?: string;
  last?: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-4 py-4',
        last ? '' : 'border-b border-border/60',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
          done
            ? 'border-success/60 bg-success/15 text-success'
            : 'border-border bg-accent text-muted-foreground',
        )}
      >
        {done ? '✓' : '·'}
      </span>
      <span
        className={cn(
          'flex-1 text-[14px]',
          done ? 'text-muted-foreground line-through' : 'text-foreground',
        )}
      >
        {text}
      </span>
      {href && cta && !done && (
        <Link
          href={href as '/'}
          className="pill inline-flex items-center gap-1 border border-border px-3 py-1 text-[12px] font-semibold transition-colors hover:bg-accent"
        >
          {cta}
          <ArrowUpRight className="h-3 w-3" strokeWidth={2.75} />
        </Link>
      )}
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3 border-b border-border pb-6">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-9 w-44" />
        <div className="skeleton h-4 w-60" />
      </div>
      <div className="grid grid-cols-1 gap-0 divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-7 py-6">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-3 h-9 w-16" />
            <div className="skeleton mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="skeleton h-52 rounded-xl" />
    </div>
  );
}
