'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { RedactedAccount } from '@/lib/api';
import type {
  ContentSuggestion,
  ProfileAnalysis,
  ViralScore,
} from '@/lib/types/ai-copilot';

/**
 * Cross-tab state for the AI Copilot screen. Each tab owns its own
 * inputs/local UI state (form fields, busy flags); this context holds the
 * pieces that must survive a tab switch — the loaded accounts list, the
 * profile analysis (consumed by both profile + content tabs), the active
 * suggestion list, the most-recent viral score, and the screen-wide error
 * banner state.
 */
interface CopilotState {
  accounts: RedactedAccount[];
  profile: ProfileAnalysis | null;
  suggestions: ContentSuggestion[];
  viralResult: ViralScore | null;
  error: string;
}

interface CopilotActions {
  setAccounts: (v: RedactedAccount[]) => void;
  setProfile: (v: ProfileAnalysis | null) => void;
  setSuggestions: (v: ContentSuggestion[]) => void;
  setViralResult: (v: ViralScore | null) => void;
  setError: (v: string) => void;
}

type CopilotContextValue = CopilotState & CopilotActions;

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<RedactedAccount[]>([]);
  const [profile, setProfile] = useState<ProfileAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<ContentSuggestion[]>([]);
  const [viralResult, setViralResult] = useState<ViralScore | null>(null);
  const [error, setError] = useState('');

  const value = useMemo<CopilotContextValue>(
    () => ({
      accounts,
      profile,
      suggestions,
      viralResult,
      error,
      setAccounts,
      setProfile,
      setSuggestions,
      setViralResult,
      setError,
    }),
    [accounts, profile, suggestions, viralResult, error],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    throw new Error('useCopilot must be used inside <CopilotProvider>');
  }
  return ctx;
}
