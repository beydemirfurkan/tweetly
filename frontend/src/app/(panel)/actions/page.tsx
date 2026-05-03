'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type ActionRow } from '@/lib/api';
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

const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: 'Bekleyen',
    className: 'border-border bg-muted/50 text-muted-foreground',
  },
  claimed: {
    label: 'Alındı',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  },
  running: {
    label: 'Çalışıyor',
    className: 'border-primary/25 bg-primary/10 text-primary',
  },
  succeeded: {
    label: 'Başarılı',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  },
  failed: {
    label: 'Başarısız',
    className: 'border-destructive/25 bg-destructive/10 text-destructive',
  },
  dead: {
    label: 'Dead',
    className: 'border-destructive/40 bg-destructive/15 text-destructive font-semibold',
  },
  cancelled: {
    label: 'İptal',
    className: 'border-border bg-muted/30 text-muted-foreground',
  },
};

export default function ActionsPage() {
  const [type, setType] = useState('post');
  const [status, setStatus] = useState<string>('');
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      let path = `/api/v1/actions?type=${type}&limit=100`;
      if (status) path += `&status=${status}`;
      const res = await apiFetch<{ rows: ActionRow[] }>(path);
      setRows(res.rows);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => {
    load();
  }, [load]);

  const replay = async (id: string) => {
    await apiFetch(`/api/v1/actions/${type}/${id}/replay`, { method: 'POST' });
    load();
  };

  const cancel = async (id: string) => {
    await apiFetch(`/api/v1/actions/${type}/${id}/cancel`, { method: 'POST' });
    load();
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>API hatası: {loadError}</span>
        <button onClick={load} className="ml-auto underline hover:no-underline">Tekrar dene</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-syne)' }}
        >
          Aksiyonlar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kuyruklanmış görevleri izleyin ve yönetin
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(v) => v && setType(v)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="font-mono text-xs">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v ?? '')}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder="Tüm durumlar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tüm durumlar</SelectItem>
            {Object.entries(STATUS_STYLES).map(([key, s]) => (
              <SelectItem key={key} value={key} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="h-9 gap-1.5 text-xs"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin-slow')} />
          Yenile
        </Button>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{rows.length}</span>
          kayıt
        </div>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-1 w-3 rounded-full bg-primary" />
            <span className="font-mono">{type}</span>
            <span className="text-muted-foreground">aksiyonları</span>
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
              Bu filtrelerle kayıt bulunamadı.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    {['ID', 'Durum', 'Hesap', 'Deneme', 'Zamanlama', 'Hata', ''].map(
                      (h) => (
                        <th
                          key={h}
                          className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground last:text-right"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = STATUS_STYLES[r.status] ?? STATUS_STYLES.pending;
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
                              s.className,
                            )}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-muted-foreground">
                          {r.account_id}
                        </td>
                        <td className="py-2.5 pr-4 font-mono">
                          {r.attempts}/{r.max_attempts}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {new Date(r.scheduled_at).toLocaleString('tr-TR')}
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
                                title="Tekrar dene"
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
                                title="İptal et"
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
