'use client';

import type { useTranslations } from 'next-intl';
import { Brain, Sparkles, BarChart3, History } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CopilotTabKey = 'profile' | 'content' | 'score' | 'history';

export function TabBar({
  active,
  onChange,
  t,
}: {
  active: CopilotTabKey;
  onChange: (v: CopilotTabKey) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const tabs: { key: CopilotTabKey; icon: React.ElementType; label: string }[] = [
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
