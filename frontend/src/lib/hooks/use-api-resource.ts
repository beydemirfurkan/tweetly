'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, useApiFetch } from '@/lib/api';

interface UseApiResourceState<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
}

interface UseApiResourceApi<T> extends UseApiResourceState<T> {
  /** Re-issue the GET request and replace state. */
  refetch: () => Promise<void>;
  /** Optimistic update: callers can patch the cached value locally. */
  setData: (value: T | null) => void;
}

interface Options {
  /** Skip the initial fetch (e.g. waiting on an upstream dependency). */
  skip?: boolean;
}

/**
 * Single-endpoint GET hook. Cuts the canonical
 *   `useState + useState + useState + useEffect + apiFetch`
 * boilerplate every page used to repeat. Returns a `refetch` callback for
 * post-mutation reloads and a `setData` setter for optimistic UI tweaks.
 *
 * The hook does NOT cache across components or remount cycles — for that,
 * a real data layer (TanStack Query / SWR) should be adopted. This is the
 * incremental in-tree win that gets pages out of the
 * "useEffect + raw fetch" pattern without dragging in a new dependency.
 */
export function useApiResource<T>(path: string, options: Options = {}): UseApiResourceApi<T> {
  const apiFetch = useApiFetch();
  const [state, setState] = useState<UseApiResourceState<T>>({
    data: null,
    error: null,
    loading: !options.skip,
  });

  // Guards against setting state after the consumer has unmounted, and
  // against late responses from a stale refetch.
  const generationRef = useRef(0);

  const run = useCallback(async () => {
    const generation = ++generationRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await apiFetch<T>(path);
      if (generation !== generationRef.current) return;
      setState({ data, error: null, loading: false });
    } catch (err) {
      if (generation !== generationRef.current) return;
      setState({ data: null, error: err as ApiError | Error, loading: false });
    }
  }, [apiFetch, path]);

  useEffect(() => {
    if (options.skip) return;
    void run();
    return () => {
      generationRef.current++;
    };
  }, [run, options.skip]);

  const setData = useCallback(
    (value: T | null) => setState((prev) => ({ ...prev, data: value })),
    [],
  );

  return { ...state, refetch: run, setData };
}
