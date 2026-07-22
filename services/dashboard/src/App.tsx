import { useState } from 'react';
import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth, CurrentUser } from './auth/AuthContext';
import { Button } from './components/ui/button';
import { Separator } from './components/ui/separator';
import { Tooltip } from './components/ui/tooltip';
import {
  IconCriteria,
  IconGauge,
  IconLogout,
  IconMenu,
  IconOnboarding,
  IconReports,
  IconSettings,
  IconStudents,
  IconSubmissions,
} from './components/icons';
import { cn } from './lib/utils';
import { Criteria } from './pages/Criteria';
import { Login } from './pages/Login';
import { Monitoring } from './pages/Monitoring';
import { Onboarding } from './pages/Onboarding';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Students } from './pages/Students';
import { SubmissionDetail } from './pages/SubmissionDetail';
import { Submissions } from './pages/Submissions';

interface NavItem {
  to: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
}

function SidebarNav({ user, mobileOpen, setMobileOpen }: { user: CurrentUser; mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items: NavItem[] = [
    ...(user.role === 'admin' ? [{ to: '/monitoring', label: t('nav.monitoring'), icon: IconGauge }] : []),
    ...(user.role === 'admin' ? [{ to: '/settings', label: t('nav.settings'), icon: IconSettings }] : []),
    { to: '/onboarding', label: t('nav.onboarding'), icon: IconOnboarding },
    { to: '/students', label: t('nav.students'), icon: IconStudents },
    { to: '/submissions', label: t('nav.submissions'), icon: IconSubmissions },
    { to: '/reports', label: t('nav.reports'), icon: IconReports },
    { to: '/criteria', label: t('nav.criteria'), icon: IconCriteria },
  ];

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card p-3 transition-transform md:static md:w-16 md:translate-x-0 lg:w-60',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="mb-4 flex items-center px-1 py-1">
        <span className="truncate text-h3 text-primary md:hidden lg:inline">ILM</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1" aria-label={t('nav.toggleMenu')}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = location.pathname.startsWith(item.to);
          const link = (
            <Link
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                active ? 'border-l-2 border-primary bg-primary/10 text-primary' : 'text-foreground/70 hover:bg-muted',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="md:hidden lg:inline">{item.label}</span>
            </Link>
          );
          return (
            <div key={item.to} className="md:hidden lg:block">
              {link}
            </div>
          );
        })}
        <div className="hidden md:flex md:flex-col md:gap-1 lg:hidden">
          {items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Tooltip key={item.to} label={item.label}>
                <Link
                  to={item.to}
                  aria-label={item.label}
                  className={cn(
                    'flex items-center justify-center rounded-md px-3 py-2 text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active ? 'border-l-2 border-primary bg-primary/10 text-primary' : 'text-foreground/70 hover:bg-muted',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                </Link>
              </Tooltip>
            );
          })}
        </div>
      </nav>
      <Separator className="my-2" />
      <Button
        variant="ghost"
        className="justify-start gap-3 px-3"
        aria-label={t('nav.logout')}
        onClick={() => {
          void logout().then(() => navigate('/login'));
        }}
      >
        <IconLogout className="h-5 w-5 shrink-0" />
        <span className="md:hidden lg:inline">{t('nav.logout')}</span>
      </Button>
    </aside>
  );
}

function ProtectedShell({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Phân hệ 1 (giám sát/cấu hình) là admin-only; các phân hệ khác dùng chung admin+staff (mục 3.7)
  if (adminOnly && user.role !== 'admin') return <Navigate to="/students" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t('nav.skipToContent')}
      </a>
      {mobileOpen && (
        <button
          aria-label={t('nav.toggleMenu')}
          className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <SidebarNav user={user} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('nav.toggleMenu')}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <IconMenu className="h-5 w-5" />
          </Button>
          <span className="text-h3">ILM</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/monitoring"
          element={
            <ProtectedShell adminOnly>
              <Monitoring />
            </ProtectedShell>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedShell adminOnly>
              <Settings />
            </ProtectedShell>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedShell>
              <Onboarding />
            </ProtectedShell>
          }
        />
        <Route
          path="/students"
          element={
            <ProtectedShell>
              <Students />
            </ProtectedShell>
          }
        />
        <Route
          path="/submissions"
          element={
            <ProtectedShell>
              <Submissions />
            </ProtectedShell>
          }
        />
        <Route
          path="/submissions/:id"
          element={
            <ProtectedShell>
              <SubmissionDetail />
            </ProtectedShell>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedShell>
              <Reports />
            </ProtectedShell>
          }
        />
        <Route
          path="/criteria"
          element={
            <ProtectedShell>
              <Criteria />
            </ProtectedShell>
          }
        />
        <Route path="*" element={<Navigate to="/students" replace />} />
      </Routes>
    </AuthProvider>
  );
}
