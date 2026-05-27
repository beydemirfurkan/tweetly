'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiFetch, type RedactedAccount } from '@/lib/api';
import { useLazyLoad } from '@/lib/use-lazy-load';
import {
  Brain,
  Loader2,
  Sparkles,
  BarChart3,
  Send,
  Lock,
  ChevronRight,
  TrendingUp,
  MessageSquare,
  Target,
  Clock,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TweetFormat = 'micro' | 'punch' | 'spark' | 'hook' | 'storm' | 'thunder';

interface StyleProfile {
  tone: string[];
  avgLength: number;
  hashtagUsage: number;
  emojiUsage: number;
  topTopics: string[];
  contentStyle: string;
  postingPattern: string;
  engagementStyle: string;
  summary: string;
}

interface ProfileAnalysis {
  handle: string;
  displayName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  tweetsAnalyzed: number;
  styleProfile: StyleProfile;
  analyzedAt: string;
}

interface ContentSuggestion {
  id: string;
  text: string;
  format: TweetFormat;
  charCount: number;
  estimatedScore: number;
  reasoning: string;
}

interface ViralScore {
  score: number;
  maxScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  estimatedReach: string;
  formatFit: number;
  hookStrength: number;
  readabilityScore: number;
}

const FORMATS: { key: TweetFormat; maxLen: number }[] = [
  { key: 'micro', maxLen: 45 },
  { key: 'punch', maxLen: 120 },
  { key: 'spark', maxLen: 200 },
  { key: 'hook', maxLen: 280 },
  { key: 'storm', maxLen: 1400 },
  { key: 'thunder', maxLen: 1500 },
];

export default function AiCopilotPage() {
  const t = useTranslations('copilot');
  const tc = useTranslations('common');
  const apiFetch = useApiFetch();

  const [accounts, setAccounts] = useState<RedactedAccount[]>([]);
  const [profile, setProfile] = useState<ProfileAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<ContentSuggestion[]>([]);
  const [viralResult, setViralResult] = useState<ViralScore | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'content' | 'score' | 'history'>('profile');

  const loadAccounts = async () => {
    try {
      const res = await apiFetch<{ count: number; accounts: RedactedAccount[] }>('/api/v1/accounts');
      setAccounts(res.accounts);
    } catch {
      /* accounts optional for copilot */
    }
  };
  useLazyLoad(loadAccounts);

  return (
    <div className="animate-fade-up">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">●</span> AI Copilot
          </p>
          <h1 className="mt-2 text-[32px] font-black leading-tight tracking-[-0.025em]">
            {t('title')}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">{t('subtitle')}</p>
        </div>
      </header>

      {error && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-xs underline">
            {tc('close')}
          </button>
        </div>
      )}

      <TabBar active={activeTab} onChange={setActiveTab} t={t} />

      <div className="mt-6">
        {activeTab === 'profile' && (
          <ProfileTab
            t={t}
            apiFetch={apiFetch}
            profile={profile}
            setProfile={setProfile}
            setError={setError}
            accounts={accounts}
          />
        )}
        {activeTab === 'content' && (
          <ContentTab
            t={t}
            apiFetch={apiFetch}
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            setError={setError}
            profile={profile}
            accounts={accounts}
            tc={tc}
          />
        )}
        {activeTab === 'score' && (
          <ScoreTab
            t={t}
            apiFetch={apiFetch}
            viralResult={viralResult}
            setViralResult={setViralResult}
            setError={setError}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab t={t} apiFetch={apiFetch} />
        )}
      </div>
    </div>
  );
}

