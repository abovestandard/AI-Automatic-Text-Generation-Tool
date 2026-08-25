import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, AuthUser } from '../api';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  needsBootstrap: boolean;
  login: (email: string, password: string) => Promise<void>;
  bootstrap: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'aica_auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const status = await api.getAuthStatus();
      setNeedsBootstrap(status.needsBootstrap);

      if (token && !status.needsBootstrap) {
        api.setToken(token);
        const me = await api.getMe();
        setUser(me);
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      api.setToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const result = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    api.setToken(result.token);
    setUser(result.user);
    setNeedsBootstrap(false);
  }

  async function bootstrap(email: string, password: string, name: string) {
    const result = await api.bootstrap(email, password, name);
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    api.setToken(result.token);
    setUser(result.user);
    setNeedsBootstrap(false);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    api.setToken(null);
  }

  async function refreshUser() {
    if (!token) return;
    const me = await api.getMe();
    setUser(me);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, needsBootstrap, login, bootstrap, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
