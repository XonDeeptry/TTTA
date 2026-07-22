import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { cn } from '../lib/utils';

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

interface PilotComparisonRow {
  submissionId: number;
  className: string;
  studentCode: string;
  studentName: string;
  [key: string]: string | number;
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
  const [pilotRows, setPilotRows] = useState<PilotComparisonRow[]>([]);

  function load(): void {
    const qs = `?from=${from}&to=${to}`;
    void api.get<SubmissionRateRow[]>(`/reports/submission-rate${qs}`).then(setRateRows);
    void api.get<CostRow[]>(`/reports/cost${qs}`).then(setCostRows);
    void api.get<PilotComparisonRow[]>(`/reports/pilot-comparison${qs}`).then(setPilotRows);
  }

  useEffect(load, [from, to]);

  function exportUrl(kind: 'submission-rate' | 'cost' | 'pilot-comparison', format: 'csv' | 'xlsx'): string {
    return `/api/reports/${kind}/export?format=${format}&from=${from}&to=${to}`;
  }

  const exportLinkClass = cn(buttonVariants({ variant: 'link', size: 'sm' }), 'px-0');

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('reports.title')}</h1>

      <div role="group" aria-label={t('reports.dateRange')} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-body">
          {t('reports.from')}: <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-body shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" />
        </label>
        <label className="flex items-center gap-2 text-body">
          {t('reports.to')}: <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-body shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" />
        </label>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('reports.submissionRate')}</CardTitle>
          <div className="flex items-center gap-2">
            <a href={exportUrl('submission-rate', 'csv')} className={exportLinkClass}>
              {t('reports.exportCsv')}
            </a>
            <span className="text-muted-foreground">|</span>
            <a href={exportUrl('submission-rate', 'xlsx')} className={exportLinkClass}>
              {t('reports.exportXlsx')}
            </a>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('reports.class')}</TableHead>
                <TableHead scope="col">{t('reports.total')}</TableHead>
                <TableHead scope="col">{t('reports.submitted')}</TableHead>
                <TableHead scope="col">{t('reports.rate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rateRows.map((r) => (
                <TableRow key={r.className}>
                  <TableCell>{r.className}</TableCell>
                  <TableCell className="tabular-nums">{r.totalStudents}</TableCell>
                  <TableCell className="tabular-nums">{r.submittedStudents}</TableCell>
                  <TableCell className="tabular-nums">{r.ratePercent}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('reports.cost')}</CardTitle>
          <div className="flex items-center gap-2">
            <a href={exportUrl('cost', 'csv')} className={exportLinkClass}>
              {t('reports.exportCsv')}
            </a>
            <span className="text-muted-foreground">|</span>
            <a href={exportUrl('cost', 'xlsx')} className={exportLinkClass}>
              {t('reports.exportXlsx')}
            </a>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('reports.date')}</TableHead>
                <TableHead scope="col">{t('reports.provider')}</TableHead>
                <TableHead scope="col">{t('reports.totalUsd')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costRows.map((r) => (
                <TableRow key={`${r.date}-${r.provider}`}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.provider}</TableCell>
                  <TableCell className="tabular-nums">${r.totalUsd.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('reports.pilotComparison')}</CardTitle>
          <div className="flex items-center gap-2">
            <a href={exportUrl('pilot-comparison', 'csv')} className={exportLinkClass}>
              {t('reports.exportCsv')}
            </a>
            <span className="text-muted-foreground">|</span>
            <a href={exportUrl('pilot-comparison', 'xlsx')} className={exportLinkClass}>
              {t('reports.exportXlsx')}
            </a>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('reports.class')}</TableHead>
                <TableHead scope="col">{t('reports.student')}</TableHead>
                <TableHead scope="col">{t('reports.dimension')}</TableHead>
                <TableHead scope="col">{t('reports.scoreAudio')}</TableHead>
                <TableHead scope="col">{t('reports.scoreText')}</TableHead>
                <TableHead scope="col">{t('reports.scoreDelta')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pilotRows.flatMap((r) => {
                const dimensions = Object.keys(r)
                  .filter((k) => k.startsWith('audio_'))
                  .map((k) => k.slice('audio_'.length));
                return dimensions.map((dim) => (
                  <TableRow key={`${r.submissionId}-${dim}`}>
                    <TableCell>{r.className}</TableCell>
                    <TableCell>{r.studentName}</TableCell>
                    <TableCell>{dim}</TableCell>
                    <TableCell className="tabular-nums">{r[`audio_${dim}`]}</TableCell>
                    <TableCell className="tabular-nums">{r[`text_${dim}`]}</TableCell>
                    <TableCell className="tabular-nums">{r[`delta_${dim}`]}</TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
