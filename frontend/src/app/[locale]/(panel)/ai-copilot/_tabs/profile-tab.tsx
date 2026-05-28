'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Brain, Loader2, TrendingUp, MessageSquare, Target, BarChart3 } from 'lucide-react';
import { useApiFetch } from '@/lib/api';
import type { ProfileAnalysis } from '@/lib/types/ai-copilot';
import { useCopilot } from '../_state/copilot-context';
import { MiniStat, ProfileField } from '../_components/mini-stat';

export function ProfileTab() {
  const t = useTranslations('copilot');
  const apiFetch = useApiFetch();
  const { profile, setProfile, setError, accounts } = useCopilot();

  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    const clean = handle.replace('@', '').trim();
    if (!clean) return;
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = { handle: clean };
      if (accounts.length > 0) body.accountId = accounts[0].id;
      const result = await apiFetch<ProfileAnalysis>('/copilot/analyze-profile', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
      setProfile(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-popover p-5">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              {t('profileAnalysis.handleLabel')}
            </label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={t('profileAnalysis.handlePlaceholder')}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={(e) => e.key === 'Enter' && analyze()}
            />
            {accounts.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {accounts[0].displayName ?? accounts[0].id.slice(0, 8)} session ile analiz edilecek
              </p>
            )}
          </div>
          <button
            onClick={analyze}
            disabled={loading || !handle.trim()}
            className="flex h-10 items-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {loading ? t('profileAnalysis.analyzing') : t('profileAnalysis.analyze')}
          </button>
        </div>
      </section>

      {profile && (
        <section className="rounded-2xl border border-border bg-popover p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Brain className="h-4 w-4 text-primary" />
            {t('profileAnalysis.styleProfile')}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MiniStat icon={<TrendingUp className="h-3.5 w-3.5" />} label={t('profileAnalysis.followers')} value={String(profile.followersCount)} />
            <MiniStat icon={<MessageSquare className="h-3.5 w-3.5" />} label={t('profileAnalysis.following')} value={String(profile.followingCount)} />
            <MiniStat icon={<Target className="h-3.5 w-3.5" />} label={t('profileAnalysis.tweetsAnalyzed')} value={String(profile.tweetsAnalyzed)} />
            <MiniStat icon={<BarChart3 className="h-3.5 w-3.5" />} label={t('profileAnalysis.avgLength')} value={`${profile.styleProfile.avgLength} ch`} />
          </div>

          <div className="mt-5 space-y-3 border-t border-border pt-5">
            <ProfileField label={t('profileAnalysis.tone')} value={profile.styleProfile.tone.join(', ')} />
            <ProfileField label={t('profileAnalysis.contentStyle')} value={profile.styleProfile.contentStyle} />
            <ProfileField label={t('profileAnalysis.topTopics')} value={profile.styleProfile.topTopics.join(', ')} />
            <ProfileField label={t('profileAnalysis.engagementStyle')} value={profile.styleProfile.engagementStyle} />
            <ProfileField label={t('profileAnalysis.summary')} value={profile.styleProfile.summary} />
          </div>
        </section>
      )}
    </div>
  );
}
