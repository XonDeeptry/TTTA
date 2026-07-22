import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { BarChart } from '../components/charts/BarChart';
import { LineChart } from '../components/charts/LineChart';
import { cn } from '../lib/utils';

interface KpisResponse {
  submissions: { count: number };
  submissionRate: { ratePercent: number };
  avgScore: { scorePct: number | null; gradedCount: number };
  avgPronunciation: { scorePct: number | null; gradedCount: number };
  pendingReview: { count: number };
  cost: { totalUsd: number };
}

interface TrendPoint {
  label: string;
  value: number | null;
}

interface TrendsResponse {
  bucket: 'day' | 'week';
  submissions: { label: string; value: number }[];
  score: TrendPoint[];
  cost: { label: string; value: number }[];
}

interface ClassPerformanceRow {
  className: string;
  totalStudents: number;
  submittedStudents: number;
  ratePercent: number;
  avgScorePct: number | null;
  gradedCount: number;
}

interface DimensionRow {
  dimension: string;
  avgScorePct: number;
  gradedCount: number;
}

interface PendingReviewResponse {
  count: number;
  oldestWaitingHours: number | null;
  oldestSubmissionId: number | null;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function Analytics() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [bucket, setBucket] = useState<'day' | 'week'>('day');

  const unitPercent = t('analytics.unitPercent');
  const unitUsd = t('analytics.unitUsd');
  const axisDate = t('analytics.axisDate');
  const axisCount = t('analytics.axisCount');
  const axisScorePct = t('analytics.axisScorePct');
  const axisCostUsd = t('analytics.axisCostUsd');

  function fmtPct(v: number): string {
    return `${v}${unitPercent}`;
  }

  function fmtUsd(v: number): string {
    return `${v.toFixed(4)} ${unitUsd}`;
  }

  function fmtCount(v: number): string {
    return String(v);
  }

  const [kpis, setKpis] = useState<KpisResponse | null>(null);
  const [kpisError, setKpisError] = useState(false);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [trendsError, setTrendsError] = useState(false);
  const [classRows, setClassRows] = useState<ClassPerformanceRow[] | null>(null);
  const [classError, setClassError] = useState(false);
  const [dimRows, setDimRows] = useState<DimensionRow[] | null>(null);
  const [dimError, setDimError] = useState(false);

  const [pending, setPending] = useState<PendingReviewResponse | null>(null);
  const [pendingError, setPendingError] = useState(false);

  useEffect(() => {
    setKpisError(false);
    void api.get<KpisResponse>(`/analytics/kpis?from=${from}&to=${to}`).then(setKpis, () => setKpisError(true));

    setTrendsError(false);
    void api
      .get<TrendsResponse>(`/analytics/trends?from=${from}&to=${to}&bucket=${bucket}`)
      .then(setTrends, () => setTrendsError(true));

    setClassError(false);
    void api
      .get<ClassPerformanceRow[]>(`/analytics/class-performance?from=${from}&to=${to}`)
      .then(setClassRows, () => setClassError(true));

    setDimError(false);
    void api
      .get<DimensionRow[]>(`/analytics/dimension-breakdown?from=${from}&to=${to}`)
      .then(setDimRows, () => setDimError(true));
  }, [from, to, bucket]);

  // Pending-review is a live snapshot — fetched once, independent of the date range (F7-ux §6).
  useEffect(() => {
    setPendingError(false);
    void api.get<PendingReviewResponse>('/analytics/pending-review').then(setPending, () => setPendingError(true));
  }, []);

