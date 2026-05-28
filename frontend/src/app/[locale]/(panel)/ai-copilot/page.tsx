'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useApiFetch, type RedactedAccount } from '@/lib/api';
import { useLazyLoad } from '@/lib/use-lazy-load';
import { CopilotProvider, useCopilot } from './_state/copilot-context';
import { TabBar, type CopilotTabKey } from './_components/tab-bar';
import { ProfileTab } from './_tabs/profile-tab';
import { ContentTab } from './_tabs/content-tab';
import { ScoreTab } from './_tabs/score-tab';
import { HistoryTab } from './_tabs/history-tab';

export default function AiCopilotPage() {
  return (
    <CopilotProvider>
      <CopilotShell />
    </CopilotProvider>
  );
}

function CopilotShell() {
  const t = useTranslations('copilot');
  const tc = useTranslations('common');
  const apiFetch = useApiFetch();
  const { error, setError, setAccounts } = useCopilot();
  const [activeTab, setActiveTab] = useState<CopilotTabKey>('profile');

  useLazyLoad(async () => {
    try {
      const res = await apiFetch<{ count: number; accounts: RedactedAccount[] }>('/api/v1/accounts');
      setAccounts(res.accounts);
    } catch {
      /* accounts optional for copilot */
    }
  });

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
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'content' && <ContentTab />}
        {activeTab === 'score' && <ScoreTab />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}
