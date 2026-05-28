'use client';

import { useTranslations } from 'next-intl';
import { useApiResource, useAccounts } from '@/lib/hooks';
import { Link } from '@/i18n/navigation';
import {
  Bot,
  FileText,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentConfig {
  id: string;
  accountId: string;
  enabled: boolean;
  dailyTweetTarget: number;
  formatPreference: string[];
  topics: string[];
  toneOverride: string | null;
  scheduleIntervalMinutes: number;
  lastRunAt: string | null;
  createdAt: string;
}

interface DraftStats {
  pending: number;
  approved: number;
  rejected: number;
  published: number;
}

export default function AgentDashboardPage() {
  const t = useTranslations('agent');
  const tc = useTranslations('common');

  const accountsRes = useAccounts();
  const configsRes = useApiResource<AgentConfig[]>('/api/v1/agent/configs');
  const statsRes = useApiResource<DraftStats>('/api/v1/agent/drafts/stats');

  const accounts = accountsRes.accounts;
  const configs = configsRes.data ?? [];
  const stats = statsRes.data ?? { pending: 0, approved: 0, rejected: 0, published: 0 };
  const loading = accountsRes.loading || configsRes.loading || statsRes.loading;
  const errorObj = accountsRes.error ?? configsRes.error ?? statsRes.error;
  const error = errorObj ? errorObj.message : '';

  const loadData = () => {
    void accountsRes.refetch();
    void configsRes.refetch();
    void statsRes.refetch();
  };

  const getAccountName = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.displayName || `@${accountId}`;
  };

  const activeConfigs = configs.filter((c) => c.enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/agent/config"
          className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" />
          {t('createConfig')}
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Bot}
          label={t('dashboard.activeAgents')}
          value={activeConfigs.length}
          total={configs.length}
        />
        <StatCard
          icon={Clock}
          label={t('dashboard.pendingReview')}
          value={stats.pending}
          accent="warning"
        />
        <StatCard
          icon={CheckCircle2}
          label={t('approved')}
          value={stats.approved}
          accent="success"
        />
        <StatCard
          icon={Send}
          label={t('published')}
          value={stats.published}
          accent="success"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t('configs')}</h2>
          <button
            onClick={loadData}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('noConfigs')}</p>
            <Link
              href="/agent/config"
              className="mt-4 flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <Plus className="h-4 w-4" />
              {t('createConfig')}
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {configs.map((config) => (
              <div key={config.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full',
                      config.enabled ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{getAccountName(config.accountId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {config.dailyTweetTarget} tweets/day · {config.scheduleIntervalMinutes}min interval
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      config.enabled
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {config.enabled ? t('config.enabled') : 'Disabled'}
                  </span>
                  <Link
                    href={`/agent/config/${config.id}`}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t('dashboard.quickActions')}</h2>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Link
            href="/agent/drafts"
            className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-accent"
          >
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{t('dashboard.viewDrafts')}</p>
              <p className="text-xs text-muted-foreground">
                {stats.pending} {t('dashboard.pendingReview').toLowerCase()}
              </p>
            </div>
          </Link>
          <Link
            href="/agent/config"
            className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-accent"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{t('dashboard.configureAgent')}</p>
              <p className="text-xs text-muted-foreground">{configs.length} configs</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  total?: number;
  accent?: 'success' | 'warning';
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            accent === 'success' && 'bg-green-500/10 text-green-500',
            accent === 'warning' && 'bg-yellow-500/10 text-yellow-500',
            !accent && 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">
            {value}
            {total !== undefined && <span className="text-sm font-normal text-muted-foreground">/{total}</span>}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
