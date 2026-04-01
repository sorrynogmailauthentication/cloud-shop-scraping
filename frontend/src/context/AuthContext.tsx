import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, AuthContextValue } from '../types/auth';

const API_BASE = import.meta.env.VITE_API_URL as string || '';
const TOKEN_KEY = 'dashboard_token';

function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getStoredToken());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash?.slice(1) || '';
    const params = new URLSearchParams(hash);
    const hashToken = params.get('token');
    if (hashToken) {
      const decoded = decodeURIComponent(hashToken);
      sessionStorage.setItem(TOKEN_KEY, decoded);
      setTokenState(decoded);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    const t = token || getStoredToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json() as { user: User };
        setUser(data.user);
        setError(null);
      } else {
        setUser(null);
        setTokenState(null);
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      setUser(null);
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const loginWithYandex = useCallback(() => {
    window.location.href = `${API_BASE}/auth/yandex`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      setUser(null);
      setTokenState(null);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    token: token || getStoredToken(),
    loginWithYandex,
    logout,
    refreshUser: fetchUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
