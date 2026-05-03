'use client';

import { useCallback } from 'react';
import { useAuth } from './auth-context';

function resolveApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return '';

  const host = window.location.hostname.replace(/^www\./, '');
  if (host.startsWith('tw-panel.')) {
    return `${window.location.protocol}//${host.replace(/^tw-panel\./, 'tw-backend.')}`;
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

const TOKEN_KEY = 'tweetly_session_key';

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
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiFetch = <T>(
  path: string,
  options?: RequestInit & { skipAuthRedirect?: boolean },
) => Promise<T>;

/**
 * Bare fetch helper used outside React (e.g. in auth-context). Reads the token
 * from localStorage; on 401, clears the token and bounces to /login unless
 * skipAuthRedirect is set.
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { skipAuthRedirect?: boolean },
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
    clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl();
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `API error: ${res.status}`);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Hook variant that integrates with AuthContext: on 401, clears the in-memory
 * user (logout) so the panel guard re-renders and redirects.
 */
export function useApiFetch(): ApiFetch {
  const { logout } = useAuth();

  return useCallback<ApiFetch>(
    async <T>(path: string, options?: RequestInit & { skipAuthRedirect?: boolean }): Promise<T> => {
      const token = getToken();
      const { skipAuthRedirect, headers: extraHeaders, ...rest } = options ?? {};

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders as Record<string, string> | undefined),
      };

      const res = await fetch(apiUrl(path), { ...rest, headers });

      if (res.status === 401 && !skipAuthRedirect) {
        logout();
        if (typeof window !== 'undefined') {
          window.location.href = loginUrl();
        }
        throw new ApiError(401, 'Unauthorized');
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ApiError(res.status, body || `API error: ${res.status}`);
      }

      const text = await res.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    },
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
}

export interface AccountReauthBody {
  password: string;
  totpSecret?: string | null;
  saveTotpSecret?: boolean;
  email?: string | null;
}

export type LoginJobStatus = 'queued' | 'running' | 'success' | 'failed';
export type LoginJobFailureReason =
  | 'invalid_credentials'
  | 'captcha_required'
  | 'email_challenge'
  | 'email_verification_required'
  | 'suspicious_login_blocked'
  | 'login_cooldown'
  | 'cookies_missing'
  | 'home_not_reached'
  | 'unknown';

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

export const FAILURE_REASON_TR: Record<LoginJobFailureReason, string> = {
  invalid_credentials:
    'Kullanıcı adı veya şifre hatalı. X panelinden giriş yapabildiğinizi doğrulayın, sonra tekrar deneyin.',
  captcha_required:
    'X bir captcha doğrulaması istedi. Şu anda otomatik çözemiyoruz — manuel cookie yapıştırma yöntemine geçebilirsiniz.',
  email_challenge:
    'X "olağandışı giriş" doğrulama kodu istedi. 2FA secret kayıtlı değilse onu girin; ya da manuel cookie yapıştırın.',
  email_verification_required:
    'X e-posta veya doğrulama kodu istedi. Bu adımı otomatik geçmiyoruz; manuel doğrulama veya cookie yapıştırma gerekir.',
  suspicious_login_blocked:
    'X bu girişi şüpheli gördü. Aynı IP/bölgeden manuel giriş yapıp hesabı doğrulayın, sonra tekrar deneyin.',
  login_cooldown:
    'X çok fazla giriş denemesi tespit etti. 30-60 dakika bekleyip tekrar deneyin.',
  cookies_missing:
    'Login tamamlanmış göründü ama gerekli X session cookie’leri alınamadı. Manuel cookie yapıştırma yöntemini deneyin.',
  home_not_reached:
    'Şifre gönderildi ama X ana sayfasına geçilemedi. X ek doğrulama veya geçici blok istemiş olabilir.',
  unknown:
    'Beklenmeyen bir hata oluştu. Sorun devam ederse manuel cookie yapıştırma yöntemine geçebilirsiniz.',
};

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
