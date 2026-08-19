import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { ApiError, useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface UserView {
  id: number;
  email: string;
  role: 'admin' | 'staff';
  mustChangePassword: boolean;
  createdAt: string;
}

interface Feedback {
  variant: 'default' | 'destructive';
  role: 'status' | 'alert';
  text: string;
}

// Trạng thái/lỗi từ API được ánh xạ theo mã HTTP — api/client.ts không parse body (F5-ba §1.4).
function mapErrorToKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'users.emailExists';
    if (err.status === 400) return 'users.invalid';
    if (err.status === 403) return 'users.forbidden';
    if (err.status === 404) return 'users.notFound';
  }
  return 'users.error';
}

// Sửa/xóa: 400 ở 2 luồng này luôn có nghĩa "sẽ về 0 admin" hoặc "tự xóa chính mình" —
// khác thông điệp với create's 400 (dữ liệu sai định dạng), nên map riêng.
function mapEditErrorToKey(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return 'users.emailExists';
  if (err instanceof ApiError && err.status === 400) return 'users.lastAdmin';
  if (err instanceof ApiError && err.status === 404) return 'users.notFound';
  return 'users.error';
}

function mapDeleteErrorToKey(err: unknown): string {
  if (err instanceof ApiError && err.status === 400) return 'users.lastAdmin';
  if (err instanceof ApiError && err.status === 404) return 'users.notFound';
  return 'users.error';
}

export function Users() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<UserView[] | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const resetInputRef = useRef<HTMLInputElement>(null);
  const triggerRefs = useRef(new Map<number, HTMLButtonElement>());

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'staff'>('staff');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load(): void {
    void api.get<UserView[]>('/users').then(setData);
  }

  useEffect(load, []);

  useEffect(() => {
    if (resettingId !== null) {
      resetInputRef.current?.focus();
    }
  }, [resettingId]);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.post<UserView>('/users', { email, role, password });
      setFeedback({ variant: 'default', role: 'status', text: t('users.created', { email: created.email }) });
      setEmail('');
      setRole('staff');
      setPassword('');
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapErrorToKey(err)) });
    } finally {
      setCreating(false);
    }
  }

  function openReset(id: number): void {
    setResettingId(id);
    setResetPassword('');
  }

  function cancelReset(id: number): void {
    setResettingId(null);
    setResetPassword('');
    triggerRefs.current.get(id)?.focus();
  }

  async function confirmReset(e: FormEvent, id: number): Promise<void> {
    e.preventDefault();
    setResetting(true);
    try {
      await api.post<UserView>(`/users/${id}/reset-password`, { newPassword: resetPassword });
      setResettingId(null);
      setResetPassword('');
      setFeedback({ variant: 'default', role: 'status', text: t('users.resetDone') });
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapErrorToKey(err)) });
    } finally {
      setResetting(false);
    }
  }

  function openEdit(u: UserView): void {
    setEditingId(u.id);
    setEditEmail(u.email);
    setEditRole(u.role);
  }

  function cancelEdit(id: number): void {
    setEditingId(null);
    triggerRefs.current.get(id)?.focus();
  }

  async function confirmEdit(e: FormEvent, id: number): Promise<void> {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await api.patch<UserView>(`/users/${id}`, { email: editEmail, role: editRole });
      setEditingId(null);
      setFeedback({ variant: 'default', role: 'status', text: t('users.editSaved') });
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapEditErrorToKey(err)) });
    } finally {
      setSavingEdit(false);
    }
  }

  function openDelete(id: number): void {
    setDeletingId(id);
  }

  function cancelDelete(id: number): void {
    setDeletingId(null);
    triggerRefs.current.get(id)?.focus();
  }

  async function confirmDelete(id: number): Promise<void> {
    setDeleting(true);
    try {
      await api.delete(`/users/${id}`);
      setDeletingId(null);
      setFeedback({ variant: 'default', role: 'status', text: t('users.deleted') });
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapDeleteErrorToKey(err)) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('users.title')}</h1>
      {feedback && (
        <Alert variant={feedback.variant} role={feedback.role}>
          {feedback.text}
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-h3">{t('users.create')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-4">
            <Label className="block space-y-1">
              <span>{t('users.email')}</span>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Label>
            <Label className="block space-y-1">
              <span>{t('users.role')}</span>
              <SelectNative required value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}>
                <option value="admin">{t('users.roleAdmin')}</option>
                <option value="staff">{t('users.roleStaff')}</option>
              </SelectNative>
            </Label>
            <Label className="block space-y-1">
              <span>{t('users.password')}</span>
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Label>
            <Button type="submit" disabled={creating}>
              {t('users.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('users.email')}</TableHead>
                <TableHead scope="col">{t('users.role')}</TableHead>
                <TableHead scope="col">{t('users.mustChangePassword')}</TableHead>
                <TableHead scope="col">{t('users.createdAt')}</TableHead>
                <TableHead scope="col" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>{t('users.empty')}</TableCell>
                </TableRow>
              )}
              {data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role === 'admin' ? t('users.roleAdmin') : t('users.roleStaff')}</TableCell>
                  <TableCell>{u.mustChangePassword ? t('common.yes') : t('common.no')}</TableCell>
                  <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {u.email === user?.email ? (
                      <span className="text-body text-muted-foreground">{t('nav.changePassword')}</span>
                    ) : resettingId === u.id ? (
                      <form onSubmit={(e) => confirmReset(e, u.id)} className="flex items-center gap-2">
                        <Input
                          ref={resetInputRef}
                          type="password"
                          required
                          minLength={8}
                          autoComplete="new-password"
                          aria-label={t('users.newPassword')}
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          className="h-8 w-40"
                        />
                        <Button type="submit" size="sm" disabled={resetting}>
                          {t('users.resetConfirm')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => cancelReset(u.id)}>
                          {t('users.resetCancel')}
                        </Button>
                      </form>
                    ) : editingId === u.id ? (
                      <form onSubmit={(e) => confirmEdit(e, u.id)} className="flex items-center gap-2">
                        <Input
                          type="email"
                          required
                          aria-label={t('users.email')}
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="h-8 w-40"
                        />
                        <SelectNative
                          aria-label={t('users.role')}
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as 'admin' | 'staff')}
                          className="h-8"
                        >
                          <option value="admin">{t('users.roleAdmin')}</option>
                          <option value="staff">{t('users.roleStaff')}</option>
                        </SelectNative>
                        <Button type="submit" size="sm" disabled={savingEdit}>
                          {t('users.editSave')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => cancelEdit(u.id)}>
                          {t('users.editCancel')}
                        </Button>
                      </form>
                    ) : deletingId === u.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-body">{t('users.deleteConfirm')}</span>
                        <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={() => confirmDelete(u.id)}>
                          {t('users.deleteYes')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => cancelDelete(u.id)}>
                          {t('users.deleteNo')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          ref={(el) => {
                            if (el) triggerRefs.current.set(u.id, el);
                          }}
                          onClick={() => openReset(u.id)}
                        >
                          {t('users.reset')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                          {t('users.editButton')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openDelete(u.id)}>
                          {t('users.deleteButton')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
