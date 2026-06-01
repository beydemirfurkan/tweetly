'use client';

import { useCallback } from 'react';
import { useAuth } from './auth-context';

function resolveApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const host = window.location.hostname.replace(/^www\./, '');
  if (host === 'xtweetly.com') {
    return `${window.location.protocol}//api.xtweetly.com`;
  }

  if (host.startsWith('panel.')) {
    return `${window.location.protocol}//${host.replace(/^panel\./, 'api.')}`;
  }

  return '';
}

export function apiUrl(path: string): string {
  const origin = resolveApiOrigin();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${normalized}`;
}

function loginUrl(): string {
  if (typeof window === 'undefined') return '/login';
  // Strip locale prefix so next-intl router doesn't double-add it after login
  const pathname = window.location.pathname.replace(/^\/(tr|en)/, '') || '/';
  const next = `${pathname}${window.location.search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

const TOKEN_KEY = 'xtweetly_session_key';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * Parsed JSON body when the response was JSON; the raw text fallback is
     * still kept in `message`. Lets callers pull structured fields out of
     * 4xx responses (e.g. cooldown retryAfterSec, validation hints) without
     * re-parsing the message string.
     */
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function parseErrorBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export interface CookieHealthResponse {
  ok: boolean;
  screenName?: string;
  reason?: 'missing_fields' | 'rejected_by_x' | 'invalid_response' | 'network_error';
  detail?: string;
  status?: number;
}

export interface LoginCooldownPayload {
  message: string;
  retryAfterSec: number;
  retryAt: string;
  failureCount: number;
  manualReviewRequired: boolean;
}

/** Type guard for the 429 body the backend serializes from
 *  AccountFacade.assertLoginCooldownIsClear. */
export function isLoginCooldownPayload(value: unknown): value is LoginCooldownPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.retryAfterSec === 'number' &&
    typeof v.retryAt === 'string' &&
    typeof v.failureCount === 'number' &&
    typeof v.manualReviewRequired === 'boolean'
  );
}

export type ApiFetch = <T>(
  path: string,
  options?: RequestInit & { skipAuthRedirect?: boolean },
) => Promise<T>;

type OnUnauthorized = () => void;

async function coreFetch<T>(
  path: string,
  options: RequestInit & { skipAuthRedirect?: boolean },
  onUnauthorized: OnUnauthorized,
): Promise<T> {
  const token = getToken();
  const { skipAuthRedirect, headers: extraHeaders, ...rest } = options ?? {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders as Record<string, string> | undefined),
  };

  const res = await fetch(apiUrl(path), { ...rest, headers });

  if (res.status === 401 && !skipAuthRedirect) {
    onUnauthorized();
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl();
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `API error: ${res.status}`, parseErrorBody(body));
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { skipAuthRedirect?: boolean },
): Promise<T> {
  return coreFetch<T>(path, options ?? {}, () => clearToken());
}

export function useApiFetch(): ApiFetch {
  const { logout } = useAuth();

  return useCallback<ApiFetch>(
    async <T>(path: string, options?: RequestInit & { skipAuthRedirect?: boolean }): Promise<T> =>
      coreFetch<T>(path, options ?? {}, logout),
    [logout],
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface CurrentUser {
  id: string;
  email: string;
  status: 'active' | 'suspended';
}

export interface ConsumeResponse {
  ok: boolean;
  sessionKey: string;
  user: { id: string; email: string };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  issuedVia: 'manual' | 'oauth';
  oauthClientId: string | null;
}

export interface CreatedApiKey {
  id: string;
  key: string;
  prefix: string;
  name: string;
}

// ── Accounts (user-scoped /api/v1) ────────────────────────────────────────

export interface SessionHealth {
  health: 'unknown' | 'healthy' | 'unhealthy';
  lastCheckAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  authFailureCount: number;
}

export interface AccountProfile {
  displayName: string;
  bio: string;
  followersCount: string;
  followingCount: string;
  tweetsCount: string;
  profileImageUrl: string;
  verified: boolean;
  fetchedAt: string;
}

export interface RedactedAccount {
  id: string;
  displayName: string | null;
  status: 'active' | 'paused' | 'banned';
  hasAuthToken: boolean;
  hasAuthMulti: boolean;
  hasCt0: boolean;
  hasTwid: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  session: SessionHealth;
  profile: AccountProfile | null;
}

export interface XUserProfile {
  handle: string;
  displayName: string;
  bio: string;
  followersCount: string;
  followingCount: string;
  tweetsCount: string;
  verified: boolean;
  profileUrl: string;
  profileImageUrl: string;
}

export interface AccountsResponse {
  count: number;
  accounts: RedactedAccount[];
}

export interface AccountUpdateBody {
  displayName?: string | null;
  authToken?: string;
  authMulti?: string | null;
  ct0?: string | null;
  twid?: string | null;
  status?: 'active' | 'paused' | 'banned';
}

// ── Server-side X login (connect / reauth) ────────────────────────────────

export interface AccountConnectBody {
  username: string;
  email?: string | null;
  password: string;
  totpSecret?: string | null;
  saveTotpSecret?: boolean;
  proxyCountry?: string | null;
}

export interface AccountReauthBody {
  password: string;
  totpSecret?: string | null;
  saveTotpSecret?: boolean;
  email?: string | null;
  proxyCountry?: string | null;
}

export type LoginJobStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export type LoginJobFailureReason =
  | 'invalid_credentials'
  | 'captcha_required'
  | 'email_challenge'
  | 'email_verification_required'
  | 'suspicious_login_blocked'
  | 'login_cooldown'
  | 'cookies_missing'
  | 'home_not_reached'
  | 'account_locked'
  | 'phone_verification_required'
  | 'cancelled'
  | 'unknown';

export interface LoginJobCancelResponse {
  ok: true;
  status: 'cancelled';
  priorStatus: 'queued' | 'running';
}

export interface LoginJobAccepted {
  jobId: string;
  kind: 'connect' | 'reauth';
  pollUrl: string;
}

export interface LoginJobResponse {
  id: string;
  kind: 'connect' | 'reauth';
  status: LoginJobStatus;
  targetAccountId: string | null;
  failureReason: LoginJobFailureReason | null;
  failureDetail: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// ── Actions / system ──────────────────────────────────────────────────────

export interface QueueDepth {
  type: string;
  pending: number;
  claimed: number;
  running: number;
  failed: number;
  dead: number;
}

export interface StatusResponse {
  ok: boolean;
  now: string;
  queue: {
    byType: QueueDepth[];
    totalPending: number;
    totalDead: number;
  };
}

export interface ActionRow {
  id: string;
  status: string;
  account_id: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  last_error: string | null;
  error_class: string | null;
  idempotency_key: string;
  created_at: string;
}

export interface Monitor {
  id: string;
  accountId: string;
  targetHandle: string;
  webhookUrl: string;
  enabled: boolean;
  eventTypes: string[];
  lastCheckAt: string | null;
  lastTweetUrl: string | null;
  createdAt: string;
  hasWebhookSecret: boolean;
}

export interface WebhookDelivery {
  id: string;
  monitorId: string;
  eventType: string;
  status: 'delivered' | 'failed';
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface MonitorsResponse {
  count: number;
  monitors: Monitor[];
}

export interface UserSummary {
  accounts: { total: number; active: number; paused: number; banned: number };
  queue: { byType: QueueDepth[]; totalPending: number; totalDead: number };
  activity: { succeededLast24h: number };
}

export interface MonitorDetailResponse {
  monitor: Monitor;
  recentDeliveries: WebhookDelivery[];
}
