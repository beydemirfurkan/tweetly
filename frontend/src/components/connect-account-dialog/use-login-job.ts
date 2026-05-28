'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, useApiFetch, type LoginJobCancelResponse, type LoginJobResponse } from '@/lib/api';
import type { Phase } from './types';

const POLL_INTERVAL_MS = 2000;

interface UseLoginJobOptions {
  /** Fires when the polled job reports `success`. */
  onSuccess: (targetAccountId: string) => void;
}

interface UseLoginJobApi {
  phase: Phase;
  /** Replace the current phase (idle reset, swap to alreadyConnected/cooldown, etc.). */
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
  /** Begin polling a freshly accepted login job. */
  startPolling: (jobId: string) => void;
  /** Issue DELETE; optimistically flips the panel into `cancelling=true`. */
  requestCancel: (jobId: string) => Promise<void>;
  /** Call from the dialog effect that resets state when `open` flips. */
  resetForOpen: () => void;
  /** Call from the dialog effect when `open` flips false to halt the loop. */
  stopOnClose: () => void;
}

/**
 * State machine + polling loop for an X login job. Owning this here keeps
 * the dialog body presentation-only — no setTimeout chains, no
 * cancelled-ref bookkeeping, no cross-state mutations.
 */
export function useLoginJob(opts: UseLoginJobOptions): UseLoginJobApi {
  const apiFetch = useApiFetch();
  const t = useTranslations('connectDialog');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const cancelledRef = useRef(false);

  // Stop polling on unmount.
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      setPhase({ kind: 'polling', jobId, status: 'queued', cancelling: false });

      const tick = async () => {
        if (cancelledRef.current) return;
        try {
          const job = await apiFetch<LoginJobResponse>(`/api/v1/accounts/login-jobs/${jobId}`);
          if (cancelledRef.current) return;

          if (job.status === 'success') {
            setPhase({ kind: 'success', targetAccountId: job.targetAccountId ?? '' });
            setTimeout(() => {
              if (cancelledRef.current) return;
              opts.onSuccess(job.targetAccountId ?? '');
            }, 800);
            return;
          }
          if (job.status === 'failed') {
            setPhase({
              kind: 'failed',
              reason: job.failureReason ?? 'unknown',
              detail: job.failureDetail,
            });
            return;
          }
          if (job.status === 'cancelled') {
            setPhase({ kind: 'cancelled' });
            return;
          }
          // queued | running — keep polling. Preserve the local `cancelling`
          // flag if the user already clicked Cancel: the DELETE call may
          // have returned before the worker observed it, so we keep the
          // optimistic state until the next poll surfaces status=cancelled.
          setPhase((prev) =>
            prev.kind === 'polling'
              ? { kind: 'polling', jobId, status: job.status, cancelling: prev.cancelling }
              : { kind: 'polling', jobId, status: job.status, cancelling: false },
          );
          setTimeout(tick, POLL_INTERVAL_MS);
        } catch (err) {
          if (cancelledRef.current) return;
          const msg = err instanceof Error ? err.message : t('errorUnknown');
          setPhase({ kind: 'failed', reason: 'unknown', detail: msg });
        }
      };
      setTimeout(tick, POLL_INTERVAL_MS);
    },
    [apiFetch, opts, t],
  );

  const requestCancel = useCallback(
    async (jobId: string) => {
      setPhase((prev) => (prev.kind === 'polling' ? { ...prev, cancelling: true } : prev));
      try {
        await apiFetch<LoginJobCancelResponse>(`/api/v1/accounts/login-jobs/${jobId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        // 409 means the worker already finished — leave the poll loop to
        // land on the actual terminal status. Any other error: surface as
        // a failure panel rather than leaving the user stuck on
        // "cancelling…".
        if (err instanceof ApiError && err.status === 409) return;
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : t('errorUnknown');
        setPhase({ kind: 'failed', reason: 'unknown', detail: msg });
      }
    },
    [apiFetch, t],
  );

  const resetForOpen = useCallback(() => {
    cancelledRef.current = false;
    queueMicrotask(() => {
      if (cancelledRef.current) return;
      setPhase({ kind: 'idle' });
    });
  }, []);

  const stopOnClose = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return { phase, setPhase, startPolling, requestCancel, resetForOpen, stopOnClose };
}
