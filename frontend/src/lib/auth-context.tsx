'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { apiFetch, apiUrl, setToken, clearToken, getToken, type ConsumeResponse, type CurrentUser } from './api';

interface AuthContextValue {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requestLink: (email: string) => Promise<{ ok: boolean; error?: string }>;
  consumeToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch<CurrentUser>('/auth/me', { skipAuthRedirect: true })
      .then((me) => setUser(me))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const requestLink = useCallback(async (email: string) => {
    try {
      const res = await fetch(apiUrl('/auth/request-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) return { ok: true };
      const body = await res.text().catch(() => '');
      return { ok: false, error: body || `Hata: ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Sunucuya ulaşılamıyor' };
    }
  }, []);

  const consumeToken = useCallback(async (magicToken: string) => {
    try {
      const res = await fetch(apiUrl('/auth/consume'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: magicToken }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: body || 'Geçersiz veya süresi geçmiş bağlantı' };
      }
      const data = (await res.json()) as ConsumeResponse;
      setToken(data.sessionKey);
      const me = await apiFetch<CurrentUser>('/auth/me', { skipAuthRedirect: true });
      setUser(me);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Sunucuya ulaşılamıyor' };
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: Boolean(user), isLoading, requestLink, consumeToken, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
