import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useSubmissionEvents } from '../hooks/useSubmissionEvents';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';

interface Grading {
  id: number;
  scores: Record<string, { score: number; comment: string }>;
  llmFeedback: string;
  reviewedFeedback: string | null;
  autoSent: boolean;
  sentAt: string | null;
}

interface Flag {
  id: number;
  reason: string;
  resolvedAt: string | null;
}

interface PilotTextGrading {
  id: number;
  submissionId: number;
  criteriaId: number;
  criteriaVersion: number;
  transcript: string;
  scores: Record<string, { score: number; comment: string }>;
  llmFeedback: string;
  provider: string;
  model: string;
  createdAt: string;
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
  pilotTextGrading: PilotTextGrading | null;
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
              <CardTitle>{t('submissions.pilotAudioTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h2 className="text-h2">{t('submissions.scores')}</h2>
                <ul className="mt-2 space-y-2">
                  {Object.entries(data.grading.scores).map(([dimension, { score, comment }]) => (
                    <li key={dimension} className="flex items-start gap-2">
                      <span className="font-medium">{dimension}</span>
                      <Badge variant="outline" className="shrink-0">
                        {score}
                      </Badge>
                      <span className="text-muted-foreground">{comment}</span>
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

          {data.pilotTextGrading && (
            <Card className="min-w-[320px] flex-1">
              <CardHeader>
                <CardTitle>{t('submissions.pilotTextTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert variant="warning">{t('submissions.pilotNotSentNotice')}</Alert>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('submissions.pilotScoreDimension')}</TableHead>
                      <TableHead scope="col">{t('submissions.pilotScoreAudio')}</TableHead>
                      <TableHead scope="col">{t('submissions.pilotScoreText')}</TableHead>
                      <TableHead scope="col">{t('submissions.pilotScoreDelta')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.keys(data.grading.scores).map((dimension) => {
                      const audioScore = data.grading?.scores[dimension]?.score;
                      const textScore = data.pilotTextGrading?.scores[dimension]?.score;
                      const hasBoth = typeof audioScore === 'number' && typeof textScore === 'number';
                      const delta = hasBoth ? (audioScore as number) - (textScore as number) : null;
                      return (
                        <TableRow key={dimension}>
                          <TableCell>{dimension}</TableCell>
                          <TableCell className="tabular-nums">{typeof audioScore === 'number' ? audioScore : '—'}</TableCell>
                          <TableCell className="tabular-nums">{typeof textScore === 'number' ? textScore : '—'}</TableCell>
                          <TableCell className="tabular-nums">
                            {delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div>
                  <h2 className="text-h2">{t('submissions.pilotLlmFeedback')}</h2>
                  <p className="mt-1">{data.pilotTextGrading.llmFeedback}</p>
                </div>

                <div>
                  <h2 className="text-h2">{t('submissions.pilotTranscript')}</h2>
                  <div className="mt-1 max-h-[200px] overflow-y-auto rounded-md border border-border p-3">
                    <pre className="whitespace-pre-wrap text-body">{data.pilotTextGrading.transcript}</pre>
                  </div>
                </div>

                <p className="text-caption text-muted-foreground">
                  {t('submissions.pilotProviderModel', {
                    provider: data.pilotTextGrading.provider,
                    model: data.pilotTextGrading.model,
                    createdAt: new Date(data.pilotTextGrading.createdAt).toLocaleString(),
                  })}
                </p>
              </CardContent>
            </Card>
          )}
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
