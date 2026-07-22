import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Criteria } from './pages/Criteria';
import { Login } from './pages/Login';
import { Monitoring } from './pages/Monitoring';
import { Onboarding } from './pages/Onboarding';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Students } from './pages/Students';
import { SubmissionDetail } from './pages/SubmissionDetail';
import { Submissions } from './pages/Submissions';

function ProtectedShell({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Phân hệ 1 (giám sát/cấu hình) là admin-only; các phân hệ khác dùng chung admin+staff (mục 3.7)
  if (adminOnly && user.role !== 'admin') return <Navigate to="/students" replace />;

  return (
    <>
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', fontFamily: 'sans-serif', flexWrap: 'wrap' }}>
        {user.role === 'admin' && <Link to="/monitoring">{t('nav.monitoring')}</Link>}
        {user.role === 'admin' && <Link to="/settings">{t('nav.settings')}</Link>}
        <Link to="/onboarding">{t('nav.onboarding')}</Link>
        <Link to="/students">{t('nav.students')}</Link>
        <Link to="/submissions">{t('nav.submissions')}</Link>
        <Link to="/reports">{t('nav.reports')}</Link>
        <Link to="/criteria">{t('nav.criteria')}</Link>
        <button
          onClick={() => {
            void logout().then(() => navigate('/login'));
          }}
        >
          {t('nav.logout')}
        </button>
      </nav>
      {children}
    </>
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
