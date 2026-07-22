import { FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function ChangePassword() {
  const { t } = useTranslation();
  const { user, loading, changePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentPasswordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t('changePassword.mismatch'));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t('changePassword.sameAsCurrent'));
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      navigate(from ?? '/students', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(t('changePassword.sameAsCurrent'));
      } else {
        setError(t('changePassword.error'));
      }
      currentPasswordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return null;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-h1">{t('changePassword.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Label className="block space-y-1">
              <span>{t('changePassword.currentPassword')}</span>
              <Input
                ref={currentPasswordRef}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Label>
            <Label className="block space-y-1">
              <span>{t('changePassword.newPassword')}</span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Label>
            <Label className="block space-y-1">
              <span>{t('changePassword.confirmPassword')}</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Label>
            {error && (
              <Alert variant="destructive" role="alert">
                {error}
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {t('changePassword.submit')}
            </Button>
            {!user.mustChangePassword && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate(from ?? '/students', { replace: true })}
              >
                {t('changePassword.cancel')}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
