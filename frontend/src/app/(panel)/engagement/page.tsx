'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type AccountsResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Heart, Repeat2, Quote, Bookmark, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EngagementConfig {
  accountId: string;
  enabled: boolean;
  maxLikesPerDay: number;
  maxRetweetsPerDay: number;
  maxQuotesPerDay: number;
  maxBookmarksPerDay: number;
  activeHourStart: number;
  activeHourEnd: number;
  bookmarkOwnTweet: boolean;
  likeSourceTweet: boolean;
  retweetSourceTweet: boolean;
  timelineScrapeEnabled: boolean;
  timelineScrapeIntervalHours: number;
  minDelaySec: number;
  maxDelaySec: number;
}

interface EngagementCounters {
  date: string;
  counts: { like: number; retweet: number; quote: number; bookmark: number };
  limits: { likes: number; retweets: number; quotes: number; bookmarks: number };
}

interface DiscoveredTweet {
  tweet_url: string;
  author_handle: string;
  content_text: string;
  relevance_score: number;
  engagement_type: string;
  discovered_at: string;
}

function CounterBar({
  icon,
  label,
  count,
  limit,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  limit: number;
  color: string;
}) {
  const pct = limit > 0 ? Math.min((count / limit) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-mono font-medium text-foreground">
          {count}
          <span className="text-muted-foreground">/{limit}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function EngagementPage() {
  const [account, setAccount] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [config, setConfig] = useState<EngagementConfig | null>(null);
  const [counters, setCounters] = useState<EngagementCounters | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredTweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Load accounts list and auto-select when only one exists
  useEffect(() => {
    apiFetch<AccountsResponse>('/accounts')
      .then((res) => {
        const ids = res.accounts.map((a) => a.id);
        setAccountIds(ids);
        if (ids.length === 1) {
          setAccount(ids[0]);
        }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setLoadError('');
    try {
      const [c, ctr, disc] = await Promise.all([
        apiFetch<EngagementConfig>(`/engagement/config?account=${account}`),
        apiFetch<EngagementCounters>(`/engagement/counters?account=${account}`),
        apiFetch<DiscoveredTweet[]>(`/engagement/discovered?account=${account}&limit=30`),
      ]);
      setConfig(c);
      setCounters(ctr);
      setDiscovered(disc);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (account) load();
  }, [account, load]);

  const triggerDiscover = async () => {
    await apiFetch('/engagement/discover', {
      method: 'POST',
      body: JSON.stringify({ account }),
    });
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Etkileşim
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hesap bazlı etkileşim konfigürasyonu ve istatistikler
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={account} onValueChange={(v) => setAccount(v ?? '')}>
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder={accountIds.length === 0 ? 'Yükleniyor...' : 'Hesap seçin...'} />
            </SelectTrigger>
            <SelectContent>
              {accountIds.map((id) => (
                <SelectItem key={id} value={id} className="font-mono text-xs">
                  {id}
                </SelectItem>
              ))}
              {accountIds.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Hesap bulunamadı
                </div>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={!account || loading}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin-slow')} />
            Yenile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerDiscover}
            disabled={!account}
            className="h-9 gap-1.5 text-xs"
          >
            <Search className="h-3.5 w-3.5" />
            Keşfet
          </Button>
        </div>
      </div>

      {!account ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card">
            <Heart className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            İstatistikleri görmek için bir hesap seçin
          </p>
        </div>
      ) : loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="skeleton h-44 rounded-lg" />
            ))}
          </div>
          <div className="skeleton h-64 rounded-lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Günlük sayaçlar */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-1 w-3 rounded-full bg-primary" />
                  Günlük Sayaçlar
                  {counters && (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {counters.date}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {counters ? (
                  <div className="space-y-4">
                    <CounterBar
                      icon={<Heart className="h-3.5 w-3.5" />}
                      label="Like"
                      count={counters.counts.like}
                      limit={counters.limits.likes}
                      color="bg-rose-500"
                    />
                    <CounterBar
                      icon={<Repeat2 className="h-3.5 w-3.5" />}
                      label="Retweet"
                      count={counters.counts.retweet}
                      limit={counters.limits.retweets}
                      color="bg-emerald-500"
                    />
                    <CounterBar
                      icon={<Quote className="h-3.5 w-3.5" />}
                      label="Quote"
                      count={counters.counts.quote}
                      limit={counters.limits.quotes}
                      color="bg-primary"
                    />
                    <CounterBar
                      icon={<Bookmark className="h-3.5 w-3.5" />}
                      label="Bookmark"
                      count={counters.counts.bookmark}
                      limit={counters.limits.bookmarks}
                      color="bg-violet-500"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Veri yok</p>
                )}
              </CardContent>
            </Card>

            {/* Konfigürasyon */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-1 w-3 rounded-full bg-primary" />
                  Yapılandırma
                </CardTitle>
              </CardHeader>
              <CardContent>
                {config ? (
                  <div className="space-y-2">
                    {[
                      {
                        label: 'Durum',
                        value: config.enabled,
                        type: 'badge' as const,
                      },
                      {
                        label: 'Aktif Saat',
                        value: `${config.activeHourStart}:00 – ${config.activeHourEnd}:00`,
                        type: 'text' as const,
                      },
                      {
                        label: 'Timeline Tarama',
                        value: config.timelineScrapeEnabled,
                        type: 'badge' as const,
                      },
                      {
                        label: 'Tarama Aralığı',
                        value: `${config.timelineScrapeIntervalHours} saat`,
                        type: 'text' as const,
                      },
                      {
                        label: 'Gecikme',
                        value: `${config.minDelaySec}–${config.maxDelaySec}s`,
                        type: 'text' as const,
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between rounded-md px-1 py-1.5 hover:bg-accent/30 transition-colors"
                      >
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        {row.type === 'badge' ? (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              row.value
                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                                : 'border-border bg-muted/50 text-muted-foreground',
                            )}
                          >
                            {row.value ? 'Açık' : 'Kapalı'}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-foreground">
                            {String(row.value)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Veri yok</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Keşfedilen tweetler */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="h-1 w-3 rounded-full bg-primary" />
                Keşfedilen Tweetler
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {discovered.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {discovered.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Keşfedilen tweet bulunamadı.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        {['Yazar', 'İçerik', 'Skor', 'Tip', 'Tarih'].map((h) => (
                          <th
                            key={h}
                            className="pb-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {discovered.map((t) => (
                        <tr
                          key={t.tweet_url}
                          className="border-b border-border/20 last:border-0 hover:bg-accent/30 transition-colors"
                        >
                          <td className="py-2.5 pr-4 font-mono font-medium text-foreground">
                            @{t.author_handle}
                          </td>
                          <td className="max-w-64 truncate py-2.5 pr-4 text-muted-foreground">
                            {t.content_text}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-primary">
                            {t.relevance_score.toFixed(2)}
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                              {t.engagement_type}
                            </span>
                          </td>
                          <td className="py-2.5 text-muted-foreground">
                            {new Date(t.discovered_at).toLocaleString('tr-TR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
