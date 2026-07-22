import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

interface Student {
  id: number;
  code: string;
  fullName: string;
  phone: string;
  className: string | null;
  campus: string | null;
  status: string;
}

interface StudentPage {
  items: Student[];
  page: number;
  pageSize: number;
  total: number;
}

export function Students() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudentPage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Student>>({});

  function load(): void {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    void api.get<StudentPage>(`/students?${params}`).then(setData);
  }

  useEffect(load, [page, search]);

  async function save(id: number): Promise<void> {
    await api.patch(`/students/${id}`, draft);
    setEditingId(null);
    setDraft({});
    load();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{t('students.title')}</h1>
      <input
        type="search"
        placeholder={t('students.search')}
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
        style={{ marginBottom: '1rem', width: '100%', maxWidth: 320 }}
      />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>{t('students.code')}</th>
            <th>{t('students.fullName')}</th>
            <th>{t('students.phone')}</th>
            <th>{t('students.className')}</th>
            <th>{t('students.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.items.map((s) => (
            <tr key={s.id}>
              {editingId === s.id ? (
                <>
                  <td>{s.code}</td>
                  <td>
                    <input defaultValue={s.fullName} onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))} />
                  </td>
                  <td>
                    <input defaultValue={s.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
                  </td>
                  <td>
                    <input
                      defaultValue={s.className ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, className: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input defaultValue={s.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} />
                  </td>
                  <td>
                    <button onClick={() => save(s.id)}>{t('students.save')}</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{s.code}</td>
                  <td>{s.fullName}</td>
                  <td>{s.phone}</td>
                  <td>{s.className}</td>
                  <td>{s.status}</td>
                  <td>
                    <button
                      onClick={() => {
                        setEditingId(s.id);
                        setDraft({});
                      }}
                    >
                      {t('students.edit')}
                    </button>
                  </td>
                </>
              )}
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
