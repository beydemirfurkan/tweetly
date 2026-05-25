'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  /** The error caught by the segment-level boundary. Forwarded to console + UI message. */
  error: Error & { digest?: string };
  /** Next's segment-level retry handler. When omitted the retry button is hidden. */
  retry?: () => void;
  /** Tag rendered above the title — usually the segment name ("Auth", "OAuth", "Connect"). */
  segmentLabel?: string;
  /** Segment-specific title (localized by the caller). Falls back to a generic panel title. */
  title?: string;
  /** Optional context line shown below the title before the error message. */
  description?: string;
}

/**
 * Shared fallback rendered by Next segment error boundaries. Each segment
 * (`auth/`, `oauth/`, `connect/`, `(panel)/`) wraps this in a thin
 * `error.tsx` so the boundary is per-route — a thrown render error doesn't
 * blow out into the platform error overlay.
 *
 * The retry button is wired to Next's `unstable_retry` / `reset` prop
 * passed into segment errors; back is plain router history.
 */
export function ErrorState({ error, retry, segmentLabel, title, description }: ErrorStateProps) {
  const router = useRouter();
  const tp = useTranslations('panel');
  const tc = useTranslations('common');

  useEffect(() => {
    // Console-log every error so the dev overlay isn't the only signal in
    // production; surface digest if Next attached one.
    console.error(
      `[ErrorState${segmentLabel ? `:${segmentLabel}` : ''}]`,
      error,
      error.digest ? `digest=${error.digest}` : '',
    );
  }, [error, segmentLabel]);

  const resolvedTitle = title ?? tp('errorTitle');
  const fallbackMessage = error.message || tp('errorDefaultMessage');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="max-w-md space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
          <span className="animate-pulse-dot">●</span> {segmentLabel ?? 'Error'}
        </p>
        <h2 className="text-[28px] font-black leading-tight tracking-[-0.025em]">{resolvedTitle}</h2>
        {description && (
          <p className="text-[14px] leading-[1.55] text-muted-foreground">{description}</p>
        )}
        <p className="text-[14px] leading-[1.55] text-muted-foreground">{fallbackMessage}</p>
        {error.digest && (
          <p className="pt-1 font-mono text-[11px] text-muted-foreground/60">digest: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          {tp('errorBack')}
        </Button>
        {retry && (
          <Button size="sm" onClick={retry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {tc('retry')}
          </Button>
        )}
      </div>
    </div>
  );
}
