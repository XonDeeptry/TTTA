import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useSubmissionEvents } from '../hooks/useSubmissionEvents';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';

/**
 * Bằng chứng phát âm sai do LLM trả về (`grading/schema.py`, chiều `pronunciation`).
 * `approx_position_sec` là ƯỚC LƯỢNG của model, KHÔNG phải forced alignment — nên giao diện
 * chỉ dùng nó để TUA TỚI GẦN chỗ đó cho người chấm tự nghe và tự phán, tuyệt đối không trình
 * bày như một mốc chính xác. Đo trên 2 lần chấm cùng một clip (2026-09-06) thì mốc trùng khít,
 * nhưng "lặp lại được" chưa phải "đúng".
 */
interface MispronouncedWord {
  word: string;
  heard_as?: string;
  suggestion?: string;
  approx_position_sec?: number;
}

interface Grading {
  id: number;
  // `fix` chỉ có với rubric khai báo output_fields ["comment","fix"] (F8) — thường vắng mặt.
  // `mispronounced_words` chỉ có ở chiều `pronunciation`, và cũng chỉ khi LLM tìm thấy lỗi.
  scores: Record<
    string,
    { score: number; comment: string; fix?: string; mispronounced_words?: MispronouncedWord[] }
  >;
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

/** Lùi trước mốc LLM báo bấy nhiêu giây khi tua — xem `seekTo`. */
const SEEK_LEAD_SEC = 2;

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
  const audioRef = useRef<HTMLAudioElement>(null);

  /**
   * Tua tới TRƯỚC mốc LLM báo vài giây rồi phát. Lùi lại là có chủ ý: mốc chỉ là ước lượng,
   * và nghe được ngữ cảnh dẫn vào từ thì người chấm mới phán được — nhảy đúng phóc vào giữa
   * từ thường khiến không nghe kịp.
   */
  function seekTo(seconds: number): void {
    const el = audioRef.current;
    if (!el) return;
    const target = Math.max(0, seconds - SEEK_LEAD_SEC);
    const jump = (): void => {
      el.currentTime = target;
      void el.play().catch(() => undefined); // trình duyệt chặn autoplay ⇒ vẫn đã tua đúng chỗ
    };
    // Gán `currentTime` khi chưa có metadata thì trình duyệt LẶNG LẼ BỎ QUA. Lần bấm đầu tiên
    // (người dùng chưa từng nhấn play) rơi đúng vào trường hợp đó, nên phải đợi `loadedmetadata`.
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      jump();
    } else {
      el.addEventListener('loadedmetadata', jump, { once: true });
      el.load();
    }
  }

  function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

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
          ref={audioRef}
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
                  {Object.entries(data.grading.scores).map(
                    ([dimension, { score, comment, fix, mispronounced_words: mispronounced }]) => (
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
                        {mispronounced && mispronounced.length > 0 ? (
                          <div className="w-full space-y-1 rounded-md border border-border bg-muted/40 p-2">
                            <p className="text-muted-foreground">{t('submissions.mispronouncedHint')}</p>
                            {mispronounced.map((w, i) => (
                              <div key={`${w.word}-${i}`} className="flex flex-wrap items-baseline gap-2">
                                {typeof w.approx_position_sec === 'number' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0 tabular-nums"
                                    onClick={() => seekTo(w.approx_position_sec as number)}
                                    disabled={!data.mediaPath || Boolean(data.mediaDeletedAt)}
                                    aria-label={t('submissions.seekTo', {
                                      word: w.word,
                                      time: formatTimestamp(w.approx_position_sec),
                                    })}
                                  >
                                    ▶ {formatTimestamp(w.approx_position_sec)}
                                  </Button>
                                ) : null}
                                <span className="font-medium">{w.word}</span>
                                {w.heard_as ? (
                                  <span className="text-muted-foreground">
                                    {t('submissions.heardAs')}: <em>{w.heard_as}</em>
                                  </span>
                                ) : null}
                                {w.suggestion ? <span className="text-muted-foreground">→ {w.suggestion}</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ),
                  )}
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
