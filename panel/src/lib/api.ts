const API_BASE = '/admin';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tweetly_admin_token');
}

export function setToken(token: string): void {
  localStorage.setItem('tweetly_admin_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('tweetly_admin_token');
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
  options?: RequestInit,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/panel/login';
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

export interface StatusResponse {
  ok: boolean;
  now: string;
  queue: {
    byType: QueueDepth[];
    totalPending: number;
    totalDead: number;
  };
  analytics: {
    last7dPosts: number;
    formatPerformance: FormatStats[];
  };
}

export interface QueueDepth {
  type: string;
  pending: number;
  claimed: number;
  running: number;
  failed: number;
  dead: number;
}

export interface FormatStats {
  format: string;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  avgDurationMs: number;
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

export interface SecretsStatus {
  openrouterApiKeyConfigured: boolean;
  adminTokenConfigured: boolean;
}

export interface SettingDef {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue: string;
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
