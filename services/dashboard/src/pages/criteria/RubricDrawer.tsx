import { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Alert } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Drawer } from '../../components/ui/drawer';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { SelectNative } from '../../components/ui/select-native';
import { Textarea } from '../../components/ui/textarea';
import { IconLock, IconPin, IconPlus, IconTrash } from '../../components/icons';
import { Tooltip } from '../../components/ui/tooltip';
import { describeApiError } from './api-errors';
import { bandValues, type CommentBankEntry, type RubricDimensionV2, type RubricSubFactor, type RubricV2 } from '../../lib/rubric';
import { LOCK_I18N_SUFFIX, LOCK_PATHS, type RubricTemplateRow } from './TemplateDrawer';
import { PromptPreview } from './PromptPreview';

interface CourseOption {
  id: number;
  key: string;
}

interface CriteriaRow {
  id: number;
  courseId: number;
  title: string;
  version: number;
  rubric: RubricV2;
  templateKey: string | null;
}

interface AuthoringDraft {
  courseId: number | null;
  templateKey: string | null;
  title: string;
  rubric: RubricV2;
}

const BAND_ROW_CAP = 50;

function cloneRubric(rubric: RubricV2): RubricV2 {
  return JSON.parse(JSON.stringify(rubric)) as RubricV2;
}

function orderedDimensions(rubric: RubricV2): RubricDimensionV2[] {
  const dims = rubric.dimensions ?? [];
  const pron = dims.filter((d) => d.key === 'pronunciation');
  const rest = dims.filter((d) => d.key !== 'pronunciation');
  return [...pron, ...rest];
}

/** DEF-2 fix: render the actual loaded value for each of the 7 lock paths, not just the path's
 * name — a teacher looking at "Thang điểm: đã khóa" with no numbers can't tell what the
 * structure actually is. Read-only display only; Drawer 2 never edits these (F12-ux.md §3.4.5). */
function lockPathValueText(path: (typeof LOCK_PATHS)[number], rubric: RubricV2, t: TFunction): string {
  switch (path) {
    case 'scale':
      return `${rubric.scale.min}–${rubric.scale.max} (step ${rubric.scale.step})`;
    case 'aggregation':
      return `${t(`templates.method.${rubric.aggregation.method}`)} · ${t(`templates.round.${rubric.aggregation.round}`)}`;
    case 'levels':
      return rubric.levels.length === 0
        ? '—'
        : rubric.levels.map((lv) => `${lv.code} (${lv.min}–${lv.max}): ${lv.label}`).join('; ');
    case 'output_fields':
      return rubric.output_fields.length === 0
        ? '—'
        : rubric.output_fields.map((f) => t(f === 'comment' ? 'templates.outputComment' : 'templates.outputFix')).join(', ');
    case 'dimensions[].key':
      return rubric.dimensions.map((d) => d.key).join(', ') || '—';
    case 'dimensions[].weight':
      return rubric.dimensions.map((d) => `${d.key}=${d.weight}`).join(', ') || '—';
    case 'student_reply':
      return rubric.student_reply
        ? `show_total=${rubric.student_reply.show_total}, show_level=${rubric.student_reply.show_level}, ${t('authoring.replyButtonCount', { count: rubric.student_reply.buttons.length })}`
        : '—';
    default:
      return '—';
  }
}

