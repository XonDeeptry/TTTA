import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface CourseView {
  id: number;
  key: string;
  bandDesc: string | null;
  llmConfig: { provider?: string };
  isActive: boolean;
}

interface Feedback {
  variant: 'default' | 'destructive';
  role: 'status' | 'alert';
  text: string;
}

function mapErrorToKey(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return 'courses.keyExists';
  return 'courses.createError';
}

function mapDeleteErrorToKey(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return 'courses.deleteInUse';
  return 'courses.createError';
}

export function Courses() {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [key, setKey] = useState('');
  const [bandDesc, setBandDesc] = useState('');
  const [provider, setProvider] = useState<'gemini' | 'openai'>('gemini');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ bandDesc: string; provider: 'gemini' | 'openai'; isActive: boolean }>({
    bandDesc: '',
    provider: 'gemini',
    isActive: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load(): void {
    void api.get<CourseView[]>('/courses').then(setCourses);
  }

  useEffect(load, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.post<CourseView>('/courses', { key, bandDesc: bandDesc || undefined, provider });
      setFeedback({ variant: 'default', role: 'status', text: t('courses.created', { key: created.key }) });
      setKey('');
      setBandDesc('');
      setProvider('gemini');
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapErrorToKey(err)) });
    } finally {
      setCreating(false);
    }
  }

  function openEdit(c: CourseView): void {
    setEditingId(c.id);
    setEditDraft({ bandDesc: c.bandDesc ?? '', provider: (c.llmConfig?.provider as 'gemini' | 'openai') ?? 'gemini', isActive: c.isActive });
  }

  async function confirmEdit(id: number): Promise<void> {
    setSavingEdit(true);
    try {
      await api.patch(`/courses/${id}`, {
        bandDesc: editDraft.bandDesc || undefined,
        provider: editDraft.provider,
        isActive: editDraft.isActive,
      });
      setEditingId(null);
      setFeedback(null);
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapErrorToKey(err)) });
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete(id: number): Promise<void> {
    setDeleting(true);
    try {
      await api.delete(`/courses/${id}`);
      setDeletingId(null);
      setFeedback(null);
      load();
    } catch (err) {
      setFeedback({ variant: 'destructive', role: 'alert', text: t(mapDeleteErrorToKey(err)) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('courses.title')}</h1>
      <p className="max-w-2xl text-body text-muted-foreground">{t('courses.description')}</p>

      {feedback && (
        <Alert variant={feedback.variant} role={feedback.role}>
          {feedback.text}
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('courses.create')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
            <Label className="block space-y-1">
              <span>{t('courses.key')}</span>
              <Input required value={key} onChange={(e) => setKey(e.target.value)} className="w-40" />
            </Label>
            <Label className="block space-y-1">
              <span>{t('courses.bandDesc')}</span>
              <Input value={bandDesc} onChange={(e) => setBandDesc(e.target.value)} className="w-56" />
            </Label>
            <Label className="block space-y-1">
              <span>{t('courses.provider')}</span>
              <SelectNative value={provider} onChange={(e) => setProvider(e.target.value as 'gemini' | 'openai')}>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
              </SelectNative>
            </Label>
            <Button type="submit" disabled={creating}>
              {t('courses.createButton')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">ID</TableHead>
                <TableHead scope="col">{t('courses.key')}</TableHead>
                <TableHead scope="col">{t('courses.bandDesc')}</TableHead>
                <TableHead scope="col">{t('courses.provider')}</TableHead>
                <TableHead scope="col">{t('courses.active')}</TableHead>
                <TableHead scope="col" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>{t('courses.empty')}</TableCell>
                </TableRow>
              )}
              {courses.map((c) =>
                editingId === c.id ? (
                  <TableRow key={c.id}>
                    <TableCell>{c.id}</TableCell>
                    <TableCell>{c.key}</TableCell>
                    <TableCell>
                      <Input
                        value={editDraft.bandDesc}
                        onChange={(e) => setEditDraft((d) => ({ ...d, bandDesc: e.target.value }))}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <SelectNative
                        value={editDraft.provider}
                        onChange={(e) => setEditDraft((d) => ({ ...d, provider: e.target.value as 'gemini' | 'openai' }))}
                        className="h-8"
                      >
                        <option value="gemini">Gemini</option>
                        <option value="openai">OpenAI</option>
                      </SelectNative>
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={editDraft.isActive}
                        onChange={(e) => setEditDraft((d) => ({ ...d, isActive: e.target.checked }))}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" disabled={savingEdit} onClick={() => confirmEdit(c.id)}>
                          {t('courses.editSave')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          {t('courses.editCancel')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={c.id}>
                    <TableCell>{c.id}</TableCell>
                    <TableCell>{c.key}</TableCell>
                    <TableCell>{c.bandDesc}</TableCell>
                    <TableCell>{c.llmConfig?.provider ?? 'gemini'}</TableCell>
                    <TableCell>{c.isActive ? t('common.yes') : t('common.no')}</TableCell>
                    <TableCell>
                      {deletingId === c.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-body">{t('courses.deleteConfirm')}</span>
                          <Button size="sm" variant="destructive" disabled={deleting} onClick={() => confirmDelete(c.id)}>
                            {t('courses.deleteYes')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeletingId(null)}>
                            {t('courses.deleteNo')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                            {t('courses.editButton')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeletingId(c.id)}>
                            {t('courses.deleteButton')}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
