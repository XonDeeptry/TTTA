import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

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

export function Monitoring() {
  const { t } = useTranslation();
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [token, setToken] = useState<TokenStatus | null>(null);
  const [sheetsLog, setSheetsLog] = useState<SheetSyncLog[]>([]);
  const [retried, setRetried] = useState<string | null>(null);

  function load(): void {
    void api.get<QueueDepth[]>('/monitoring/queues').then(setQueues);
    void api.get<TokenStatus>('/monitoring/token').then(setToken);
    void api.get<SheetSyncLog[]>('/sheets-sync/log').then(setSheetsLog);
  }

  useEffect(load, []);

  async function retry(queue: string): Promise<void> {
    await api.post(`/dlq/${queue}/retry`);
    setRetried(queue);
    load();
  }

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{t('monitoring.title')}</h1>

      <h2>{t('monitoring.queues')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('monitoring.queue')}</th>
            <th>{t('monitoring.mainDepth')}</th>
            <th>{t('monitoring.dlqDepth')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {queues.map((q) => (
            <tr key={q.queue}>
              <td>{q.queue}</td>
              <td>{q.mainDepth}</td>
              <td>{q.dlqDepth}</td>
              <td>
                <button onClick={() => retry(q.queue)} disabled={q.dlqDepth === 0}>
                  {t('monitoring.retry')}
                </button>
                {retried === q.queue && <span> {t('monitoring.retried')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t('monitoring.token')}</h2>
      {token && (
        <p>
          {token.hasAccessToken ? t('monitoring.tokenOk') : t('monitoring.tokenMissing')}
          {token.alert && (
            <>
              {' — '}
              <strong>
                {t('monitoring.alert')}: {token.alert}
              </strong>
            </>
          )}
        </p>
      )}

      <h2>{t('monitoring.sheetsSync')}</h2>
      <ul>
        {sheetsLog.map((log) => (
          <li key={log.id}>
            {new Date(log.runAt).toLocaleString()} — {log.rowsOk} {t('monitoring.sheetsSyncOk')}, {log.rowsError}{' '}
            {t('monitoring.sheetsSyncError')}
          </li>
        ))}
      </ul>
    </main>
  );
}
