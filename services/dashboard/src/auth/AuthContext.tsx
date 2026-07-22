import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

export interface CurrentUser {
  email: string;
  role: 'admin' | 'staff';
  mustChangePassword: boolean;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CurrentUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const loggedIn = await api.post<CurrentUser>('/auth/login', { email, password });
    setUser(loggedIn);
  }

  async function logout(): Promise<void> {
    await api.post('/auth/logout');
    setUser(null);
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const updated = await api.post<CurrentUser>('/auth/change-password', { currentPassword, newPassword });
    setUser(updated);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
