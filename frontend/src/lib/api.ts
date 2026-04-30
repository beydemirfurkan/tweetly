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
  const next = `${window.location.pathname}${window.location.search}`;
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

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { skipAuthRedirect?: boolean },
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };
  const { skipAuthRedirect, ...rest } = options ?? {};

  const res = await fetch(apiUrl(path), {
    ...rest,
    headers,
  });

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

export interface MonitorDetailResponse {
  monitor: Monitor;
  recentDeliveries: WebhookDelivery[];
}
