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

export function Monitoring() {
  const { t } = useTranslation();
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [token, setToken] = useState<TokenStatus | null>(null);
  const [sheetsLog, setSheetsLog] = useState<SheetSyncLog[]>([]);
  const [disk, setDisk] = useState<DiskStatus | null>(null);
  const [retried, setRetried] = useState<string | null>(null);

  function load(): void {
    void api.get<QueueDepth[]>('/monitoring/queues').then(setQueues);
    void api.get<TokenStatus>('/monitoring/token').then(setToken);
    void api.get<SheetSyncLog[]>('/sheets-sync/log').then(setSheetsLog);
    void api.get<DiskStatus>('/monitoring/disk').then(setDisk);
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

function formatDiskAlert(alert: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  try {
    const parsed = JSON.parse(alert) as { pct: number; at: string };
    return t('monitoring.diskAlert', { pct: parsed.pct, at: new Date(parsed.at).toLocaleString() });
  } catch {
    return alert;
  }
}
