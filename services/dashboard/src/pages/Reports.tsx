import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

interface SubmissionRateRow {
  className: string;
  totalStudents: number;
  submittedStudents: number;
  ratePercent: number;
}

interface CostRow {
  date: string;
  provider: string;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function Reports() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [rateRows, setRateRows] = useState<SubmissionRateRow[]>([]);
  const [costRows, setCostRows] = useState<CostRow[]>([]);

  function load(): void {
    const qs = `?from=${from}&to=${to}`;
    void api.get<SubmissionRateRow[]>(`/reports/submission-rate${qs}`).then(setRateRows);
    void api.get<CostRow[]>(`/reports/cost${qs}`).then(setCostRows);
  }

  useEffect(load, [from, to]);

  function exportUrl(kind: 'submission-rate' | 'cost', format: 'csv' | 'xlsx'): string {
    return `/api/reports/${kind}/export?format=${format}&from=${from}&to=${to}`;
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{t('reports.title')}</h1>
      <label>
        {t('reports.from')}: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>{' '}
      <label>
        {t('reports.to')}: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>

      <h2>{t('reports.submissionRate')}</h2>
      <a href={exportUrl('submission-rate', 'csv')}>{t('reports.exportCsv')}</a>{' | '}
      <a href={exportUrl('submission-rate', 'xlsx')}>{t('reports.exportXlsx')}</a>
      <table style={{ width: '100%', marginTop: '0.5rem' }}>
        <thead>
          <tr>
            <th>{t('reports.class')}</th>
            <th>{t('reports.total')}</th>
            <th>{t('reports.submitted')}</th>
            <th>{t('reports.rate')}</th>
          </tr>
        </thead>
        <tbody>
          {rateRows.map((r) => (
            <tr key={r.className}>
              <td>{r.className}</td>
              <td>{r.totalStudents}</td>
              <td>{r.submittedStudents}</td>
              <td>{r.ratePercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t('reports.cost')}</h2>
      <a href={exportUrl('cost', 'csv')}>{t('reports.exportCsv')}</a>{' | '}
      <a href={exportUrl('cost', 'xlsx')}>{t('reports.exportXlsx')}</a>
      <table style={{ width: '100%', marginTop: '0.5rem' }}>
        <thead>
          <tr>
            <th>{t('reports.date')}</th>
            <th>{t('reports.provider')}</th>
            <th>{t('reports.totalUsd')}</th>
          </tr>
        </thead>
        <tbody>
          {costRows.map((r) => (
            <tr key={`${r.date}-${r.provider}`}>
              <td>{r.date}</td>
              <td>{r.provider}</td>
              <td>${r.totalUsd.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
