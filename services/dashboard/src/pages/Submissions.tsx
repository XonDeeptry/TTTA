import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { cn } from '../lib/utils';
import { useSubmissionEvents } from '../hooks/useSubmissionEvents';

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

const KINDS = ['audio', 'video', 'file', 'text', 'image', 'follow'];

/** Gõ tới đâu gọi API tới đó là không dùng được ở quy mô 400 học viên. */
const SEARCH_DEBOUNCE_MS = 350;

export function Submissions() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [className, setClassName] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  // `q` gõ tới đâu hiện tới đó, nhưng chỉ `debouncedQ` mới kích hoạt gọi API.
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SubmissionPage | null>(null);
  const [classOptions, setClassOptions] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  // Gợi ý lớp lấy từ classes_config. Dùng <datalist> chứ không phải <select>: lớp chưa được
  // cấu hình sẽ không có trong danh sách, mà khóa cứng người dùng vào một danh sách thiếu thì
  // họ không lọc được đúng lớp mình cần.
  useEffect(() => {
    void api
      .get<{ className: string }[]>('/classes-config')
      .then((rows) => setClassOptions(rows.map((r) => r.className)))
      .catch(() => setClassOptions([]));
  }, []);

  const filtersActive = Boolean(status || className || kind || from || to || q);

  function resetFilters(): void {
    setStatus('');
    setClassName('');
    setKind('');
    setFrom('');
    setTo('');
    setQ('');
    setPage(1);
  }

  function load(): void {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
    if (className.trim()) params.set('className', className.trim());
    if (kind) params.set('kind', kind);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    void api.get<SubmissionPage>(`/submissions?${params}`).then(setData);
  }

  useEffect(load, [page, status, debouncedQ, className, kind, from, to]);

  // Đổi bộ lọc mà đang đứng ở trang 5 thì kết quả mới có thể chỉ có 1 trang ⇒ màn hình rỗng
  // dù có dữ liệu. Luôn quay về trang 1 khi điều kiện lọc đổi.
  useEffect(() => setPage(1), [status, debouncedQ, className, kind, from, to]);

  useSubmissionEvents((evt) => {
    setData((prev) => {
      if (!prev) return prev;
      const idx = prev.items.findIndex((item) => item.id === evt.submissionId);
      if (idx === -1) {
        // Not currently loaded (new arrival, different page/filter) — reconcile via a normal refresh.
        load();
        return prev;
      }
      const items = prev.items.slice();
      items[idx] = { ...items[idx], status: evt.status };
      return { ...prev, items };
    });
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('submissions.title')}</h1>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Label className="flex min-w-[16rem] flex-1 flex-col items-start gap-1">
            <span>{t('submissions.filterSearch')}</span>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('submissions.filterSearchHint')}
              className="w-full"
            />
          </Label>

          <Label className="flex flex-col items-start gap-1">
            <span>{t('submissions.filterClass')}</span>
            <Input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              list="submission-class-options"
              className="w-40"
            />
            <datalist id="submission-class-options">
              {classOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Label>

          <Label className="flex flex-col items-start gap-1">
            <span>{t('submissions.filterStatus')}</span>
            <SelectNative value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              <option value="">{t('submissions.all')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectNative>
          </Label>

          <Label className="flex flex-col items-start gap-1">
            <span>{t('submissions.kind')}</span>
            <SelectNative value={kind} onChange={(e) => setKind(e.target.value)} className="w-32">
              <option value="">{t('submissions.all')}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </SelectNative>
          </Label>

          <Label className="flex flex-col items-start gap-1">
            <span>{t('submissions.filterFrom')}</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </Label>

          <Label className="flex flex-col items-start gap-1">
            <span>{t('submissions.filterTo')}</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </Label>

          <Button variant="outline" onClick={resetFilters} disabled={!filtersActive}>
            {t('submissions.filterReset')}
          </Button>
        </CardContent>
      </Card>

      {data ? (
        <p className="text-body text-muted-foreground">
          {t('submissions.resultCount', { count: data.total })}
        </p>
      ) : null}
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
