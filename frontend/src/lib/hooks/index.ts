/**
 * Public data-layer hooks. Pages should prefer these over inline
 * `useEffect + apiFetch` to keep loading/error/cancellation logic in one
 * place.
 *
 * Pattern:
 *   - `useApiResource<T>(path)` — generic GET.
 *   - `useApiMutation(runner)`  — generic POST/PATCH/DELETE.
 *   - `useAccounts()` etc.     — feature wrappers that hide the endpoint
 *     path and response envelope.
 */
export { useApiResource } from './use-api-resource';
export { useApiMutation } from './use-api-mutation';
export { useAccounts } from './use-accounts';
