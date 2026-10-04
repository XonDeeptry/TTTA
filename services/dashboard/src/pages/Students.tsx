import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface Student {
  id: number;
  code: string;
  fullName: string;
  phone: string;
  courseId: number | null;
  className: string | null;
  campus: string | null;
  status: string;
  /** Tài khoản Zalo đang gắn (binding active). Nhiều hơn 1 thường là dấu hiệu ghép nhầm. */
  zaloBindings?: ZaloLink[];
}

interface ZaloLink {
  id: number;
  zaloUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

interface CourseOption {
  id: number;
  key: string;
}

interface StudentPage {
  items: Student[];
  page: number;
  pageSize: number;
  total: number;
}

interface Feedback {
  variant: 'default' | 'destructive';
  role: 'status' | 'alert';
  text: string;
}

function mapCreateErrorToKey(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return 'students.codeExists';
  if (err instanceof ApiError && err.status === 400) return 'students.courseNotFound';
  return 'students.createError';
}

function mapDeleteErrorToKey(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return 'students.deleteInUse';
  return 'students.createError';
}

export function Students() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudentPage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Student>>({});
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [courseId, setCourseId] = useState('');
  const [className, setClassName] = useState('');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function load(): void {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    void api.get<StudentPage>(`/students?${params}`).then(setData);
  }

  useEffect(load, [page, search]);
  useEffect(() => {
    void api.get<CourseOption[]>('/courses').then(setCourses);
  }, []);

