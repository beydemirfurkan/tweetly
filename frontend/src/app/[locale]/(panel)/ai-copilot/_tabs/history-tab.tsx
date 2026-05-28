'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApiFetch } from '@/lib/api';
import { useLazyLoad } from '@/lib/use-lazy-load';
import type { HistoryItem } from '@/lib/types/ai-copilot';

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  profile: { label: 'profile', color: 'text-blue-500' },
  content: { label: 'content', color: 'text-green-500' },
  viral_score: { label: 'viral_score', color: 'text-amber-500' },
};

export function HistoryTab() {
  const t = useTranslations('copilot');
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<HistoryItem[]>('/copilot/history?limit=20');
      setItems(res);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useLazyLoad(loadHistory);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-12 text-center text-[13px] text-muted-foreground">{t('history.empty')}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const badge = TYPE_BADGE[item.type] ?? { label: item.type, color: 'text-muted-foreground' };
        const date = new Date(item.createdAt);
        const summary = extractSummary(item);
        return (
          <div key={item.id} className="rounded-2xl border border-border bg-popover p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={cn('text-[11px] font-semibold uppercase tracking-wider', badge.color)}>
                  {t(`history.${badge.label}`)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            {summary && <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">{summary}</p>}
          </div>
        );
      })}
    </div>
  );
}

function extractSummary(item: HistoryItem): string {
  const data = item.resultData as Record<string, unknown>;
  if (item.type === 'profile') {
    return (data.summary as string) ?? (data.handle as string) ?? '';
  }
  if (item.type === 'content') {
    const suggestions = data.suggestions as Array<{ text: string }> | undefined;
    return suggestions?.[0]?.text ?? '';
  }
  if (item.type === 'viral_score') {
    const score = data.score as number | undefined;
    const reach = data.estimatedReach as string | undefined;
    return score != null ? `Skor: ${score}/10${reach ? ` — ${reach}` : ''}` : '';
  }
  return '';
}
