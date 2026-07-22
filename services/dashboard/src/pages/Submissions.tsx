import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface SubmissionListItem {
  id: number;
  kind: string;
  status: string;
  receivedAt: string;
  student: { id: number; fullName: string; className: string | null } | null;
  grading: { id: number; autoSent: boolean; sentAt: string | null } | null;
}

interface SubmissionPage {
  items: SubmissionListItem[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUSES = ['received', 'processing', 'graded', 'awaiting_review', 'sent', 'failed'];

export function Submissions() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SubmissionPage | null>(null);

  function load(): void {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    void api.get<SubmissionPage>(`/submissions?${params}`).then(setData);
  }

  useEffect(load, [page, status]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{t('submissions.title')}</h1>
      <label>
        {t('submissions.filterStatus')}:{' '}
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">{t('submissions.all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>{t('submissions.student')}</th>
            <th>{t('submissions.kind')}</th>
            <th>{t('submissions.status')}</th>
            <th>{t('submissions.receivedAt')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.items.map((s) => (
            <tr key={s.id}>
              <td>
                {s.student?.fullName ?? '—'} {s.student?.className ? `(${s.student.className})` : ''}
              </td>
              <td>{s.kind}</td>
              <td>{s.status}</td>
              <td>{new Date(s.receivedAt).toLocaleString()}</td>
              <td>
                <Link to={`/submissions/${s.id}`}>{t('submissions.view')}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ←
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          →
        </button>
      </div>
    </main>
  );
}