  const staleThresholdHours = 48;
  const isStale = pending?.oldestWaitingHours !== null && pending?.oldestWaitingHours !== undefined && pending.oldestWaitingHours >= staleThresholdHours;

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('analytics.title')}</h1>

      <div role="group" aria-label={t('reports.dateRange')} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-body">
          {t('reports.from')}:{' '}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-body shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </label>
        <label className="flex items-center gap-2 text-body">
          {t('reports.to')}:{' '}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-body shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </label>
        <label className="flex items-center gap-2 text-body">
          <SelectNative value={bucket} onChange={(e) => setBucket(e.target.value as 'day' | 'week')} className="w-32">
            <option value="day">{t('analytics.bucketDay')}</option>
            <option value="week">{t('analytics.bucketWeek')}</option>
          </SelectNative>
        </label>
        {trends && trends.bucket !== bucket && (
          <Badge variant="secondary">{trends.bucket === 'day' ? t('analytics.bucketDay') : t('analytics.bucketWeek')}</Badge>
        )}
      </div>

      {/* 1. KPI row */}
      {kpisError ? (
        <Alert variant="destructive">{t('analytics.empty')}</Alert>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label={t('analytics.kpiSubmissions')} value={kpis ? fmtCount(kpis.submissions.count) : '—'} />
          <StatTile label={t('analytics.kpiSubmissionRate')} value={kpis ? fmtPct(kpis.submissionRate.ratePercent) : '—'} />
          <StatTile
            label={t('analytics.kpiAvgScore')}
            value={kpis ? (kpis.avgScore.scorePct === null ? t('analytics.scoreEmpty') : fmtPct(kpis.avgScore.scorePct)) : '—'}
            secondary={kpis && kpis.avgScore.scorePct !== null ? `${kpis.avgScore.gradedCount} ${t('analytics.gradedCount')}` : undefined}
          />
          <StatTile
            label={t('analytics.kpiPronunciation')}
            value={kpis ? (kpis.avgPronunciation.scorePct === null ? t('analytics.scoreEmpty') : fmtPct(kpis.avgPronunciation.scorePct)) : '—'}
            secondary={
              kpis && kpis.avgPronunciation.scorePct !== null ? `${kpis.avgPronunciation.gradedCount} ${t('analytics.gradedCount')}` : undefined
            }
          />
          <StatTile label={t('analytics.kpiPendingReview')} value={kpis ? fmtCount(kpis.pendingReview.count) : '—'} />
          <StatTile label={t('analytics.kpiCost')} value={kpis ? fmtUsd(kpis.cost.totalUsd) : '—'} />
        </div>
      )}

      {/* 2. Two-up trend row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">{t('analytics.trendSubmissions')}</CardTitle>
          </CardHeader>
          <CardContent>
            {trendsError ? (
              <Alert variant="destructive">{t('analytics.empty')}</Alert>
            ) : (
              <LineChart
                title={t('analytics.trendSubmissions')}
                points={trends?.submissions ?? []}
                axisYLabel={`${axisDate} / ${axisCount}`}
                emptyLabel={t('analytics.empty')}
                formatValue={fmtCount}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">{t('analytics.trendCost')}</CardTitle>
          </CardHeader>
          <CardContent>
            {trendsError ? (
              <Alert variant="destructive">{t('analytics.empty')}</Alert>
            ) : (
              <BarChart
                title={t('analytics.trendCost')}
                points={trends?.cost ?? []}
                orientation="vertical"
                axisValueLabel={`${axisDate} / ${axisCostUsd}`}
                emptyLabel={t('analytics.empty')}
                formatValue={fmtUsd}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. Full-width avg-score trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-h3">{t('analytics.trendScore')}</CardTitle>
        </CardHeader>
        <CardContent>
          {trendsError ? (
            <Alert variant="destructive">{t('analytics.empty')}</Alert>
          ) : (
            <LineChart
              title={t('analytics.trendScore')}
              points={trends?.score ?? []}
              axisYLabel={`${axisDate} / ${axisScorePct}`}
              emptyLabel={t('analytics.empty')}
              formatValue={fmtPct}
            />
          )}
        </CardContent>
      </Card>

      {/* 4. Two-up breakdown row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">{t('analytics.dimensionBreakdown')}</CardTitle>
          </CardHeader>
          <CardContent>
            {dimError ? (
              <Alert variant="destructive">{t('analytics.empty')}</Alert>
            ) : (
              <BarChart
                title={t('analytics.dimensionBreakdown')}
                points={(dimRows ?? []).map((r) => ({
                  label: r.dimension,
                  value: r.avgScorePct,
                  secondary: `${r.gradedCount} ${t('analytics.gradedCount')}`,
                }))}
                orientation="horizontal"
                axisValueLabel={axisScorePct}
                emptyLabel={t('analytics.empty')}
                formatValue={fmtPct}
                highlightWorst
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">{t('analytics.classPerformance')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {classError ? (
              <Alert variant="destructive">{t('analytics.empty')}</Alert>
            ) : (
              <>
                <BarChart
                  title={t('analytics.classPerformance')}
                  points={(classRows ?? []).map((r) => ({
                    label: r.className,
                    value: r.ratePercent,
                    secondary:
                      r.avgScorePct === null
                        ? t('analytics.scoreEmpty')
                        : `${fmtPct(r.avgScorePct)} · ${r.gradedCount} ${t('analytics.gradedCount')}`,
                  }))}
                  orientation="horizontal"
                  axisValueLabel={axisCount}
                  emptyLabel={t('analytics.empty')}
                  formatValue={fmtPct}
                  highlightWorst
                />
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">{t('reports.class')}</TableHead>
                        <TableHead scope="col">{t('reports.rate')}</TableHead>
                        <TableHead scope="col">{t('analytics.avgScore')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(classRows ?? []).map((r) => (
                        <TableRow key={r.className}>
                          <TableCell>{r.className}</TableCell>
                          <TableCell className="tabular-nums">{fmtPct(r.ratePercent)}</TableCell>
                          <TableCell className="tabular-nums">{r.avgScorePct === null ? t('analytics.scoreEmpty') : fmtPct(r.avgScorePct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Pending-review backlog strip (live snapshot, not range-filtered) */}
      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.pendingBacklog')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          {pendingError ? (
            <Alert variant="destructive">{t('analytics.empty')}</Alert>
          ) : (
            <>
              <div>
                <p className="text-h1 tabular-nums">
                  {pending ? (
                    isStale ? (
                      <Badge variant="warning" className="text-h1">
                        {fmtCount(pending.count)}
                      </Badge>
                    ) : (
                      fmtCount(pending.count)
                    )
                  ) : (
                    '—'
                  )}
                </p>
                <p className="text-caption text-muted-foreground">{t('analytics.kpiPendingReview')}</p>
              </div>
              {pending && pending.oldestWaitingHours !== null && (
                <p className="text-body text-muted-foreground">{t('analytics.pendingOldest', { hours: pending.oldestWaitingHours })}</p>
              )}
              <Link to="/submissions?status=awaiting_review" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                {t('analytics.pendingLink')}
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function StatTile({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
  return (
    <Card className="p-4">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-h1 tabular-nums">{value}</p>
      {secondary && <p className="text-caption text-muted-foreground">{secondary}</p>}
    </Card>
  );
}
