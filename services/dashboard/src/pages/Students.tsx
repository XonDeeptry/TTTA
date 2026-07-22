import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

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
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('students.title')}</h1>
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
                <TableHead scope="col">{t('students.className')}</TableHead>
                <TableHead scope="col">{t('students.status')}</TableHead>
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
                        <Input
                          defaultValue={s.className ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, className: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input defaultValue={s.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} />
                      </TableCell>
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
                      <TableCell>{s.className}</TableCell>
                      <TableCell>{s.status}</TableCell>
                      <TableCell>
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
