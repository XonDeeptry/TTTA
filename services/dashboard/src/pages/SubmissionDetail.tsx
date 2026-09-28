import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useSubmissionEvents } from '../hooks/useSubmissionEvents';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { formatTimestamp, parseTimestamp } from '../lib/timestamp';

/**
 * Từ phát âm sai. Với bài chấm bằng Azure (D149), `word`/`heard_as`/`approx_position_sec` là SỐ ĐO
 * (mốc từ word offset của Azure); với bài chấm Gemini thuần thì vẫn là ƯỚC LƯỢNG của model — nên
 * giao diện chỉ dùng mốc để TUA TỚI GẦN chỗ đó cho người chấm tự nghe và tự phán.
 */
interface MispronouncedWord {
  word: string;
  heard_as?: string;
  suggestion?: string;
  approx_position_sec?: number;
  start_sec?: number;
  end_sec?: number;
  /** ILM 09-15: "azure" = Azure đánh dấu; "gemini" = Azure bỏ sót, Gemini nghe đoạn cắt xác nhận; "teacher" = giáo viên thêm. */
  source?: 'azure' | 'gemini' | 'teacher';
  /** Gemini nghe đoạn cắt thấy KHÔNG sai — giáo viên nghe lại rồi quyết định giữ hay bỏ. */
  needs_review?: boolean;
  /** Lỗi cụ thể Gemini nghe được trong đoạn cắt. */
  issue?: string;
  gemini_confirmed?: boolean;
}

interface DimensionResult {
  score: number;
  comment: string;
  fix?: string;
  mispronounced_words?: MispronouncedWord[];
}

type Scores = Record<string, DimensionResult>;

interface AzureAssessment {
  mode: 'scripted' | 'unscripted';
  scores: { accuracy: number | null; fluency: number | null; prosody: number | null; completeness: number | null };
  ending_sounds: number | null;
  word_stress: number | null;
  transcript?: string;
}

interface Grading {
  id: number;
  scores: Scores;
  /** D153: bản giáo viên đã sửa; `scores` là bản AI, không bao giờ bị ghi đè. */
  reviewedScores: Scores | null;
  assessment: AzureAssessment | null;
  llmFeedback: string;
  reviewedFeedback: string | null;
  autoSent: boolean;
  sentAt: string | null;
  // F9: điểm tổng/cấp độ do core-api tính (`computeTotal`). `null` với bài chấm trước F9.
  totalScore: number | null;
  levelCode: string | null;
  levelLabel: string | null;
  totalMax: number | null;
  criteria?: {
    rubric?: {
      scale?: { min?: number; max?: number; step?: number };
      band_scale?: number[];
      dimensions?: { key?: string; name?: string; label?: string }[];
    };
  } | null;
}

interface Flag {
  id: number;
  reason: string;
  resolvedAt: string | null;
}

/** Lùi trước mốc báo bấy nhiêu giây khi tua — xem `seekTo`. */
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

function cloneScores(scores: Scores): Scores {
  return JSON.parse(JSON.stringify(scores ?? {})) as Scores;
}

/** Thang và nhãn lấy từ rubric của CHÍNH bài chấm (có thể là v1 `band_scale`/`name`). */
function rubricView(grading: Grading) {
  const rubric = grading.criteria?.rubric ?? {};
  const scale = rubric.scale ?? {};
  const legacy = rubric.band_scale ?? [];
  const min = scale.min ?? legacy[0] ?? 0;
  const max = scale.max ?? legacy[1] ?? 3;
  const step = scale.step ?? 1;
  const labels: Record<string, string> = {};
  for (const d of rubric.dimensions ?? []) {
    const key = d.key ?? d.name;
    if (key) labels[key] = d.label ?? d.name ?? key;
  }
  return { min, max, step, labels };
}

