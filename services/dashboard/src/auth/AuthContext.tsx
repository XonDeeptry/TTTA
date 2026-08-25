import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

export interface CurrentUser {
  email: string;
  role: 'admin' | 'staff';
  mustChangePassword: boolean;
  /**
   * F10 — tập quyền CÓ HIỆU LỰC, do `GET /auth/me` suy ra phía server. Với `admin` nó luôn chứa
   * đủ cả hai quyền (AC-11.2), nên màn hình chỉ cần hỏi `privileges.includes(...)` và KHÔNG được
   * tự cài lại luật "admin có mọi quyền" ở client — một luật bị nhân bản là một luật sẽ lệch.
   *
   * Không bắt buộc vì `POST /auth/login` và `POST /auth/change-password` giữ nguyên shape cũ
   * (AC-11.5); giá trị được nạp ngay sau đó bằng một lần `GET /auth/me`.
   */
  privileges?: string[];
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

  /**
   * `POST /auth/login` và `POST /auth/change-password` KHÔNG trả `privileges` (F10 AC-11.5 đóng
   * băng hai shape đó), nên nạp thêm một lần `GET /auth/me` để có tập quyền ngay lập tức thay vì
   * phải tải lại trang. Lỗi ở bước bổ sung này KHÔNG được làm hỏng việc đăng nhập.
   */
  async function withPrivileges(base: CurrentUser): Promise<CurrentUser> {
    try {
      return await api.get<CurrentUser>('/auth/me');
    } catch {
      return base;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const loggedIn = await api.post<CurrentUser>('/auth/login', { email, password });
    setUser(await withPrivileges(loggedIn));
  }

  async function logout(): Promise<void> {
    await api.post('/auth/logout');
    setUser(null);
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const updated = await api.post<CurrentUser>('/auth/change-password', { currentPassword, newPassword });
    setUser(await withPrivileges(updated));
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
