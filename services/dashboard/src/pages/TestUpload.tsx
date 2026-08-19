import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SelectNative } from '../components/ui/select-native';

interface StudentOption {
  id: number;
  code: string;
  fullName: string;
  className: string | null;
  courseId: number | null;
}

interface StudentPage {
  items: StudentOption[];
}

interface UploadResult {
  messageId: string;
  zaloUserId: string;
  studentId: number;
  kind: 'audio' | 'video';
}

export function TestUpload() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function searchStudents(): Promise<void> {
    const page = await api.get<StudentPage>(`/students?search=${encodeURIComponent(search)}`);
    setStudents(page.items);
  }

  async function upload(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!studentId) {
      setError(t('testUpload.selectStudent'));
      return;
    }
    setSubmitting(true);
    try {
      // Raw multipart fetch — same reasoning as Criteria.tsx: let the browser set its own
      // multipart boundary instead of routing through api/client.ts's JSON-only wrapper.
      const form = new FormData(e.currentTarget);
      form.set('studentId', studentId);
      const res = await fetch('/api/test-upload/submissions', { method: 'POST', credentials: 'include', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Upload failed: ${res.status}`);
        return;
      }
      setResult((await res.json()) as UploadResult);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('testUpload.title')}</h1>
      <p className="max-w-2xl text-body text-muted-foreground">{t('testUpload.description')}</p>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t('testUpload.pickStudent')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('students.search')}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" onClick={searchStudents}>
              {t('criteria.load')}
            </Button>
          </div>
          <Label className="block space-y-1">
            <span>{t('testUpload.student')}</span>
            <SelectNative value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">{t('testUpload.selectStudent')}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.courseId}>
                  {s.code} — {s.fullName}
                  {s.className ? ` (${s.className})` : ''}
                  {!s.courseId ? ` — ${t('testUpload.noCourse')}` : ''}
                </option>
              ))}
            </SelectNative>
          </Label>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t('testUpload.upload')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
            <input
              name="file"
              type="file"
              accept="audio/*,video/*"
              required
              className="text-body file:mr-2 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1 file:text-body"
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? t('testUpload.uploading') : t('testUpload.uploadButton')}
            </Button>
          </form>
          {error && (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          )}
          {result && (
            <Alert variant="default" role="status">
              {t('testUpload.success', { kind: result.kind })}{' '}
              <Link to="/submissions" className="underline">
                {t('testUpload.viewSubmissions')}
              </Link>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
