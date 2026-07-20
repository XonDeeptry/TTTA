import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Settings } from './pages/Settings';

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', fontFamily: 'sans-serif' }}>
        <Link to="/settings">{t('nav.settings')}</Link>
        <Link to="/onboarding">{t('nav.onboarding')}</Link>
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
          path="/settings"
          element={
            <ProtectedShell>
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
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Routes>
    </AuthProvider>
  );
}
