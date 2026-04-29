'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type StatusResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, Clock, Activity, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<StatusResponse>('/status')
      .then(setData)
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

  if (!data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistem durumu ve genel metrikler
          </p>
        </div>
        <div
          className={cn(
            'mt-1 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
            data.ok
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
              : 'border-destructive/25 bg-destructive/10 text-destructive',
          )}
        >
          {data.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          <span className={cn(data.ok && 'animate-pulse')}>
            {data.ok ? 'Sistem Sağlıklı' : 'Sistem Sorunlu'}
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Bekleyen Aksiyon"
          value={data.queue.totalPending}
          icon={<Clock className="h-4 w-4" />}
          variant="cyan"
        />
        <StatCard
          title="Başarısız (Dead)"
          value={data.queue.totalDead}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={data.queue.totalDead > 0 ? 'red' : 'green'}
        />
        <StatCard
          title="7 Günlük Post"
          value={data.analytics.last7dPosts}
          icon={<Activity className="h-4 w-4" />}
          variant="cyan"
        />
        <StatCard
          title="Format Sayısı"
          value={data.analytics.formatPerformance.length}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Queue depth */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-1 w-3 rounded-full bg-primary" />
              Kuyruk Derinliği
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
              {data.queue.byType.map((q) => (
                <div
                  key={q.type}
                  className="grid grid-cols-5 gap-2 rounded-md px-1 py-2 text-xs transition-colors hover:bg-accent/50"
                >
                  <span className="col-span-2 font-mono font-medium text-foreground">
                    {q.type}
                  </span>
                  <span className="text-right font-mono text-muted-foreground">
                    {q.pending}
                  </span>
                  <span className="text-right font-mono text-muted-foreground">
                    {q.claimed + q.running}
                  </span>
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
              {data.queue.byType.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Kuyrukta iş yok
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Format performance */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-1 w-3 rounded-full bg-primary" />
              Format Performansı (7 Gün)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.analytics.formatPerformance.map((f) => (
                <div key={f.format} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {f.format}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {f.success}/{f.total}
                      </span>
                      <span
                        className={cn(
                          'font-mono text-xs font-semibold',
                          f.successRate >= 0.8
                            ? 'text-emerald-400'
                            : f.successRate >= 0.5
                              ? 'text-amber-400'
                              : 'text-destructive',
                        )}
                      >
                        {(f.successRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700',
                        f.successRate >= 0.8
                          ? 'bg-emerald-500'
                          : f.successRate >= 0.5
                            ? 'bg-amber-500'
                            : 'bg-destructive',
                      )}
                      style={{ width: `${f.successRate * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {data.analytics.formatPerformance.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Henüz veri yok
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  variant,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  variant: 'cyan' | 'green' | 'red' | 'purple' | 'amber';
}) {
  const styles: Record<string, string> = {
    cyan: 'text-primary bg-primary/10 border-primary/20',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-destructive bg-destructive/10 border-destructive/20',
    purple: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">
              {value}
            </p>
          </div>
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
              styles[variant],
            )}
          >
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="skeleton h-52 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
