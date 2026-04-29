'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';

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

export default function EngagementPage() {
  const [account, setAccount] = useState('');
  const [config, setConfig] = useState<EngagementConfig | null>(null);
  const [counters, setCounters] = useState<EngagementCounters | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredTweet[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [c, ctr, disc] = await Promise.all([
        apiFetch<EngagementConfig>(`/engagement/config?account=${account}`),
        apiFetch<EngagementCounters>(`/engagement/counters?account=${account}`),
        apiFetch<DiscoveredTweet[]>(`/engagement/discovered?account=${account}&limit=30`),
      ]);
      setConfig(c);
      setCounters(ctr);
      setDiscovered(disc);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Etkilesim</h1>
        <div className="flex gap-2">
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Hesap secin</option>
            <option value="test-account">test-account</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={!account || loading}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Yenile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerDiscover}
            disabled={!account}
          >
            Kesfet Calistir
          </Button>
        </div>
      </div>

      {!account ? (
        <div className="text-sm text-muted-foreground">
          Lutfen bir hesap secin.
        </div>
      ) : loading ? (
        <div className="text-sm text-muted-foreground">Yukleniyor...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Gunluk Sayilar</CardTitle>
              </CardHeader>
              <CardContent>
                {counters && (
                  <Table>
                    <TableBody>
                      {[
                        ['Like', counters.counts.like, counters.limits.likes],
                        ['Retweet', counters.counts.retweet, counters.limits.retweets],
                        ['Quote', counters.counts.quote, counters.limits.quotes],
                        ['Bookmark', counters.counts.bookmark, counters.limits.bookmarks],
                      ].map(([label, count, limit]) => (
                        <TableRow key={String(label)}>
                          <TableCell>{String(label)}</TableCell>
                          <TableCell className="text-right">
                            {String(count)}/{String(limit)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Yapilandirma</CardTitle>
              </CardHeader>
              <CardContent>
                {config && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span>Durum:</span>
                    <Badge variant={config.enabled ? 'default' : 'secondary'}>
                      {config.enabled ? 'Aktif' : 'Kapali'}
                    </Badge>
                    <span>Aktif Saat:</span>
                    <span>{config.activeHourStart}:00 - {config.activeHourEnd}:00</span>
                    <span>Timeline Tarama:</span>
                    <Badge variant={config.timelineScrapeEnabled ? 'default' : 'secondary'}>
                      {config.timelineScrapeEnabled ? 'Acik' : 'Kapali'}
                    </Badge>
                    <span>Tarama Araligi:</span>
                    <span>{config.timelineScrapeIntervalHours} saat</span>
                    <span>Gecikme:</span>
                    <span>{config.minDelaySec}-{config.maxDelaySec}s</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Kesfedilen Tweetler ({discovered.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {discovered.length === 0 ? (
                <div className="text-sm text-muted-foreground">Kayit yok.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Yazar</TableHead>
                      <TableHead>Icerik</TableHead>
                      <TableHead>Skor</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead>Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discovered.map((t) => (
                      <TableRow key={t.tweet_url}>
                        <TableCell className="font-medium text-xs">
                          {t.author_handle}
                        </TableCell>
                        <TableCell className="max-w-64 truncate text-xs">
                          {t.content_text}
                        </TableCell>
                        <TableCell className="text-xs">
                          {t.relevance_score.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {t.engagement_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(t.discovered_at).toLocaleString('tr-TR')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
