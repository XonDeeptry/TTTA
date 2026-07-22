import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { cn } from '../lib/utils';

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

const STATUS_BADGE_VARIANT: Record<string, 'secondary' | 'default' | 'success' | 'warning' | 'destructive'> = {
  received: 'secondary',
  processing: 'default',
  graded: 'success',
  awaiting_review: 'warning',
  sent: 'success',
  failed: 'destructive',
};

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
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('submissions.title')}</h1>
      <Label className="flex max-w-sm items-center gap-3">
        <span>{t('submissions.filterStatus')}</span>
        <SelectNative
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
        </SelectNative>
      </Label>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('submissions.student')}</TableHead>
                <TableHead scope="col">{t('submissions.kind')}</TableHead>
                <TableHead scope="col">{t('submissions.status')}</TableHead>
                <TableHead scope="col">{t('submissions.receivedAt')}</TableHead>
                <TableHead scope="col" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.student?.fullName ?? '—'} {s.student?.className ? `(${s.student.className})` : ''}
                  </TableCell>
                  <TableCell>{s.kind}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[s.status] ?? 'secondary'}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{new Date(s.receivedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Link to={`/submissions/${s.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                      {t('submissions.view')}
                    </Link>
                  </TableCell>
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