  async function save(id: number): Promise<void> {
    try {
      await api.patch(`/students/${id}`, draft);
      setEditingId(null);
      setDraft({});
      setFeedback(null);
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapCreateErrorToKey(err)) });
    }
  }

  async function confirmDelete(id: number): Promise<void> {
    setDeleting(true);
    try {
      await api.delete(`/students/${id}`);
      setDeletingId(null);
      setFeedback(null);
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapDeleteErrorToKey(err)) });
    } finally {
      setDeleting(false);
    }
  }

  /** Gỡ liên kết ghép nhầm. Tài khoản Zalo quay về "Chờ kích hoạt" để ghép lại đúng người. */
  async function confirmUnlink(link: ZaloLink): Promise<void> {
    setUnlinking(true);
    try {
      await api.delete(`/onboarding/bindings/${link.id}`);
      setUnlinkingId(null);
      setFeedback({
        variant: 'default',
        role: 'status',
        text: t('students.zaloUnlinked', { name: link.displayName ?? link.zaloUserId }),
      });
      load();
    } catch {
      setFeedback({ variant: 'destructive', role: 'alert', text: t('students.zaloUnlinkError') });
    } finally {
      setUnlinking(false);
    }
  }

  function zaloCell(s: Student, canUnlink: boolean) {
    const links = s.zaloBindings ?? [];
    if (links.length === 0) return <span className="text-muted-foreground">{t('students.zaloNone')}</span>;
    return (
      <ul className="space-y-1.5">
        {links.map((link) => (
          <li key={link.id} className="flex flex-wrap items-center gap-2">
            {link.avatarUrl ? (
              <img src={link.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full" />
            ) : (
              <span aria-hidden className="h-7 w-7 shrink-0 rounded-full bg-muted" />
            )}
            <span className="min-w-0">
              <span className="block text-body">{link.displayName ?? t('students.zaloNoName')}</span>
              <span className="block text-caption text-muted-foreground">{link.zaloUserId}</span>
            </span>
            {canUnlink &&
              (unlinkingId === link.id ? (
                <span className="flex items-center gap-1">
                  <span className="text-caption">{t('students.zaloUnlinkConfirm')}</span>
                  <Button size="sm" variant="destructive" disabled={unlinking} onClick={() => confirmUnlink(link)}>
                    {t('students.zaloUnlinkYes')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setUnlinkingId(null)}>
                    {t('students.deleteNo')}
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('students.zaloUnlinkLabel', { name: link.displayName ?? link.zaloUserId, student: s.fullName })}
                  onClick={() => setUnlinkingId(link.id)}
                >
                  {t('students.zaloUnlink')}
                </Button>
              ))}
          </li>
        ))}
      </ul>
    );
  }

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.post<Student>('/students', {
        code,
        fullName,
        phone,
        courseId: courseId ? Number(courseId) : undefined,
        className: className || undefined,
      });
      setFeedback({ variant: 'default', role: 'status', text: t('students.created', { code: created.code }) });
      setCode('');
      setFullName('');
      setPhone('');
      setCourseId('');
      setClassName('');
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapCreateErrorToKey(err)) });
    } finally {
      setCreating(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('students.title')}</h1>

      {feedback && (
        <Alert variant={feedback.variant} role={feedback.role}>
          {feedback.text}
        </Alert>
      )}

      {user?.role === 'admin' && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t('students.create')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
              <Label className="block space-y-1">
                <span>{t('students.code')}</span>
                <Input required value={code} onChange={(e) => setCode(e.target.value)} className="w-32" />
              </Label>
              <Label className="block space-y-1">
                <span>{t('students.fullName')}</span>
                <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-44" />
              </Label>
              <Label className="block space-y-1">
                <span>{t('students.phone')}</span>
                <Input required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-36" />
              </Label>
              <Label className="block space-y-1">
                <span>{t('students.courseId')}</span>
                <SelectNative value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-40">
                  <option value="">{t('students.noCourseYet')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.key}
                    </option>
                  ))}
                </SelectNative>
              </Label>
              <Label className="block space-y-1">
                <span>{t('students.className')}</span>
                <Input value={className} onChange={(e) => setClassName(e.target.value)} className="w-32" />
              </Label>
              <Button type="submit" disabled={creating}>
                {t('students.createButton')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Label htmlFor="students-search" className="sr-only">
        {t('students.search')}
      </Label>
      <Input
        id="students-search"
        type="search"
        placeholder={t('students.search')}
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
        className="max-w-sm"
      />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('students.code')}</TableHead>
                <TableHead scope="col">{t('students.fullName')}</TableHead>
                <TableHead scope="col">{t('students.phone')}</TableHead>
                <TableHead scope="col">{t('students.courseId')}</TableHead>
                <TableHead scope="col">{t('students.className')}</TableHead>
                <TableHead scope="col">{t('students.status')}</TableHead>
                <TableHead scope="col">{t('students.zalo')}</TableHead>
                <TableHead scope="col" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((s) => (
                <TableRow key={s.id}>
                  {editingId === s.id ? (
                    <>
                      <TableCell>{s.code}</TableCell>
                      <TableCell>
                        <Input
                          defaultValue={s.fullName}
                          onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input defaultValue={s.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <SelectNative
                          defaultValue={s.courseId ?? ''}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, courseId: e.target.value ? Number(e.target.value) : undefined }))
                          }
                          className="w-32"
                        >
                          <option value="">{t('students.noCourseYet')}</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.key}
                            </option>
                          ))}
                        </SelectNative>
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={s.className ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, className: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input defaultValue={s.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} />
                      </TableCell>
                      <TableCell>{zaloCell(s, false)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => save(s.id)}>
                          {t('students.save')}
                        </Button>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{s.code}</TableCell>
                      <TableCell>{s.fullName}</TableCell>
                      <TableCell>{s.phone}</TableCell>
                      <TableCell>{courses.find((c) => c.id === s.courseId)?.key ?? '—'}</TableCell>
                      <TableCell>{s.className}</TableCell>
                      <TableCell>{s.status}</TableCell>
                      <TableCell>{zaloCell(s, true)}</TableCell>
                      <TableCell>
                        {deletingId === s.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-body">{t('students.deleteConfirm')}</span>
                            <Button size="sm" variant="destructive" disabled={deleting} onClick={() => confirmDelete(s.id)}>
                              {t('students.deleteYes')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDeletingId(null)}>
                              {t('students.deleteNo')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(s.id);
                                setDraft({});
                              }}
                            >
                              {t('students.edit')}
                            </Button>
                            {user?.role === 'admin' && (
                              <Button size="sm" variant="outline" onClick={() => setDeletingId(s.id)}>
                                {t('students.deleteButton')}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          aria-label={t('pagination.previous')}
        >
          ←
        </Button>
        <span className="text-body">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          aria-label={t('pagination.next')}
        >
          →
        </Button>
      </div>
    </main>
  );
}
