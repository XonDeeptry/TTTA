import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useSubmissionEvents } from '../hooks/useSubmissionEvents';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';

interface Grading {
  id: number;
  // `fix` chỉ có với rubric khai báo output_fields ["comment","fix"] (F8) — thường vắng mặt.
  scores: Record<string, { score: number; comment: string; fix?: string }>;
  llmFeedback: string;
  reviewedFeedback: string | null;
  autoSent: boolean;
  sentAt: string | null;
  // F9: điểm tổng/cấp độ do core-api tính (`computeTotal`). `null` với bài chấm trước F9.
  // `totalMax` là giá trị DẪN XUẤT do server trả về — KHÔNG tính lại số học chấm điểm ở đây.
  totalScore: number | null;
  levelCode: string | null;
  levelLabel: string | null;
  totalMax: number | null;
}

interface Flag {
  id: number;
  reason: string;
  resolvedAt: string | null;
}

interface SubmissionDetailData {
  id: number;
  kind: string;
  status: string;
  mediaPath: string | null;
  mediaDeletedAt: string | null;
  student: { id: number; fullName: string } | null;
  grading: Grading | null;
  flags: Flag[];
}

export function SubmissionDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SubmissionDetailData | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  function load(): void {
    void api.get<SubmissionDetailData>(`/submissions/${id}`).then((d) => {
      setData(d);
      setDraft(d.grading?.reviewedFeedback ?? d.grading?.llmFeedback ?? '');
    });
  }

  useEffect(load, [id]);

  useSubmissionEvents((evt) => {
    if (evt.submissionId !== Number(id)) return;
    load();
  });

  async function saveReview(): Promise<void> {
    if (!data?.grading) return;
    await api.patch(`/gradings/${data.grading.id}`, { reviewedFeedback: draft });
    setMessage(t('students.save'));
    load();
  }

  async function send(): Promise<void> {
    if (!data?.grading) return;
    await api.post(`/gradings/${data.grading.id}/send`);
    setMessage(t('submissions.sent'));
    load();
  }

  async function deleteMedia(): Promise<void> {
    await api.delete(`/submissions/${id}/media`);
    setMessage(t('submissions.mediaDeleted'));
    load();
  }

  if (!data) return null;

  return (
    <main id="main-content" className="max-w-5xl space-y-6 p-6">
      <Link to="/submissions" className="text-body text-primary hover:underline">
        {t('submissions.back')}
      </Link>
      <h1 className="text-h1">{data.student?.fullName ?? '—'}</h1>

      {data.mediaPath && !data.mediaDeletedAt ? (
        <audio
          controls
          src={`/api/media/${data.id}`}
          aria-label={t('submissions.audioPlayer')}
          className="w-full"
        />
      ) : (
        <p className="text-muted-foreground">{t('submissions.noMedia')}</p>
      )}

      {data.grading && (
        <div className="flex flex-wrap gap-6">
          <Card className="min-w-[320px] flex-1">
            <CardHeader>
              <CardTitle>{t('submissions.gradingTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h2 className="text-h2">{t('submissions.scores')}</h2>
                {data.grading.totalScore !== null && data.grading.totalMax !== null ? (
                  <p className="mt-1">
                    {t('submissions.total')}:{' '}
                    <span className="font-medium tabular-nums">
                      {data.grading.totalScore}/{data.grading.totalMax}
                    </span>
                    {data.grading.levelLabel ? ` — ${data.grading.levelLabel}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">{t('submissions.totalUnavailable')}</p>
                )}
                <ul className="mt-2 space-y-2">
                  {Object.entries(data.grading.scores).map(([dimension, { score, comment, fix }]) => (
                    <li key={dimension} className="flex flex-wrap items-start gap-2">
                      <span className="font-medium">{dimension}</span>
                      <Badge variant="outline" className="shrink-0">
                        {score}
                      </Badge>
                      <span className="text-muted-foreground">{comment}</span>
                      {fix ? (
                        <span className="w-full text-muted-foreground">
                          {t('submissions.scoreFix')}: {fix}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-h2">{t('submissions.llmFeedback')}</h2>
                <p className="mt-1">{data.grading.llmFeedback}</p>
              </div>

              <div>
                <h2 className="text-h2">{t('submissions.reviewedFeedback')}</h2>
                <Textarea
                  rows={5}
                  className="mt-1"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={saveReview}>
                  {t('students.save')}
                </Button>
                <Button onClick={send} disabled={!!data.grading.sentAt}>
                  {t('submissions.send')}
                </Button>
                {user?.role === 'admin' && data.mediaPath && !data.mediaDeletedAt && (
                  <Button variant="destructive" onClick={deleteMedia}>
                    {t('submissions.deleteMedia')}
                  </Button>
                )}
              </div>
              {message && <p className="text-body text-muted-foreground">{message}</p>}
            </CardContent>
          </Card>

        </div>
      )}

      {data.flags.length > 0 && (
        <div>
          <h2 className="text-h2">{t('submissions.flags')}</h2>
          <ul className="mt-2 space-y-1">
            {data.flags.map((f) => (
              <li key={f.id}>{f.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
