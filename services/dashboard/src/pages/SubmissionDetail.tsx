import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

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
    <main style={{ maxWidth: 720, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <Link to="/submissions">{t('submissions.back')}</Link>
      <h1>{data.student?.fullName ?? '—'}</h1>

      {data.mediaPath && !data.mediaDeletedAt ? (
        <audio controls src={`/api/media/${data.id}`} style={{ width: '100%' }} />
      ) : (
        <p>{t('submissions.noMedia')}</p>
      )}

      {data.grading && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginTop: '1.5rem' }}>
          <section style={{ flex: '1 1 320px', minWidth: 280 }}>
            <h2>{t('submissions.pilotAudioTitle')}</h2>
            <h2>{t('submissions.scores')}</h2>
            <ul>
              {Object.entries(data.grading.scores).map(([dimension, { score, comment }]) => (
                <li key={dimension}>
                  <strong>{dimension}</strong>: {score} — {comment}
                </li>
              ))}
            </ul>

            <h2>{t('submissions.llmFeedback')}</h2>
            <p>{data.grading.llmFeedback}</p>

            <h2>{t('submissions.reviewedFeedback')}</h2>
            <textarea rows={5} style={{ width: '100%' }} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={saveReview}>{t('students.save')}</button>
              <button onClick={send} disabled={!!data.grading.sentAt}>
                {t('submissions.send')}
              </button>
              {user?.role === 'admin' && data.mediaPath && !data.mediaDeletedAt && (
                <button onClick={deleteMedia}>{t('submissions.deleteMedia')}</button>
              )}
            </div>
            {message && <p>{message}</p>}
          </section>

          {data.pilotTextGrading && (
            <section style={{ flex: '1 1 320px', minWidth: 280 }}>
              <h2>{t('submissions.pilotTextTitle')}</h2>
              <div style={{ background: '#fff3cd', border: '1px solid #e0c97f', padding: '0.5rem', margin: '0.5rem 0' }}>
                {t('submissions.pilotNotSentNotice')}
              </div>

              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>{t('submissions.pilotScoreDimension')}</th>
                    <th>{t('submissions.pilotScoreAudio')}</th>
                    <th>{t('submissions.pilotScoreText')}</th>
                    <th>{t('submissions.pilotScoreDelta')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(data.grading.scores).map((dimension) => {
                    const audioScore = data.grading?.scores[dimension]?.score;
                    const textScore = data.pilotTextGrading?.scores[dimension]?.score;
                    const hasBoth = typeof audioScore === 'number' && typeof textScore === 'number';
                    const delta = hasBoth ? (audioScore as number) - (textScore as number) : null;
                    return (
                      <tr key={dimension}>
                        <td>{dimension}</td>
                        <td>{typeof audioScore === 'number' ? audioScore : '—'}</td>
                        <td>{typeof textScore === 'number' ? textScore : '—'}</td>
                        <td>{delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <h2>{t('submissions.pilotLlmFeedback')}</h2>
              <p>{data.pilotTextGrading.llmFeedback}</p>

              <h2>{t('submissions.pilotTranscript')}</h2>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ccc', padding: '0.5rem' }}>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.pilotTextGrading.transcript}</pre>
              </div>

              <p style={{ color: '#666', fontSize: '0.85rem' }}>
                {t('submissions.pilotProviderModel', {
                  provider: data.pilotTextGrading.provider,
                  model: data.pilotTextGrading.model,
                  createdAt: new Date(data.pilotTextGrading.createdAt).toLocaleString(),
                })}
              </p>
            </section>
          )}
        </div>
      )}

      {data.flags.length > 0 && (
        <>
          <h2>{t('submissions.flags')}</h2>
          <ul>
            {data.flags.map((f) => (
              <li key={f.id}>{f.reason}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
