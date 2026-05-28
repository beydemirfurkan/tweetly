'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, Loader2, ChevronRight } from 'lucide-react';
import { useApiFetch } from '@/lib/api';
import type { ViralScore } from '@/lib/types/ai-copilot';
import { useCopilot } from '../_state/copilot-context';
import { ScoreMetric } from '../_components/mini-stat';

export function ScoreTab() {
  const t = useTranslations('copilot');
  const apiFetch = useApiFetch();
  const { viralResult, setViralResult, setError } = useCopilot();

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<ViralScore>('/copilot/score', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });
      setViralResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-popover p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('viralScore.tweetPlaceholder')}
          rows={4}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[11px] text-muted-foreground">{text.length} / 280</span>
          <button
            onClick={analyze}
            disabled={loading || !text.trim()}
            className="flex h-10 items-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            {loading ? t('viralScore.analyzing') : t('viralScore.analyze')}
          </button>
        </div>
      </section>

      {viralResult && (
        <section className="rounded-2xl border border-border bg-popover p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-primary/30">
              <span className="text-[28px] font-black text-primary">{viralResult.score.toFixed(1)}</span>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground">
                {t('viralScore.score')} {t('viralScore.maxScore')}
              </p>
              <p className="mt-1 text-[15px] font-semibold">
                {t('viralScore.estimatedReach')}: {viralResult.estimatedReach}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-5">
            <ScoreMetric label={t('viralScore.hookStrength')} value={viralResult.hookStrength} />
            <ScoreMetric label={t('viralScore.readability')} value={viralResult.readabilityScore} />
            <ScoreMetric label={t('viralScore.formatFit')} value={viralResult.formatFit} />
          </div>

          {viralResult.strengths.length > 0 && (
            <ResultList tone="success" title={t('viralScore.strengths')} items={viralResult.strengths} />
          )}
          {viralResult.weaknesses.length > 0 && (
            <ResultList tone="destructive" title={t('viralScore.weaknesses')} items={viralResult.weaknesses} />
          )}
          {viralResult.suggestions.length > 0 && (
            <ResultList tone="primary" title={t('viralScore.suggestions')} items={viralResult.suggestions} />
          )}
        </section>
      )}
    </div>
  );
}

function ResultList({
  tone,
  title,
  items,
}: {
  tone: 'success' | 'destructive' | 'primary';
  title: string;
  items: string[];
}) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : 'text-primary';
  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className={`text-[12px] font-semibold uppercase tracking-wider ${toneClass}`}>{title}</h3>
      <ul className="mt-2 space-y-1">
        {items.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-[13px]">
            <ChevronRight className={`h-3 w-3 ${toneClass}`} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
