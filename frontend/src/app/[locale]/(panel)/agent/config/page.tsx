'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useApiFetch, type RedactedAccount } from '@/lib/api';
import { useRouter } from '@/i18n/navigation';
import {
  RefreshCw,
  Save,
  Trash2,
  Zap,
  Loader2,
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

interface StyleProfile {
  accountId: string;
  styleProfile: Record<string, unknown> | null;
  customInstructions: string;
  tweetLanguage: string;
  analyzedAt: string | null;
}

const FORMATS = ['micro', 'punch', 'spark', 'hook', 'storm', 'thunder'];
const INTERVALS = [
  { value: 15, label: 'interval15' },
  { value: 30, label: 'interval30' },
  { value: 60, label: 'interval60' },
  { value: 120, label: 'interval120' },
  { value: 240, label: 'interval240' },
  { value: 360, label: 'interval360' },
  { value: 720, label: 'interval720' },
];

export default function AgentConfigPage() {
  const t = useTranslations('agent');
  const tc = useTranslations('common');
  const apiFetch = useApiFetch();
  const router = useRouter();

  const [accounts, setAccounts] = useState<RedactedAccount[]>([]);
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(3);
  const [formats, setFormats] = useState<string[]>(['punch', 'spark', 'hook']);
  const [topics, setTopics] = useState('');
  const [toneOverride, setToneOverride] = useState('');
  const [interval, setInterval] = useState(120);

  const [customInstructions, setCustomInstructions] = useState('');
  const [tweetLanguage, setTweetLanguage] = useState('tr');
  const [analyzeHandle, setAnalyzeHandle] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const accs = await apiFetch<RedactedAccount[]>('/api/v1/accounts');
      const cfgs = await apiFetch<AgentConfig[]>('/api/v1/agent/configs');

      setAccounts(accs);
      setConfigs(cfgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedAccountId) {
      loadStyleProfile(selectedAccountId);
      const config = configs.find((c) => c.accountId === selectedAccountId);
      if (config) {
        setEnabled(config.enabled);
        setDailyTarget(config.dailyTweetTarget);
        setFormats(config.formatPreference);
        setTopics(config.topics.join(', '));
        setToneOverride(config.toneOverride || '');
        setInterval(config.scheduleIntervalMinutes);
      }
    }
  }, [selectedAccountId, configs]);

  const loadStyleProfile = async (accountId: string) => {
    try {
      const profile: StyleProfile = await apiFetch(`/api/v1/agent/style-profile/${accountId}`);
      if (profile) {
        setCustomInstructions(profile.customInstructions || '');
        setTweetLanguage(profile.tweetLanguage || 'tr');
      }
    } catch {
      // Profile might not exist yet
    }
  };

  const handleSave = async () => {
    if (!selectedAccountId) {
      setError('Please select an account');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const existingConfig = configs.find((c) => c.accountId === selectedAccountId);
      const topicsArray = topics.split(',').map((t) => t.trim()).filter(Boolean);

      if (existingConfig) {
        await apiFetch(`/api/v1/agent/configs/${existingConfig.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            enabled,
            dailyTweetTarget: dailyTarget,
            formatPreference: formats,
            topics: topicsArray,
            toneOverride: toneOverride || null,
            scheduleIntervalMinutes: interval,
          }),
        });
      } else {
        await apiFetch('/api/v1/agent/configs', {
          method: 'POST',
          body: JSON.stringify({
            accountId: selectedAccountId,
            dailyTweetTarget: dailyTarget,
            formatPreference: formats,
            topics: topicsArray,
            toneOverride: toneOverride || null,
            scheduleIntervalMinutes: interval,
          }),
        });
      }

      await apiFetch(`/api/v1/agent/style-profile/${selectedAccountId}`, {
        method: 'POST',
        body: JSON.stringify({
          customInstructions,
          tweetLanguage,
        }),
      });

      setSuccess('Saved successfully');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedAccountId || !analyzeHandle) return;

    try {
      setAnalyzing(true);
      setError('');
      await apiFetch(`/api/v1/agent/style-profile/${selectedAccountId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ handle: analyzeHandle.replace('@', '') }),
      });
      await loadStyleProfile(selectedAccountId);
      setSuccess('Style profile analyzed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTrigger = async (configId: string) => {
    try {
      setTriggering(configId);
      setError('');
      await apiFetch(`/api/v1/agent/trigger/${configId}`, { method: 'POST' });
      setSuccess('Drafts generated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger');
    } finally {
      setTriggering(null);
    }
  };

  const handleDelete = async (configId: string) => {
    if (!confirm(t('config.deleteConfirm'))) return;

    try {
      await apiFetch(`/api/v1/agent/configs/${configId}`, { method: 'DELETE' });
      router.push('/agent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const toggleFormat = (format: string) => {
    setFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format],
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const existingConfig = configs.find((c) => c.accountId === selectedAccountId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('config.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-600 dark:text-green-400">
          {success}
        </div>
      )}

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div>
          <label className="mb-2 block text-sm font-medium">{t('config.account')}</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
          >
            <option value="">{t('config.selectAccount')}</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.displayName || `@${acc.id}`}
              </option>
            ))}
          </select>
        </div>

        {selectedAccountId && (
          <>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t('config.enabled')}</label>
              <button
                onClick={() => setEnabled(!enabled)}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  enabled ? 'bg-green-500' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    enabled && 'translate-x-5',
                  )}
                />
              </button>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                {t('config.dailyTarget')}: {dailyTarget}
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={dailyTarget}
                onChange={(e) => setDailyTarget(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t('config.formats')}</label>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((format) => (
                  <button
                    key={format}
                    onClick={() => toggleFormat(format)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      formats.includes(format)
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t('config.topics')}</label>
              <input
                type="text"
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder={t('config.topicsPlaceholder')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('config.topicsHint')}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t('config.toneOverride')}</label>
              <input
                type="text"
                value={toneOverride}
                onChange={(e) => setToneOverride(e.target.value)}
                placeholder={t('config.tonePlaceholder')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{t('config.interval')}</label>
              <select
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              >
                {INTERVALS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(`config.${opt.label}`)}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {selectedAccountId && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-6">
          <h2 className="font-semibold">{t('style.title')}</h2>

          <div className="flex gap-2">
            <input
              type="text"
              value={analyzeHandle}
              onChange={(e) => setAnalyzeHandle(e.target.value)}
              placeholder={t('style.handlePlaceholder')}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
            />
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !analyzeHandle}
              className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('style.analyze')}
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{t('style.customInstructions')}</label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder={t('style.customPlaceholder')}
              rows={4}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:border-foreground focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{t('style.language')}</label>
            <select
              value={tweetLanguage}
              onChange={(e) => setTweetLanguage(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      )}

      {selectedAccountId && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t('config.save')}
          </button>

          {existingConfig && (
            <>
              <button
                onClick={() => handleTrigger(existingConfig.id)}
                disabled={triggering === existingConfig.id}
                className="flex items-center gap-2 rounded-full bg-blue-500/10 px-5 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/20 disabled:opacity-50 dark:text-blue-400"
              >
                {triggering === existingConfig.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {t('config.trigger')}
              </button>

              <button
                onClick={() => handleDelete(existingConfig.id)}
                className="flex items-center gap-2 rounded-full bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                {t('config.delete')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
