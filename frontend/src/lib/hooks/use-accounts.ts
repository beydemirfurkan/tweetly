'use client';

import type { RedactedAccount } from '@/lib/api';
import { useApiResource } from './use-api-resource';

interface AccountsResponse {
  count: number;
  accounts: RedactedAccount[];
}

/**
 * Feature wrapper around `useApiResource` for the accounts list.
 * Centralises the `/api/v1/accounts` path and the `{count, accounts}`
 * envelope so screens only deal with the unwrapped array. Adding e.g.
 * search/filter parameters later happens here, not in every consumer.
 */
export function useAccounts() {
  const resource = useApiResource<AccountsResponse>('/api/v1/accounts');
  return {
    accounts: resource.data?.accounts ?? [],
    count: resource.data?.count ?? 0,
    error: resource.error,
    loading: resource.loading,
    refetch: resource.refetch,
  };
}
