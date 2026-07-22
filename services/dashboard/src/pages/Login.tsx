import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/settings');
    } catch {
      setError(t('login.error'));
    }
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-h1">{t('login.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Label className="block space-y-1">
              <span>{t('login.email')}</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Label>
            <Label className="block space-y-1">
              <span>{t('login.password')}</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Label>
            {error && (
              <Alert variant="destructive" role="alert">
                {error}
              </Alert>
            )}
            <Button type="submit" className="w-full">
              {t('login.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