export function SubmissionDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SubmissionDetailData | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [scoresDraft, setScoresDraft] = useState<Scores>({});
  const [message, setMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  /**
   * Tua tới TRƯỚC mốc vài giây rồi phát. Lùi lại là có chủ ý: nghe được ngữ cảnh dẫn vào từ thì
   * người chấm mới phán được — nhảy đúng phóc vào giữa từ thường khiến không nghe kịp.
   */
  function seekTo(seconds: number): void {
    const el = audioRef.current;
    if (!el) return;
    const target = Math.max(0, seconds - SEEK_LEAD_SEC);
    const jump = (): void => {
      el.currentTime = target;
      void el.play().catch(() => undefined); // trình duyệt chặn autoplay ⇒ vẫn đã tua đúng chỗ
    };
    // Gán `currentTime` khi chưa có metadata thì trình duyệt LẶNG LẼ BỎ QUA.
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      jump();
    } else {
      el.addEventListener('loadedmetadata', jump, { once: true });
      el.load();
    }
  }

  function load(): void {
    void api.get<SubmissionDetailData>(`/submissions/${id}`).then((d) => {
      setData(d);
      setFeedbackDraft(d.grading?.reviewedFeedback ?? d.grading?.llmFeedback ?? '');
      setScoresDraft(cloneScores(d.grading?.reviewedScores ?? d.grading?.scores ?? {}));
    });
  }

  useEffect(load, [id]);

  useSubmissionEvents((evt) => {
    if (evt.submissionId !== Number(id)) return;
    load();
  });

  function patchDimension(key: string, patch: Partial<DimensionResult>): void {
    setScoresDraft((s) => ({ ...s, [key]: { ...s[key], ...patch } }));
  }

  function patchWord(key: string, index: number, patch: Partial<MispronouncedWord>): void {
    setScoresDraft((s) => {
      const words = [...(s[key]?.mispronounced_words ?? [])];
      words[index] = { ...words[index], ...patch };
      return { ...s, [key]: { ...s[key], mispronounced_words: words } };
    });
  }

  /**
   * ILM 09-22: mốc giờ của từ giáo viên thêm gõ tay được. Ghi cả `start_sec` (core-api dùng để tra số đo
   * Azure khi ghi log `added`) lẫn `approx_position_sec` (nút ▶ và dòng "• 1:29 — …" trong tin học viên).
   */
  function setWordTime(key: string, index: number, seconds: number | undefined): void {
    patchWord(key, index, { start_sec: seconds, approx_position_sec: seconds });
  }

  /** Gắn sai (từ AI) và Xóa (từ giáo viên thêm) cùng bỏ dòng khỏi bản nháp — khác nhau ở ý nghĩa khi ghi log. */
  function removeWord(key: string, index: number): void {
    setScoresDraft((s) => ({
      ...s,
      [key]: { ...s[key], mispronounced_words: (s[key]?.mispronounced_words ?? []).filter((_, i) => i !== index) },
    }));
  }

  /**
   * ILM 09-15: giáo viên thêm từ AI bỏ sót — mốc lấy theo vị trí audio đang dừng. Khi Gửi, core-api so
   * danh sách này với bản AI để ghi log giữ / gắn sai / thêm (đo hiệu quả AI ↔ giáo viên).
   */
  function addWord(key: string): void {
    const at = audioRef.current ? Math.round(audioRef.current.currentTime * 100) / 100 : undefined;
    const word: MispronouncedWord = { word: '', suggestion: '', source: 'teacher', ...(at !== undefined ? { start_sec: at, approx_position_sec: at } : {}) };
    setScoresDraft((s) => ({ ...s, [key]: { ...s[key], mispronounced_words: [...(s[key]?.mispronounced_words ?? []), word] } }));
  }

  function reviewBody() {
    return { reviewedFeedback: feedbackDraft, reviewedScores: scoresDraft };
  }

  async function saveReview(): Promise<void> {
    if (!data?.grading) return;
    await api.patch(`/gradings/${data.grading.id}`, reviewBody());
    setMessage(t('submissions.saved'));
    load();
  }

  /** D153: Gửi = lưu bản đang sửa rồi gửi đúng bản đó (core-api làm cả hai trong một lượt gọi). */
  async function send(): Promise<void> {
    if (!data?.grading) return;
    await api.post(`/gradings/${data.grading.id}/send`, reviewBody());
    setMessage(t('submissions.sent'));
    load();
  }

  async function deleteMedia(): Promise<void> {
    await api.delete(`/submissions/${id}/media`);
    setMessage(t('submissions.mediaDeleted'));
    load();
  }

  if (!data) return null;
  const grading = data.grading;
  const sent = Boolean(grading?.sentAt);
  const view = grading ? rubricView(grading) : null;

  return (
    <main id="main-content" className="max-w-5xl space-y-6 p-6">
      <Link to="/submissions" className="text-body text-primary hover:underline">
        {t('submissions.back')}
      </Link>
      <h1 className="text-h1">{data.student?.fullName ?? '—'}</h1>

      {data.mediaPath && !data.mediaDeletedAt ? (
        <audio ref={audioRef} controls src={`/api/media/${data.id}`} aria-label={t('submissions.audioPlayer')} className="w-full" />
      ) : (
        <p className="text-muted-foreground">{t('submissions.noMedia')}</p>
      )}

      {grading && view && (
        <Card>
          <CardHeader>
            <CardTitle>{t('submissions.gradingTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {grading.totalScore !== null && grading.totalMax !== null ? (
              <p>
                {t('submissions.total')} ({t('submissions.aiOriginal')}):{' '}
                <span className="font-medium tabular-nums">
                  {grading.totalScore}/{grading.totalMax}
                </span>
                {grading.levelLabel ? ` — ${grading.levelLabel}` : ''}
              </p>
            ) : (
              <p className="text-muted-foreground">{t('submissions.totalUnavailable')}</p>
            )}

            {grading.assessment && <AzurePanel assessment={grading.assessment} />}

            <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-body">
              {sent ? t('submissions.sentReadOnly') : t('submissions.editHint')}
            </p>

            <div>
              <h2 className="text-h2">{t('submissions.overallFeedback')}</h2>
              <Textarea rows={4} className="mt-1" value={feedbackDraft} disabled={sent} onChange={(e) => setFeedbackDraft(e.target.value)} />
              <details className="mt-1 text-caption text-muted-foreground">
                <summary className="cursor-pointer">{t('submissions.llmFeedback')}</summary>
                <p className="mt-1 whitespace-pre-wrap">{grading.llmFeedback}</p>
              </details>
            </div>

            <div className="space-y-4">
              <h2 className="text-h2">{t('submissions.scores')}</h2>
              {Object.keys(scoresDraft).map((key) => {
                const dim = scoresDraft[key];
                const original = grading.scores[key];
                const words = dim?.mispronounced_words;
                return (
                  <div key={key} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium">{view.labels[key] ?? key}</span>
                      <label className="flex items-center gap-1.5 text-body">
                        {t('submissions.dimensionScore')}
                        <Input
                          type="number"
                          className="w-20"
                          min={view.min}
                          max={view.max}
                          step={view.step}
                          value={dim?.score ?? ''}
                          disabled={sent}
                          onChange={(e) => patchDimension(key, { score: e.target.value === '' ? view.min : Number(e.target.value) })}
                        />
                        <span className="text-muted-foreground">/ {view.max}</span>
                      </label>
                      {original && original.score !== dim?.score && (
                        <Badge variant="outline" className="font-normal">
                          {t('submissions.aiOriginal')}: {original.score}
                        </Badge>
                      )}
                    </div>
                    <label className="block text-caption text-muted-foreground">
                      {t('submissions.comment')}
                      <Textarea rows={2} className="mt-0.5" value={dim?.comment ?? ''} disabled={sent} onChange={(e) => patchDimension(key, { comment: e.target.value })} />
                    </label>
                    {dim && 'fix' in dim && (
                      <label className="block text-caption text-muted-foreground">
                        {t('submissions.scoreFix')}
                        <Textarea rows={2} className="mt-0.5" value={dim.fix ?? ''} disabled={sent} onChange={(e) => patchDimension(key, { fix: e.target.value })} />
                      </label>
                    )}
                    {(words !== undefined || (!sent && grading.assessment)) && (
                      <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2">
                        <p className="text-muted-foreground">{t('submissions.mispronouncedHint')}</p>
                        {(words ?? []).map((w, i) => (
                          <div key={`${key}-${i}`} className="flex flex-wrap items-center gap-2">
                            {w.source === 'teacher' && !sent ? (
                              <TimeInput
                                value={w.approx_position_sec}
                                maxSec={audioRef.current && Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : undefined}
                                onCommit={(sec) => setWordTime(key, i, sec)}
                                onPlay={(sec) => seekTo(sec)}
                                onTakeAudioTime={
                                  data.mediaPath && !data.mediaDeletedAt
                                    ? () => {
                                        const el = audioRef.current;
                                        if (el) setWordTime(key, i, Math.round(el.currentTime * 100) / 100);
                                      }
                                    : undefined
                                }
                                playDisabled={!data.mediaPath || Boolean(data.mediaDeletedAt)}
                              />
                            ) : typeof w.approx_position_sec === 'number' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 tabular-nums"
                                onClick={() => seekTo(w.approx_position_sec as number)}
                                disabled={!data.mediaPath || Boolean(data.mediaDeletedAt)}
                                aria-label={t('submissions.seekTo', { word: w.word, time: formatTimestamp(w.approx_position_sec) })}
                              >
                                ▶ {formatTimestamp(w.approx_position_sec)}
                              </Button>
                            ) : null}
                            {w.source === 'teacher' ? (
                              <Input
                                className="w-32"
                                placeholder={t('submissions.wordPlaceholder')}
                                value={w.word}
                                disabled={sent}
                                onChange={(e) => patchWord(key, i, { word: e.target.value })}
                              />
                            ) : (
                              <span className="font-medium">{w.word}</span>
                            )}
                            {w.needs_review && <Badge variant="warning">{t('submissions.wordNeedsReview')}</Badge>}
                            {w.source === 'gemini' && <Badge variant="secondary">{t('submissions.wordFromGemini')}</Badge>}
                            {w.source === 'teacher' && <Badge variant="outline">{t('submissions.wordFromTeacher')}</Badge>}
                            {w.issue ? <span className="text-caption text-muted-foreground">({w.issue})</span> : null}
                            {w.heard_as ? (
                              <span className="text-muted-foreground">
                                {t('submissions.heardAs')}: <em>{w.heard_as}</em>
                              </span>
                            ) : null}
                            <Input
                              className="min-w-[12rem] flex-1"
                              value={w.suggestion ?? ''}
                              disabled={sent}
                              onChange={(e) => patchWord(key, i, { suggestion: e.target.value })}
                            />
                            {!sent &&
                              (w.source === 'teacher' ? (
                                <Button size="sm" variant="outline" onClick={() => removeWord(key, i)} title={t('submissions.deleteWordHint')}>
                                  {t('submissions.deleteWord')}
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => removeWord(key, i)} title={t('submissions.removeWordHint')}>
                                  {t('submissions.removeWord')}
                                </Button>
                              ))}
                          </div>
                        ))}
                        {!sent && (
                          <Button size="sm" variant="ghost" onClick={() => addWord(key)} title={t('submissions.addWordHint')}>
                            {t('submissions.addWord')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveReview} disabled={sent}>
                {t('students.save')}
              </Button>
              <Button onClick={send} disabled={sent}>
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

/**
 * ILM 09-22: ô mốc giờ cho từ giáo viên thêm. Gõ tự do, chỉ ghi vào bản nháp khi rời ô hoặc bấm Enter —
 * ghi theo từng phím thì "1:" (đang gõ dở) sẽ bị coi là sai. Gõ sai dạng thì giữ mốc cũ và báo đỏ.
 */
function TimeInput({
  value,
  maxSec,
  onCommit,
  onPlay,
  onTakeAudioTime,
  playDisabled,
}: {
  value: number | undefined;
  maxSec?: number;
  onCommit: (seconds: number | undefined) => void;
  onPlay: (seconds: number) => void;
  onTakeAudioTime?: () => void;
  playDisabled: boolean;
}) {
  const { t } = useTranslation();
  const shown = typeof value === 'number' ? formatTimestamp(value) : '';
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);

  // Mốc đổi từ ngoài (nút "lấy mốc đang phát", tải lại bài) ⇒ ô hiện theo.
  useEffect(() => {
    setText(shown);
    setInvalid(false);
  }, [shown]);

  function commit(): void {
    const parsed = parseTimestamp(text, maxSec);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(parsed ?? undefined);
    setText(parsed === null ? '' : formatTimestamp(parsed));
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        className="tabular-nums"
        onClick={() => typeof value === 'number' && onPlay(value)}
        disabled={playDisabled || typeof value !== 'number'}
        aria-label={t('submissions.playAt')}
      >
        ▶
      </Button>
      <Input
        className={'w-20 tabular-nums' + (invalid ? ' border-destructive focus-visible:ring-destructive' : '')}
        placeholder="m:ss"
        value={text}
        aria-label={t('submissions.timeLabel')}
        aria-invalid={invalid}
        title={invalid ? t('submissions.timeInvalid') : t('submissions.timeHint')}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      {onTakeAudioTime && (
        <Button size="sm" variant="ghost" onClick={onTakeAudioTime} title={t('submissions.timeFromAudioHint')}>
          {t('submissions.timeFromAudio')}
        </Button>
      )}
      {invalid && <span className="text-caption text-destructive">{t('submissions.timeInvalid')}</span>}
    </span>
  );
}

function AzurePanel({ assessment }: { assessment: AzureAssessment }) {
  const { t } = useTranslation();
  const metric = (label: string, value: number | null | undefined) => (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-body font-medium tabular-nums">{value == null ? '—' : Math.round(value)}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h2">{t('submissions.azureTitle')}</h2>
        <Badge variant={assessment.mode === 'scripted' ? 'success' : 'warning'}>
          {t(assessment.mode === 'scripted' ? 'submissions.azureModeScripted' : 'submissions.azureModeUnscripted')}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {metric(t('submissions.azureAccuracy'), assessment.scores.accuracy)}
        {metric(t('submissions.azureFluency'), assessment.scores.fluency)}
        {metric(t('submissions.azureProsody'), assessment.scores.prosody)}
        {metric(t('submissions.azureEndingSounds'), assessment.ending_sounds)}
        {metric(t('submissions.azureWordStress'), assessment.word_stress)}
        {assessment.mode === 'scripted' && metric(t('submissions.azureCompleteness'), assessment.scores.completeness)}
      </div>
      {assessment.transcript && (
        <details className="text-caption text-muted-foreground">
          <summary className="cursor-pointer">{t('submissions.transcript')}</summary>
          <p className="mt-1 whitespace-pre-wrap">{assessment.transcript}</p>
        </details>
      )}
    </div>
  );
}
