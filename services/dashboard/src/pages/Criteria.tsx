import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface CriteriaItem {
  id: number;
  courseId: number;
  title: string;
  version: number;
  rubric: unknown;
  createdAt: string;
}

interface ClassConfig {
  className: string;
  advisorZaloId: string;
  autoSend: boolean;
}

interface CourseOption {
  id: number;
  key: string;
}

export function Criteria() {
  const { t } = useTranslation();
  const [courseId, setCourseId] = useState('');
  const [items, setItems] = useState<CriteriaItem[]>([]);
  const [preview, setPreview] = useState<unknown>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassConfig[]>([]);
  const [classDrafts, setClassDrafts] = useState<Record<string, Partial<ClassConfig>>>({});
  const [courses, setCourses] = useState<CourseOption[]>([]);

  function loadCriteria(): void {
    if (!courseId) return;
    void api.get<CriteriaItem[]>(`/criteria?courseId=${courseId}`).then(setItems);
  }

  function loadClasses(): void {
    void api.get<ClassConfig[]>('/classes-config').then(setClasses);
  }

  useEffect(loadClasses, []);
  useEffect(() => {
    void api.get<CourseOption[]>('/courses').then(setCourses);
  }, []);

  async function upload(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setUploadError(null);
    // Raw multipart fetch — deliberately NOT routed through api/client.ts so the
    // browser sets the multipart boundary itself (F3-ba §1.9 highest-risk item).
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/criteria', { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUploadError(body.message ?? `Upload failed: ${res.status}`);
      return;
    }
    loadCriteria();
  }

  async function saveClassConfig(className: string): Promise<void> {
    const draft = classDrafts[className] ?? {};
    const existing = classes.find((c) => c.className === className);
    await api.put(`/classes-config/${className}`, {
      advisorZaloId: draft.advisorZaloId ?? existing?.advisorZaloId ?? '',
      autoSend: draft.autoSend ?? existing?.autoSend ?? false,
    });
    loadClasses();
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('criteria.title')}</h1>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t('criteria.upload')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Native <form>; fields named exactly "courseId"/"file" so new FormData(e.currentTarget)
              reads what core-api expects — do not wrap these in a controlled/library field.
              A plain <select name="courseId"> is still captured by FormData like any input. */}
          <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
            <SelectNative name="courseId" required aria-label={t('criteria.courseId')} className="max-w-[12rem]">
              <option value="">{t('criteria.selectCourse')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.key}
                </option>
              ))}
            </SelectNative>
            <input
              name="file"
              type="file"
              accept=".docx"
              required
              className="text-body file:mr-2 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1 file:text-body"
            />
            <Button type="submit">{t('criteria.uploadButton')}</Button>
          </form>
          {uploadError && (
            <Alert variant="destructive" role="alert">
              {uploadError}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle id="criteria-course-id-heading">{t('criteria.courseId')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SelectNative
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              aria-labelledby="criteria-course-id-heading"
              className="max-w-[12rem]"
            >
              <option value="">{t('criteria.selectCourse')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.key}
                </option>
              ))}
            </SelectNative>
            <Button variant="outline" onClick={loadCriteria}>
              {t('criteria.load')}
            </Button>
          </div>
          <ul className="space-y-1">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span>
                  {t('criteria.version')} {c.version} — {c.title}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setPreview(c.rubric)}>
                  {t('criteria.preview')}
                </Button>
              </li>
            ))}
          </ul>
          {preview !== null && (
            <pre
              role="region"
              aria-label={t('criteria.previewRegion')}
              className="overflow-x-auto rounded-md bg-muted p-4 text-caption"
            >
              {JSON.stringify(preview, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-h2">{t('criteria.classesConfig')}</h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('criteria.className')}</TableHead>
                  <TableHead scope="col">{t('criteria.advisorZaloId')}</TableHead>
                  <TableHead scope="col">{t('criteria.autoSend')}</TableHead>
                  <TableHead scope="col" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow key={c.className}>
                    <TableCell>{c.className}</TableCell>
                    <TableCell>
                      <Input
                        defaultValue={c.advisorZaloId}
                        onChange={(e) =>
                          setClassDrafts((d) => ({ ...d, [c.className]: { ...d[c.className], advisorZaloId: e.target.value } }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        defaultChecked={c.autoSend}
                        onChange={(e) =>
                          setClassDrafts((d) => ({ ...d, [c.className]: { ...d[c.className], autoSend: e.target.checked } }))
                        }
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => saveClassConfig(c.className)}>
                        {t('criteria.save')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