export function RubricDrawer({
  open,
  onClose,
  courses,
  initialCriteria,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  courses: CourseOption[];
  /** Set when opened via a version row's "Sửa" (AC-15.3) — skips the course/template step. */
  initialCriteria: { id: number; courseId: number } | null;
  onSaved: (version: number) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [selectCourseId, setSelectCourseId] = useState('');
  const [templates, setTemplates] = useState<RubricTemplateRow[] | null>(null);
  const [selectTemplateKey, setSelectTemplateKey] = useState('');

  const [baseline, setBaseline] = useState<AuthoringDraft | null>(null);
  const [draft, setDraft] = useState<AuthoringDraft | null>(null);
  const [lockedPaths, setLockedPaths] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<{ heading: string; issues: string[]; detail?: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<null | (() => void)>(null);

  const dirty = draft !== null && baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!open) return;
    setBanner(null);
    setFormError(null);
    if (initialCriteria) {
      setStep('form');
      loadFromCriteria(initialCriteria.id);
    } else {
      setStep('select');
      setSelectCourseId('');
      setSelectTemplateKey('');
      setBaseline(null);
      setDraft(null);
      api
        .get<RubricTemplateRow[]>('/criteria/templates')
        .then(setTemplates)
        .catch(() => setTemplates([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCriteria?.id]);

  async function loadLockInfo(templateKey: string | null): Promise<void> {
    if (!templateKey) {
      setLockedPaths([]);
      setTemplateName('');
      return;
    }
    try {
      const tpl = await api.get<RubricTemplateRow>(`/criteria/templates/${templateKey}`);
      setLockedPaths(tpl.locked ?? []);
      setTemplateName(tpl.name);
    } catch {
      // Orphaned templateKey (BR-07) — normal, not an error. No lock info available.
      setLockedPaths([]);
      setTemplateName(templateKey);
    }
  }

  async function loadFromCriteria(id: number): Promise<void> {
    setLoadError(null);
    try {
      const row = await api.get<CriteriaRow>(`/criteria/${id}`);
      const rubric = cloneRubric(row.rubric);
      const model: AuthoringDraft = { courseId: row.courseId, templateKey: row.templateKey, title: row.title, rubric };
      setBaseline(JSON.parse(JSON.stringify(model)));
      setDraft(model);
      await loadLockInfo(row.templateKey);
    } catch {
      setLoadError(t('errors.server'));
    }
  }

  function startFromTemplate(): void {
    const courseId = Number(selectCourseId);
    const tpl = templates?.find((tp) => tp.key === selectTemplateKey);
    if (!courseId || !tpl) return;
    const rubric = cloneRubric(tpl.rubric);
    const course = courses.find((c) => c.id === courseId);
    if (!rubric.course_key && course) rubric.course_key = course.key;
    const model: AuthoringDraft = { courseId, templateKey: tpl.key, title: '', rubric };
    setBaseline(JSON.parse(JSON.stringify(model)));
    setDraft(model);
    setLockedPaths(tpl.locked ?? []);
    setTemplateName(tpl.name);
    setStep('form');
  }

  function requestClose(): void {
    if (dirty) setPendingClose(() => onClose);
    else onClose();
  }

  function backToSelect(): void {
    if (dirty) setPendingClose(() => () => setStep('select'));
    else setStep('select');
  }

  function updateRubric(patch: (r: RubricV2) => RubricV2): void {
    setDraft((d) => (d ? { ...d, rubric: patch(cloneRubric(d.rubric)) } : d));
  }

  function setBandLine(dimKey: string, value: string, text: string): void {
    updateRubric((r) => {
      const dims = r.dimensions.map((dim) => {
        if (dim.key !== dimKey) return dim;
        const lines = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        const bands = { ...dim.bands };
        if (lines.length === 0) delete bands[value];
        else bands[value] = lines;
        return { ...dim, bands };
      });
      return { ...r, dimensions: dims };
    });
  }

  function removeOutOfScaleBand(dimKey: string, value: string): void {
    updateRubric((r) => ({
      ...r,
      dimensions: r.dimensions.map((dim) => {
        if (dim.key !== dimKey) return dim;
        const bands = { ...dim.bands };
        delete bands[value];
        return { ...dim, bands };
      }),
    }));
  }

  function addSubFactor(dimKey: string): void {
    updateRubric((r) => ({
      ...r,
      dimensions: r.dimensions.map((dim) =>
        dim.key === dimKey ? { ...dim, sub_factors: [...dim.sub_factors, { label: '', by_band: {} }] } : dim,
      ),
    }));
  }

  function updateSubFactor(dimKey: string, idx: number, patch: Partial<RubricSubFactor>): void {
    updateRubric((r) => ({
      ...r,
      dimensions: r.dimensions.map((dim) =>
        dim.key === dimKey
          ? { ...dim, sub_factors: dim.sub_factors.map((sf, i) => (i === idx ? { ...sf, ...patch } : sf)) }
          : dim,
      ),
    }));
  }

  function removeSubFactor(dimKey: string, idx: number): void {
    updateRubric((r) => ({
      ...r,
      dimensions: r.dimensions.map((dim) =>
        dim.key === dimKey ? { ...dim, sub_factors: dim.sub_factors.filter((_, i) => i !== idx) } : dim,
      ),
    }));
  }

  function addComment(): void {
    updateRubric((r) => ({ ...r, comment_bank: [...r.comment_bank, { dimension: null, intent: null, text: '' }] }));
  }

  function updateComment(idx: number, patch: Partial<CommentBankEntry>): void {
    updateRubric((r) => ({ ...r, comment_bank: r.comment_bank.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  }

  function removeComment(idx: number): void {
    updateRubric((r) => ({ ...r, comment_bank: r.comment_bank.filter((_, i) => i !== idx) }));
  }

  const pronunciationMissing = draft ? !draft.rubric.dimensions.some((d) => d.key === 'pronunciation') : false;

  async function submit(): Promise<void> {
    if (!draft || !draft.courseId) return;
    setSaving(true);
    setFormError(null);
    try {
      // FR-18.2/.3: drop empty comment rows / empty sub-factors before sending.
      const rubric: RubricV2 = {
        ...draft.rubric,
        comment_bank: draft.rubric.comment_bank.filter((c) => c.text.trim().length > 0),
        dimensions: draft.rubric.dimensions.map((dim) => ({
          ...dim,
          sub_factors: dim.sub_factors.filter((sf) => sf.label.trim() !== '' || Object.keys(sf.by_band).length > 0),
        })),
      };
      const res = await api.post<{ version: number }>('/criteria/json', {
        courseId: draft.courseId,
        templateKey: draft.templateKey,
        title: draft.title || undefined,
        rubric,
      });
      setBanner(t('authoring.savedVersion', { version: res.version }));
      setBaseline(JSON.parse(JSON.stringify(draft)));
      onSaved(res.version);
    } catch (err) {
      setFormError(describeApiError(err, t));
    } finally {
      setSaving(false);
    }
  }

  const scaleValues = useMemo(() => (draft ? bandValues(draft.rubric.scale) : []), [draft]);
  const bandCapExceeded = scaleValues.length === 0 && draft && draft.rubric.scale.max > draft.rubric.scale.min;

  return (
    <>
      <Drawer
        open={open}
        onRequestClose={requestClose}
        title={t('authoring.title')}
        size="lg"
        closeLabel={t('drawer.close')}
        footer={
          step === 'form' && draft ? (
            <>
              <Button variant="ghost" onClick={backToSelect} disabled={saving || !!initialCriteria}>
                {t('authoring.selectTemplate')}
              </Button>
              <Button onClick={submit} disabled={saving || pronunciationMissing || !draft.courseId}>
                {t('criteria.save')}
              </Button>
            </>
          ) : undefined
        }
      >
        {banner && (
          <Alert variant="default" role="status" className="mb-4">
            {banner}
          </Alert>
        )}
        {loadError && (
          <Alert variant="destructive" role="alert">
            {loadError}
          </Alert>
        )}

        {step === 'select' && (
          <div className="max-w-sm space-y-4">
            <div>
              <Label htmlFor="auth-course">{t('authoring.courseStep')}</Label>
              <SelectNative id="auth-course" value={selectCourseId} onChange={(e) => setSelectCourseId(e.target.value)}>
                <option value="">{t('criteria.selectCourse')}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.key}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div>
              <Label htmlFor="auth-template">{t('authoring.templateStep')}</Label>
              <SelectNative
                id="auth-template"
                value={selectTemplateKey}
                disabled={!selectCourseId}
                onChange={(e) => setSelectTemplateKey(e.target.value)}
              >
                <option value="">{t('authoring.selectTemplate')}</option>
                {(templates ?? []).map((tp) => (
                  <option key={tp.key} value={tp.key}>
                    {tp.name}
                  </option>
                ))}
              </SelectNative>
            </div>
            <Button onClick={startFromTemplate} disabled={!selectCourseId || !selectTemplateKey}>
              {t('authoring.title')}
            </Button>
          </div>
        )}

        {step === 'form' && draft && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="space-y-6 lg:w-3/5">
              {formError && (
                <Alert variant="destructive" role="alert">
                  <p className="font-medium">{formError.heading}</p>
                  {formError.detail && <p>{formError.detail}</p>}
                  {formError.issues.length > 0 && (
                    <ul className="ml-4 list-disc">
                      {formError.issues.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}

              <div>
                <Label htmlFor="auth-title">{t('authoring.titleField')}</Label>
                <Input
                  id="auth-title"
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                />
              </div>

              {pronunciationMissing && (
                <Alert variant="destructive" role="alert">
                  {t('authoring.pronunciationMissing')}
                </Alert>
              )}

              {!pronunciationMissing && bandCapExceeded && (
                <Alert variant="warning" role="status">
                  {t('authoring.tooManyBands')}
                </Alert>
              )}

              {!pronunciationMissing && <h3 className="text-h2">{t('authoring.dimensions')}</h3>}

              {!pronunciationMissing &&
                orderedDimensions(draft.rubric).map((dim) => {
                  const outOfScale = Object.keys(dim.bands ?? {}).filter((k) => !scaleValues.includes(k));
                  const rows = scaleValues.length > 0 ? scaleValues : Object.keys(dim.bands ?? {});
                  return (
                    <section key={dim.key} className="space-y-3 border-b border-border pb-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-h3">{dim.label}</h3>
                        {dim.key === 'pronunciation' && (
                          <Tooltip label={t('authoring.pronunciationReason')}>
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <IconPin width={14} height={14} /> {t('authoring.pronunciationBadge')}
                            </Badge>
                          </Tooltip>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-body font-medium">{t('authoring.bands')}</p>
                        <p className="text-caption text-muted-foreground">{t('authoring.bandHint')}</p>
                        {rows.slice(0, BAND_ROW_CAP).map((value) => (
                          <div key={value} className="grid grid-cols-[5rem_1fr] items-start gap-2">
                            <Label htmlFor={`band-${dim.key}-${value}`} className="pt-2 text-table-head tabular-nums">
                              {t('authoring.band', { value })}
                            </Label>
                            <Textarea
                              id={`band-${dim.key}-${value}`}
                              rows={3}
                              aria-label={`${t('authoring.band', { value })} — ${dim.label}`}
                              value={(dim.bands?.[value] ?? []).join('\n')}
                              onChange={(e) => setBandLine(dim.key, value, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>

                      {outOfScale.length > 0 && (
                        <div className="space-y-2 rounded-md border-l-4 border-warning bg-warning/10 p-3">
                          <p className="text-caption font-medium text-warning">{t('authoring.outOfScale')}</p>
                          <p className="text-caption text-muted-foreground">{t('authoring.outOfScaleHint')}</p>
                          {outOfScale.map((value) => (
                            <div key={value} className="flex items-start gap-2">
                              <span className="w-20 pt-2 text-table-head tabular-nums">{value}</span>
                              <Textarea
                                rows={2}
                                aria-label={`${t('authoring.band', { value })} — ${dim.label} (${t('authoring.outOfScale')})`}
                                value={(dim.bands?.[value] ?? []).join('\n')}
                                onChange={(e) => setBandLine(dim.key, value, e.target.value)}
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('authoring.removeBand', { value })}
                                onClick={() => removeOutOfScaleBand(dim.key, value)}
                              >
                                <IconTrash />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-body font-medium">{t('authoring.subFactors')}</p>
                        <div className="overflow-x-auto">
                          {dim.sub_factors.map((sf, idx) => (
                            <div key={idx} className="mb-2 flex items-end gap-2">
                              <div>
                                <Label htmlFor={`sf-label-${dim.key}-${idx}`}>{t('authoring.subFactorLabel')}</Label>
                                <Input
                                  id={`sf-label-${dim.key}-${idx}`}
                                  className="w-40"
                                  value={sf.label}
                                  onChange={(e) => updateSubFactor(dim.key, idx, { label: e.target.value })}
                                />
                              </div>
                              {rows.slice(0, BAND_ROW_CAP).map((value) => (
                                <div key={value}>
                                  <Label htmlFor={`sf-${dim.key}-${idx}-${value}`}>{value}</Label>
                                  <Input
                                    id={`sf-${dim.key}-${idx}-${value}`}
                                    className="w-24"
                                    value={sf.by_band[value] ?? ''}
                                    onChange={(e) => {
                                      const byBand = { ...sf.by_band };
                                      if (e.target.value === '') delete byBand[value];
                                      else byBand[value] = e.target.value;
                                      updateSubFactor(dim.key, idx, { by_band: byBand });
                                    }}
                                  />
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('authoring.removeSubFactor', { label: sf.label || idx + 1 })}
                                onClick={() => removeSubFactor(dim.key, idx)}
                              >
                                <IconTrash />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => addSubFactor(dim.key)}>
                          <IconPlus /> {t('authoring.addSubFactor')}
                        </Button>
                      </div>
                    </section>
                  );
                })}

              {!pronunciationMissing && (
                <section className="space-y-2">
                  <h3 className="text-h3">{t('authoring.commentBank')}</h3>
                  {draft.rubric.comment_bank.map((c, idx) => (
                    <div key={idx} className="space-y-2 border-b border-border pb-2">
                      <div className="flex flex-wrap gap-2">
                        <div>
                          <Label htmlFor={`cb-dim-${idx}`}>{t('authoring.cbDimension')}</Label>
                          <SelectNative
                            id={`cb-dim-${idx}`}
                            value={c.dimension ?? ''}
                            onChange={(e) => updateComment(idx, { dimension: e.target.value || null })}
                          >
                            <option value="">{t('authoring.cbShared')}</option>
                            {draft.rubric.dimensions.map((dim) => (
                              <option key={dim.key} value={dim.key}>
                                {dim.label}
                              </option>
                            ))}
                            {c.dimension && !draft.rubric.dimensions.some((dim) => dim.key === c.dimension) && (
                              <option value={c.dimension}>{c.dimension}</option>
                            )}
                          </SelectNative>
                        </div>
                        <div>
                          <Label htmlFor={`cb-intent-${idx}`}>{t('authoring.cbIntent')}</Label>
                          <Input
                            id={`cb-intent-${idx}`}
                            list="cb-intent-suggestions"
                            value={c.intent ?? ''}
                            onChange={(e) => updateComment(idx, { intent: e.target.value || null })}
                          />
                        </div>
                        <Button variant="outline" size="icon" aria-label={t('authoring.removeComment', { index: idx + 1 })} onClick={() => removeComment(idx)}>
                          <IconTrash />
                        </Button>
                      </div>
                      <div>
                        <Label htmlFor={`cb-text-${idx}`}>{t('authoring.cbText')}</Label>
                        <Textarea id={`cb-text-${idx}`} value={c.text} onChange={(e) => updateComment(idx, { text: e.target.value })} />
                      </div>
                    </div>
                  ))}
                  <datalist id="cb-intent-suggestions">
                    <option value={t('authoring.intentPraise')} />
                    <option value={t('authoring.intentSuggest')} />
                  </datalist>
                  <Button variant="outline" size="sm" onClick={addComment}>
                    <IconPlus /> {t('authoring.addComment')}
                  </Button>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-h3">{t('templates.locked')}</h3>
                {/* DEF-2/DEF-3 fix: show the actual loaded VALUE for every structural field (not
                    just its name), and render the padlock icon + "locked by template" reason ONLY
                    for paths actually present in the template's `locked[]` — an unlocked path gets
                    no padlock at all, just its value and the "edit in Drawer 1" pointer. */}
                {LOCK_PATHS.map((path) => {
                  const isLocked = lockedPaths.includes(path);
                  return (
                    <div key={path} className="flex flex-wrap items-start gap-2 rounded-md bg-muted p-2 text-caption text-muted-foreground">
                      {isLocked && <IconLock width={14} height={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                      <span className="font-medium text-foreground">{t(`templates.lockPath.${LOCK_I18N_SUFFIX[path]}`)}:</span>
                      <span>{lockPathValueText(path, draft.rubric, t)}</span>
                      {isLocked ? (
                        <span>({t('authoring.lockedReason', { template: templateName })} — {t('authoring.lockedWhere')})</span>
                      ) : (
                        <span>({t('authoring.lockedWhere')})</span>
                      )}
                    </div>
                  );
                })}
              </section>
            </div>

            <div className="lg:w-2/5">
              <PromptPreview rubric={draft.rubric} />
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={pendingClose !== null}
        title={t('drawer.unsavedTitle')}
        body={t('drawer.unsavedBody')}
        confirmLabel={t('drawer.unsavedDiscard')}
        cancelLabel={t('drawer.unsavedStay')}
        destructive
        onConfirm={() => {
          const fn = pendingClose;
          setPendingClose(null);
          fn?.();
        }}
        onCancel={() => setPendingClose(null)}
      />
    </>
  );
}
