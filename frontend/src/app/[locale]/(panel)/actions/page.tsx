'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useApiFetch, type ActionRow } from '@/lib/api';
import { useApiResource } from '@/lib/hooks';
import { getActionStatusClass } from '@/lib/theme/action-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, RotateCcw, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_TYPES = [
  'post',
  'reply',
  'retweet',
  'like',
  'follow',
  'quote',
  'bookmark',
  'unlike',
  'unretweet',
  'unfollow',
  'delete_tweet',
  'dm',
  'profile_update',
  'avatar_update',
  'banner_update',
];


const STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'statusPending',
  claimed: 'statusClaimed',
  running: 'statusRunning',
  succeeded: 'statusSucceeded',
  failed: 'statusFailed',
  dead: 'statusDead',
  cancelled: 'statusCancelled',
};

export default function ActionsPage() {
  const t = useTranslations('actions');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const apiFetch = useApiFetch();
  const [type, setType] = useState('post');
  const [status, setStatus] = useState<string>('');

  // Path changes whenever the filters change; useApiResource re-fetches
  // automatically on path change and serialises the latest run via its
  // internal generation guard.
  const path = `/api/v1/actions?type=${type}&limit=100${status ? `&status=${status}` : ''}`;
  const resource = useApiResource<{ rows: ActionRow[] }>(path);
  const rows = resource.data?.rows ?? [];
  const loading = resource.loading;
  const loadError = resource.error?.message ?? '';

  const statusOptions = useMemo(
    () =>
      Object.keys(STATUS_LABEL_KEY).map((key) => ({
        key,
        label: t(STATUS_LABEL_KEY[key] as Parameters<typeof t>[0]),
      })),
    [t],
  );

  const tableHeaders = useMemo(
    () => [t('colId'), t('colStatus'), t('colAccount'), t('colAttempts'), t('colSchedule'), t('colError'), ''],
    [t],
  );

  const replay = async (id: string) => {
    await apiFetch(`/api/v1/actions/${type}/${id}/replay`, { method: 'POST' });
    void resource.refetch();
  };

  const cancel = async (id: string) => {
    await apiFetch(`/api/v1/actions/${type}/${id}/cancel`, { method: 'POST' });
    void resource.refetch();
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>{tCommon('apiError')}: {loadError}</span>
        <button onClick={() => void resource.refetch()} className="ml-auto underline hover:no-underline">{tCommon('retry')}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="text-primary">●</span> {t('kicker')}
        </p>
        <h1 className="mt-2 text-[32px] font-black leading-tight tracking-[-0.025em]">
          {t('title')}
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {t('subtitle')}
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(v) => v && setType(v)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((tt) => (
              <SelectItem key={tt} value={tt} className="font-mono text-xs">
                {tt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v ?? '')}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder={t('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('allStatuses')}</SelectItem>
            {statusOptions.map(({ key, label }) => (
              <SelectItem key={key} value={key} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void resource.refetch()}
          disabled={loading}
          className="h-9 gap-1.5 text-xs"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin-slow')} />
          {tCommon('refresh')}
        </Button>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{rows.length}</span>
          {t('records')}
        </div>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-primary" />
            <span className="font-mono">{type}</span>
            <span className="text-muted-foreground">{t('ofType')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-md" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t('empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    {tableHeaders.map((h, i) => (
                      <th
                        key={i}
                        className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground last:text-right"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const className = getActionStatusClass(r.status);
                    const labelKey = STATUS_LABEL_KEY[r.status] ?? STATUS_LABEL_KEY.pending;
                    return (
                      <tr
                        key={r.id}
                        className="group border-b border-border/20 last:border-0 hover:bg-accent/30 transition-colors"
                      >
                        <td className="py-2.5 pr-4 font-mono text-muted-foreground">
                          {r.id.slice(0, 8)}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              className,
                            )}
                          >
                            {t(labelKey as Parameters<typeof t>[0])}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-muted-foreground">
                          {r.account_id}
                        </td>
                        <td className="py-2.5 pr-4 font-mono">
                          {r.attempts}/{r.max_attempts}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {new Date(r.scheduled_at).toLocaleString(locale)}
                        </td>
                        <td className="max-w-40 truncate py-2.5 pr-4 text-destructive/80">
                          {r.last_error || (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(r.status === 'failed' || r.status === 'dead') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => replay(r.id)}
                                title={t('retry')}
                                className="h-6 w-6 p-0 text-primary hover:text-primary hover:bg-primary/10"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                            {(r.status === 'pending' || r.status === 'claimed') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancel(r.id)}
                                title={t('cancelAction')}
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
