import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

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

export function Criteria() {
  const { t } = useTranslation();
  const [courseId, setCourseId] = useState('');
  const [items, setItems] = useState<CriteriaItem[]>([]);
  const [preview, setPreview] = useState<unknown>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassConfig[]>([]);
  const [classDrafts, setClassDrafts] = useState<Record<string, Partial<ClassConfig>>>({});

  function loadCriteria(): void {
    if (!courseId) return;
    void api.get<CriteriaItem[]>(`/criteria?courseId=${courseId}`).then(setItems);
  }

  function loadClasses(): void {
    void api.get<ClassConfig[]>('/classes-config').then(setClasses);
  }

  useEffect(loadClasses, []);

  async function upload(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setUploadError(null);
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
    <main style={{ maxWidth: 900, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{t('criteria.title')}</h1>

      <h2>{t('criteria.upload')}</h2>
      <form onSubmit={upload}>
        <input name="courseId" type="number" placeholder={t('criteria.courseId')} required />
        <input name="file" type="file" accept=".docx" required />
        <button type="submit">{t('criteria.uploadButton')}</button>
      </form>
      {uploadError && <p role="alert">{uploadError}</p>}

      <h2>{t('criteria.courseId')}</h2>
      <input value={courseId} onChange={(e) => setCourseId(e.target.value)} type="number" />
      <button onClick={loadCriteria}>{t('criteria.load')}</button>
      <ul>
        {items.map((c) => (
          <li key={c.id}>
            {t('criteria.version')} {c.version} — {c.title}{' '}
            <button onClick={() => setPreview(c.rubric)}>{t('criteria.preview')}</button>
          </li>
        ))}
      </ul>
      {preview !== null && <pre style={{ background: '#f5f5f5', padding: '1rem' }}>{JSON.stringify(preview, null, 2)}</pre>}

      <h2>{t('criteria.classesConfig')}</h2>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>{t('criteria.className')}</th>
            <th>{t('criteria.advisorZaloId')}</th>
            <th>{t('criteria.autoSend')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.className}>
              <td>{c.className}</td>
              <td>
                <input
                  defaultValue={c.advisorZaloId}
                  onChange={(e) =>
                    setClassDrafts((d) => ({ ...d, [c.className]: { ...d[c.className], advisorZaloId: e.target.value } }))
                  }
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  defaultChecked={c.autoSend}
                  onChange={(e) =>
                    setClassDrafts((d) => ({ ...d, [c.className]: { ...d[c.className], autoSend: e.target.checked } }))
                  }
                />
              </td>
              <td>
                <button onClick={() => saveClassConfig(c.className)}>{t('criteria.save')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
