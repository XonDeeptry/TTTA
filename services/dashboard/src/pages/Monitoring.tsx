import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface QueueDepth {
  queue: string;
  mainDepth: number;
  dlqDepth: number;
}

interface TokenStatus {
  hasAccessToken: boolean;
  expiresAt: string | null;
  alert: string | null;
}

interface SheetSyncLog {
  id: number;
  runAt: string;
  rowsOk: number;
  rowsError: number;
}

interface DiskStatus {
  alert: string | null;
}

/** `GET /monitoring/zalo-api` — lượt hệ thống gọi ra Zalo Open API, theo phút (giờ Việt Nam). */
interface ZaloApiUsage {
  generatedAt: string;
  plans: number[];
  today: {
    date: string;
    total: number;
    byEndpoint: Record<string, number>;
    errors: Record<string, number>;
    peakPerMinute: number;
    peakAt: string | null;
  };
  hours: { start: string; total: number; peakPerMinute: number }[];
  days: { date: string; total: number; peakPerMinute: number; peakAt: string | null }[];
  weekPeak: { perMinute: number; at: string | null };
}

const VN_TZ = 'Asia/Ho_Chi_Minh';
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', { timeZone: VN_TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
const fmtHour = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit' });

export function Monitoring() {
  const { t } = useTranslation();
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [token, setToken] = useState<TokenStatus | null>(null);
  const [sheetsLog, setSheetsLog] = useState<SheetSyncLog[]>([]);
  const [disk, setDisk] = useState<DiskStatus | null>(null);
  const [zaloApi, setZaloApi] = useState<ZaloApiUsage | null>(null);
  const [retried, setRetried] = useState<string | null>(null);

  function load(): void {
    void api.get<QueueDepth[]>('/monitoring/queues').then(setQueues);
    void api.get<TokenStatus>('/monitoring/token').then(setToken);
    void api.get<SheetSyncLog[]>('/sheets-sync/log').then(setSheetsLog);
    void api.get<DiskStatus>('/monitoring/disk').then(setDisk);
    void api.get<ZaloApiUsage>('/monitoring/zalo-api').then(setZaloApi);
  }

  useEffect(load, []);

  async function retry(queue: string): Promise<void> {
    await api.post(`/dlq/${queue}/retry`);
    setRetried(queue);
    load();
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('monitoring.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('monitoring.zaloApi')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-body text-foreground/80">{t('monitoring.zaloApiHint')}</p>
          {zaloApi && <ZaloApiPanel usage={zaloApi} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('monitoring.queues')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('monitoring.queue')}</TableHead>
                <TableHead scope="col">{t('monitoring.mainDepth')}</TableHead>
                <TableHead scope="col">{t('monitoring.dlqDepth')}</TableHead>
                <TableHead scope="col" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {queues.map((q) => (
                <TableRow key={q.queue}>
                  <TableCell>{q.queue}</TableCell>
                  <TableCell className="tabular-nums">{q.mainDepth}</TableCell>
                  <TableCell>
                    <Badge variant={q.dlqDepth > 0 ? 'destructive' : 'secondary'} className="tabular-nums">
                      {q.dlqDepth}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => retry(q.queue)} disabled={q.dlqDepth === 0}>
                        {t('monitoring.retry')}
                      </Button>
                      {retried === q.queue && <Badge variant="success">{t('monitoring.retried')}</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('monitoring.token')}</CardTitle>
        </CardHeader>
        <CardContent>
          {token &&
            (token.alert ? (
              <Alert variant="destructive">
                {token.hasAccessToken ? t('monitoring.tokenOk') : t('monitoring.tokenMissing')}
                {' — '}
                <strong>
                  {t('monitoring.alert')}: {token.alert}
                </strong>
              </Alert>
            ) : (
              <p className="text-body">{token.hasAccessToken ? t('monitoring.tokenOk') : t('monitoring.tokenMissing')}</p>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('monitoring.sheetsSync')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {sheetsLog.map((log) => (
              <li key={log.id} className="text-body">
                {new Date(log.runAt).toLocaleString()} —{' '}
                <Badge variant="secondary" className="tabular-nums">
                  {log.rowsOk}
                </Badge>{' '}
                {t('monitoring.sheetsSyncOk')},{' '}
                <Badge variant={log.rowsError > 0 ? 'warning' : 'secondary'} className="tabular-nums">
                  {log.rowsError}
                </Badge>{' '}
                {t('monitoring.sheetsSyncError')}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('monitoring.disk')}</CardTitle>
        </CardHeader>
        <CardContent>
          {disk &&
            (disk.alert === null ? (
              <p className="text-body">{t('monitoring.diskOk')}</p>
            ) : (
              <Alert variant="warning">
                <strong>{formatDiskAlert(disk.alert, t)}</strong>
              </Alert>
            ))}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Thẻ lượt gọi Zalo API (pilot 09-15): con số dùng để chọn gói OA là ĐỈNH THEO PHÚT, không phải
 * tổng ngày — 600 lượt rải đều cả ngày vẫn an toàn, 120 lượt dồn vào một phút thì vượt gói 100.
 */
function ZaloApiPanel({ usage }: { usage: ZaloApiUsage }) {
  const { t } = useTranslation();
  const maxHourPeak = Math.max(1, ...usage.hours.map((h) => h.peakPerMinute));
  const endpoints = Object.entries(usage.today.byEndpoint).sort((a, b) => b[1] - a[1]);
  const errors = Object.entries(usage.today.errors);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('monitoring.zaloApiToday')} value={String(usage.today.total)} />
        <Stat
          label={t('monitoring.zaloApiPeakToday')}
          value={`${usage.today.peakPerMinute} / ${t('monitoring.zaloApiPerMinute')}`}
          sub={usage.today.peakAt ? `${t('monitoring.zaloApiAt')} ${fmtTime(usage.today.peakAt)}` : undefined}
        />
        <Stat
          label={t('monitoring.zaloApiPeakWeek')}
          value={`${usage.weekPeak.perMinute} / ${t('monitoring.zaloApiPerMinute')}`}
          sub={usage.weekPeak.at ? fmtDateTime(usage.weekPeak.at) : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-body font-medium">{t('monitoring.zaloApiPlans')}</p>
        <div className="flex flex-wrap gap-2">
          {usage.plans.map((limit) => {
            const pct = Math.round((usage.weekPeak.perMinute / limit) * 100);
            const variant = pct >= 80 ? 'destructive' : pct >= 50 ? 'warning' : 'success';
            return (
              <Badge key={limit} variant={variant} className="font-normal">
                {limit.toLocaleString('vi-VN')} req/{t('monitoring.zaloApiPerMinute')}: {pct}%
              </Badge>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-body font-medium">{t('monitoring.zaloApiHours')}</p>
        <div className="flex h-28 items-end gap-0.5 rounded-md border border-border p-2" role="img" aria-label={t('monitoring.zaloApiHours')}>
          {usage.hours.map((h) => (
            <div
              key={h.start}
              className="flex-1 rounded-sm bg-primary/70"
              style={{ height: `${Math.max(2, (h.peakPerMinute / maxHourPeak) * 100)}%` }}
              title={`${fmtHour(h.start)} — ${t('monitoring.zaloApiPeak')} ${h.peakPerMinute}/${t('monitoring.zaloApiPerMinute')}, ${t('monitoring.zaloApiTotal')} ${h.total}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-caption text-muted-foreground">
          <span>{usage.hours[0] ? fmtHour(usage.hours[0].start) : ''}</span>
          <span>{usage.hours.length ? fmtHour(usage.hours[usage.hours.length - 1].start) : ''}</span>
        </div>
      </div>

      {(endpoints.length > 0 || errors.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {endpoints.map(([ep, n]) => (
            <Badge key={ep} variant="outline" className="font-normal">
              {t(`monitoring.zaloApiEp.${ep}`, { defaultValue: ep })}: {n}
            </Badge>
          ))}
          {errors.map(([code, n]) => (
            <Badge key={code} variant="destructive" className="font-normal">
              {t('monitoring.zaloApiError')} {code}: {n}
            </Badge>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('monitoring.zaloApiDate')}</TableHead>
              <TableHead scope="col">{t('monitoring.zaloApiTotal')}</TableHead>
              <TableHead scope="col">{t('monitoring.zaloApiPeak')}</TableHead>
              <TableHead scope="col">{t('monitoring.zaloApiAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.days.map((d) => (
              <TableRow key={d.date}>
                <TableCell>{d.date}</TableCell>
                <TableCell className="tabular-nums">{d.total}</TableCell>
                <TableCell className="tabular-nums">{d.peakPerMinute}</TableCell>
                <TableCell>{fmtTime(d.peakAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-h2 tabular-nums">{value}</p>
      {sub && <p className="text-caption text-muted-foreground">{sub}</p>}
    </div>
  );
}

function formatDiskAlert(alert: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  try {
    const parsed = JSON.parse(alert) as { pct: number; at: string };
    return t('monitoring.diskAlert', { pct: parsed.pct, at: new Date(parsed.at).toLocaleString() });
  } catch {
    return alert;
  }
}
