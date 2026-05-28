'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Sparkles, Send, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApiFetch } from '@/lib/api';
import type { ContentSuggestion, TweetFormat } from '@/lib/types/ai-copilot';
import { useCopilot } from '../_state/copilot-context';

const FORMATS: { key: TweetFormat; maxLen: number }[] = [
  { key: 'micro', maxLen: 45 },
  { key: 'punch', maxLen: 120 },
  { key: 'spark', maxLen: 200 },
  { key: 'hook', maxLen: 280 },
  { key: 'storm', maxLen: 1400 },
  { key: 'thunder', maxLen: 1500 },
];

export function ContentTab() {
  const t = useTranslations('copilot');
  const tc = useTranslations('common');
  const apiFetch = useApiFetch();
  const { suggestions, setSuggestions, setError, profile, accounts } = useCopilot();

  const [format, setFormat] = useState<TweetFormat>('hook');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [scheduleOpenFor, setScheduleOpenFor] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = { format };
      if (topic.trim()) body.topic = topic.trim();
      if (profile) {
        body.sourceHandles = [profile.handle];
        body.styleProfile = profile.styleProfile;
      }

      const result = await apiFetch<{ suggestions: ContentSuggestion[]; format: string; generatedAt: string }>(
        '/copilot/suggest',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      setSuggestions(result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const publish = async (suggestion: ContentSuggestion, scheduledAt?: string) => {
    const accountId = selectedAccountId || accounts[0]?.id;
    if (!accountId) return;
    setPublishing(suggestion.id);
    setError('');
    try {
      const body: Record<string, unknown> = {
        accountId,
        text: suggestion.text,
      };
      if (scheduledAt) body.scheduledAt = scheduledAt;
      await apiFetch('/copilot/publish', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
      setSuggestions(suggestions.filter((s) => s.id !== suggestion.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-popover p-5">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[12px] font-medium text-muted-foreground">
              {t('contentGen.formatLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map(({ key, maxLen }) => (
                <button
                  key={key}
                  onClick={() => setFormat(key)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors',
                    format === key
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  {t(`formats.${key}`)}
                  <span className="ml-1.5 font-mono text-[10px] opacity-60">{maxLen}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              {t('contentGen.topicLabel')}
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t('contentGen.topicPlaceholder')}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={(e) => e.key === 'Enter' && generate()}
            />
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="flex h-10 items-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? t('contentGen.generating') : t('contentGen.generate')}
          </button>
        </div>
      </section>

      {suggestions.length === 0 && !loading && (
        <p className="py-8 text-center text-[13px] text-muted-foreground">{t('contentGen.noSuggestions')}</p>
      )}

      <div className="space-y-3">
        {suggestions.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border bg-popover p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{s.text}</p>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="rounded-md bg-accent px-2 py-0.5 font-mono">{t(`formats.${s.format}`)}</span>
                  <span>{s.charCount} {t('contentGen.charCount')}</span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {s.estimatedScore.toFixed(1)} {t('contentGen.score')}
                  </span>
                </div>
                {s.reasoning && <p className="mt-2 text-[12px] text-muted-foreground">{s.reasoning}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                {accounts.length > 1 && (
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName ?? a.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                )}
                {scheduleOpenFor === s.id && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="h-7 rounded-md border border-border bg-background px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="h-7 rounded-md border border-border bg-background px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={() => {
                        if (scheduledDate && scheduledTime) {
                          publish(s, new Date(`${scheduledDate}T${scheduledTime}`).toISOString());
                          setScheduleOpenFor(null);
                        }
                      }}
                      disabled={!scheduledDate || !scheduledTime || publishing === s.id}
                      className="flex h-7 items-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {t('publish.confirm')}
                    </button>
                    <button
                      onClick={() => setScheduleOpenFor(null)}
                      className="flex h-7 items-center rounded-md border border-border px-2 text-[11px]"
                    >
                      {tc('cancel')}
                    </button>
                  </div>
                )}
                {accounts.length > 0 && scheduleOpenFor !== s.id && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => publish(s)}
                      disabled={publishing === s.id}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {publishing === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {t('contentGen.publish')}
                    </button>
                    <button
                      onClick={() => setScheduleOpenFor(s.id)}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-[12px] font-medium transition-colors hover:bg-accent"
                      title={t('contentGen.schedule')}
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
