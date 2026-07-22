import 'express-session';

export type DashboardRole = 'admin' | 'staff';

declare module 'express-session' {
  interface SessionData {
    user?: { id: number; email: string; role: DashboardRole; mustChangePassword: boolean };
  }
}
