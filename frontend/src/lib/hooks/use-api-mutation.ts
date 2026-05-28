'use client';

import { useCallback, useState } from 'react';
import { ApiError, useApiFetch } from '@/lib/api';

interface UseApiMutationState {
  submitting: boolean;
  error: ApiError | Error | null;
}

interface MutationRunner<TInput, TResult> {
  (input: TInput): Promise<TResult>;
}

interface UseApiMutationApi<TInput, TResult> extends UseApiMutationState {
  mutate: MutationRunner<TInput, TResult>;
  reset: () => void;
}

/**
 * Counterpart to `useApiResource` for POST/PATCH/DELETE flows. Centralises
 * the in-flight flag + error state and re-throws the original ApiError so
 * callers can branch on status codes without losing the typed body.
 *
 * The `runner` is intentionally caller-supplied: mutation paths differ
 * (one endpoint, multiple endpoints, with optimistic updates, etc.) and
 * forcing a single shape would push complexity into the consumer.
 */
export function useApiMutation<TInput, TResult>(
  runner: (apiFetch: ReturnType<typeof useApiFetch>, input: TInput) => Promise<TResult>,
): UseApiMutationApi<TInput, TResult> {
  const apiFetch = useApiFetch();
  const [state, setState] = useState<UseApiMutationState>({ submitting: false, error: null });

  const mutate = useCallback<MutationRunner<TInput, TResult>>(
    async (input: TInput) => {
      setState({ submitting: true, error: null });
      try {
        const result = await runner(apiFetch, input);
        setState({ submitting: false, error: null });
        return result;
      } catch (err) {
        setState({ submitting: false, error: err as ApiError | Error });
        throw err;
      }
    },
    [apiFetch, runner],
  );

  const reset = useCallback(() => setState({ submitting: false, error: null }), []);

  return { ...state, mutate, reset };
}
