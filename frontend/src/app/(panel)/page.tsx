'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, type ApiKey, type UserSummary } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { AlertTriangle, Users, KeyRound, Radio, ArrowRight, Activity, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardData {
  summary: UserSummary;
  activeKeys: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<UserSummary>('/api/v1/me/summary'),
      apiFetch<ApiKey[]>('/auth/api-keys'),
    ])
      .then(([summary, keys]) => {
        setData({
          summary,
          activeKeys: keys.filter((k) => !k.revokedAt).length,
        });
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Sunucuya bağlanılamadı: {error}
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hoş geldin{user ? ` ${user.email}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Hesaplar"
          value={`${data.summary.accounts.active}/${data.summary.accounts.total}`}
          subtitle="aktif / toplam"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="API Anahtarları"
          value={data.activeKeys}
          subtitle="aktif"
          icon={<KeyRound className="h-4 w-4" />}
        />
        <StatCard
          title="Bekleyen Aksiyon"
          value={data.summary.queue.totalPending}
          subtitle={data.summary.queue.totalDead > 0 ? `${data.summary.queue.totalDead} dead` : 'sıra temiz'}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          title="24 Saatlik Başarılı"
          value={data.summary.activity.succeededLast24h}
          subtitle="aksiyon tamamlandı"
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      {data.summary.queue.byType.some((q) => q.pending + q.dead + q.failed > 0) && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-1 w-3 rounded-full bg-primary" />
              Kuyruk Durumu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span className="col-span-2">Tip</span>
                <span className="text-right">Bekleyen</span>
                <span className="text-right">Çalışıyor</span>
                <span className="text-right text-destructive/80">Dead</span>
              </div>
              {data.summary.queue.byType
                .filter((q) => q.pending + q.dead + q.claimed + q.running > 0)
                .map((q) => (
                  <div
                    key={q.type}
                    className="grid grid-cols-5 gap-2 rounded-md px-1 py-2 text-xs transition-colors hover:bg-accent/50"
                  >
                    <span className="col-span-2 font-mono font-medium text-foreground">{q.type}</span>
                    <span className="text-right font-mono text-muted-foreground">{q.pending}</span>
                    <span className="text-right font-mono text-muted-foreground">{q.claimed + q.running}</span>
                    <span
                      className={cn(
                        'text-right font-mono',
                        q.dead > 0 ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {q.dead}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-primary" />
            Başlangıç
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <Step
              done={data.summary.accounts.total > 0}
              text="X hesabını bağla (auth_token + ct0 + twid)"
              href="/accounts"
              cta="Hesaplar"
            />
            <Step
              done={data.activeKeys > 0}
              text="MCP / REST için bir API anahtarı oluştur"
              href="/api-keys"
              cta="API Anahtarları"
            />
            <Step
              done={data.summary.activity.succeededLast24h > 0}
              text="Claude Code (veya Codex) ile bağlan ve aksiyonları çalıştır"
            />
          </ol>
          <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
{`claude mcp add tweetly \\
  --url <backend>/mcp/sse \\
  --header "Authorization: Bearer tk_..."`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Step({
  done,
  text,
  href,
  cta,
}: {
  done: boolean;
  text: string;
  href?: string;
  cta?: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
          done
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        {done ? '✓' : '·'}
      </span>
      <span className={cn('flex-1', done ? 'text-muted-foreground line-through' : 'text-foreground')}>
        {text}
      </span>
      {href && cta && !done && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {cta}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </li>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-7 w-36" />
        <div className="skeleton h-4 w-52" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
      <div className="skeleton h-52 rounded-lg" />
    </div>
  );
}