function TabBar({
  active,
  onChange,
  t,
}: {
  active: 'profile' | 'content' | 'score' | 'history';
  onChange: (v: 'profile' | 'content' | 'score' | 'history') => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const tabs: { key: 'profile' | 'content' | 'score' | 'history'; icon: React.ElementType; label: string }[] = [
    { key: 'profile', icon: Brain, label: t('profileAnalysis.title') },
    { key: 'content', icon: Sparkles, label: t('contentGen.title') },
    { key: 'score', icon: BarChart3, label: t('viralScore.title') },
    { key: 'history', icon: History, label: t('history.title') },
  ];

  return (
    <div className="mt-6 flex gap-1 border-b border-border">
      {tabs.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors',
            active === key
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

function ProfileTab({
  t,
  apiFetch,
  profile,
  setProfile,
  setError,
  accounts,
}: {
  t: ReturnType<typeof useTranslations>;
  apiFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
  profile: ProfileAnalysis | null;
  setProfile: (v: ProfileAnalysis | null) => void;
  setError: (v: string) => void;
  accounts: RedactedAccount[];
}) {
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
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
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

function ContentTab({
  t,
  tc,
  apiFetch,
  suggestions,
  setSuggestions,
  setError,
  profile,
  accounts,
}: {
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
  apiFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
  suggestions: ContentSuggestion[];
  setSuggestions: (v: ContentSuggestion[]) => void;
  setError: (v: string) => void;
  profile: ProfileAnalysis | null;
  accounts: RedactedAccount[];
}) {
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

      const result = await apiFetch<{ suggestions: ContentSuggestion[]; format: string; generatedAt: string }>('/copilot/suggest', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
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
      const updated = suggestions.filter((s) => s.id !== suggestion.id);
      setSuggestions(updated);
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
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? t('contentGen.generating') : t('contentGen.generate')}
          </button>
        </div>
      </section>

      {suggestions.length === 0 && !loading && (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          {t('contentGen.noSuggestions')}
        </p>
      )}

      <div className="space-y-3">
        {suggestions.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border bg-popover p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{s.text}</p>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="rounded-md bg-accent px-2 py-0.5 font-mono">
                    {t(`formats.${s.format}`)}
                  </span>
                  <span>
                    {s.charCount} {t('contentGen.charCount')}
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {s.estimatedScore.toFixed(1)} {t('contentGen.score')}
                  </span>
                </div>
                {s.reasoning && (
                  <p className="mt-2 text-[12px] text-muted-foreground">{s.reasoning}</p>
                )}
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

function ScoreTab({
  t,
  apiFetch,
  viralResult,
  setViralResult,
  setError,
}: {
  t: ReturnType<typeof useTranslations>;
  apiFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
  viralResult: ViralScore | null;
  setViralResult: (v: ViralScore | null) => void;
  setError: (v: string) => void;
}) {
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
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4" />
            )}
            {loading ? t('viralScore.analyzing') : t('viralScore.analyze')}
          </button>
        </div>
      </section>

      {viralResult && (
        <section className="rounded-2xl border border-border bg-popover p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-primary/30">
              <span className="text-[28px] font-black text-primary">
                {viralResult.score.toFixed(1)}
              </span>
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
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-success">
                {t('viralScore.strengths')}
              </h3>
              <ul className="mt-2 space-y-1">
                {viralResult.strengths.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px]">
                    <ChevronRight className="h-3 w-3 text-success" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {viralResult.weaknesses.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-destructive">
                {t('viralScore.weaknesses')}
              </h3>
              <ul className="mt-2 space-y-1">
                {viralResult.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px]">
                    <ChevronRight className="h-3 w-3 text-destructive" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {viralResult.suggestions.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-primary">
                {t('viralScore.suggestions')}
              </h3>
              <ul className="mt-2 space-y-1">
                {viralResult.suggestions.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px]">
                    <ChevronRight className="h-3 w-3 text-primary" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface HistoryItem {
  id: string;
  type: 'profile' | 'content' | 'viral_score';
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  createdAt: string;
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  profile: { label: 'profile', color: 'text-blue-500' },
  content: { label: 'content', color: 'text-green-500' },
  viral_score: { label: 'viral_score', color: 'text-amber-500' },
};

function HistoryTab({
  t,
  apiFetch,
}: {
  t: ReturnType<typeof useTranslations>;
  apiFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
}) {
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
    return (
      <p className="py-12 text-center text-[13px] text-muted-foreground">
        {t('history.empty')}
      </p>
    );
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
            {summary && (
              <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">{summary}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function extractSummary(item: HistoryItem): string {
  const data = item.resultData;
  if (item.type === 'profile') {
    return (data as Record<string, unknown>).summary as string ?? (data as Record<string, unknown>).handle as string ?? '';
  }
  if (item.type === 'content') {
    const suggestions = (data as Record<string, unknown>).suggestions as Array<{ text: string }> | undefined;
    return suggestions?.[0]?.text ?? '';
  }
  if (item.type === 'viral_score') {
    const score = (data as Record<string, unknown>).score as number | undefined;
    const reach = (data as Record<string, unknown>).estimatedReach as string | undefined;
    return score != null ? `Skor: ${score}/10${reach ? ` — ${reach}` : ''}` : '';
  }
  return '';
}

function ComingSoon({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-accent">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-[24px] font-bold">{t('comingSoonTitle')}</h2>
        <p className="mt-2 max-w-md text-[14px] text-muted-foreground">{t('comingSoonDesc')}</p>
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-[18px] font-bold">{value}</p>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px]">{value}</p>
    </div>
  );
}

function ScoreMetric({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 10);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[12px] font-semibold">{value.toFixed(1)}</span>
      </div>
    </div>
  );
}
