import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import { Alert } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Drawer } from '../../components/ui/drawer';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { SelectNative } from '../../components/ui/select-native';
import { Textarea } from '../../components/ui/textarea';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconLock,
  IconPlus,
  IconRestore,
  IconTrash,
} from '../../components/icons';
import { describeApiError, levelIssueText } from './api-errors';
import { maxTotal, levelIssues, type RubricV2, type RubricDimensionV2, type RubricLevel } from '../../lib/rubric';

const LOCK_PATHS = [
  'scale',
  'aggregation',
  'levels',
  'output_fields',
  'dimensions[].key',
  'dimensions[].weight',
  'student_reply',
] as const;

const LOCK_I18N_SUFFIX: Record<(typeof LOCK_PATHS)[number], string> = {
  scale: 'scale',
  aggregation: 'aggregation',
  levels: 'levels',
  'output_fields': 'output_fields',
  'dimensions[].key': 'dimensions_key',
  'dimensions[].weight': 'dimensions_weight',
  student_reply: 'student_reply',
};

interface RubricTemplateRow {
  key: string;
  name: string;
  rubric: RubricV2;
  locked: string[];
  isSystem: boolean;
  isActive: boolean;
}

interface DimensionDraft {
  key: string;
  label: string;
  weight: string;
  bands: Record<string, string[]>;
  sub_factors: RubricDimensionV2['sub_factors'];
}

interface LevelDraft {
  min: string;
  max: string;
  code: string;
  label: string;
}

interface ButtonDraft {
  title: string;
  action: string;
}

interface StudentReplyDraft {
  show_total: boolean;
  show_level: boolean;
  template: string;
  buttons: ButtonDraft[];
}

interface TemplateFormModel {
  key: string;
  name: string;
  courseKey: string;
  taskType: string;
  tone: string;
  feedbackLanguage: string;
  scaleMin: string;
  scaleMax: string;
  scaleStep: string;
  aggMethod: string;
  aggRound: string;
  dimensions: DimensionDraft[];
  levels: LevelDraft[];
  outputComment: boolean;
  outputFix: boolean;
  studentReplyEnabled: boolean;
  studentReply: StudentReplyDraft;
  locked: string[];
}

function numOrEmpty(n: unknown): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(n) : '';
}

function blankModel(): TemplateFormModel {
  return {
    key: '',
    name: '',
    courseKey: '',
    taskType: 'speaking_clip',
    tone: 'khích lệ',
    feedbackLanguage: 'vi',
    scaleMin: '0',
    scaleMax: '5',
    scaleStep: '1',
    aggMethod: 'sum',
    aggRound: 'none',
    dimensions: [{ key: 'pronunciation', label: 'Phát âm', weight: '1', bands: {}, sub_factors: [] }],
    levels: [],
    outputComment: true,
    outputFix: true,
    studentReplyEnabled: false,
    studentReply: { show_total: false, show_level: false, template: '', buttons: [] },
    locked: [],
  };
}

function modelFromRow(key: string, name: string, rubric: RubricV2, locked: string[]): TemplateFormModel {
  return {
    key,
    name,
    courseKey: rubric.course_key ?? '',
    taskType: rubric.task_type ?? '',
    tone: rubric.tone ?? '',
    feedbackLanguage: rubric.feedback_language ?? '',
    scaleMin: numOrEmpty(rubric.scale?.min),
    scaleMax: numOrEmpty(rubric.scale?.max),
    scaleStep: numOrEmpty(rubric.scale?.step),
    aggMethod: rubric.aggregation?.method ?? 'sum',
    aggRound: rubric.aggregation?.round ?? 'none',
    dimensions: (rubric.dimensions ?? []).map((d) => ({
      key: d.key,
      label: d.label,
      weight: numOrEmpty(d.weight),
      bands: d.bands ?? {},
      sub_factors: d.sub_factors ?? [],
    })),
    levels: (rubric.levels ?? []).map((lv: RubricLevel) => ({
      min: numOrEmpty(lv.min),
      max: numOrEmpty(lv.max),
      code: lv.code ?? '',
      label: lv.label ?? '',
    })),
    outputComment: (rubric.output_fields ?? []).includes('comment'),
    outputFix: (rubric.output_fields ?? []).includes('fix'),
    studentReplyEnabled: rubric.student_reply !== null && rubric.student_reply !== undefined,
    studentReply: rubric.student_reply
      ? {
          show_total: rubric.student_reply.show_total,
          show_level: rubric.student_reply.show_level,
          template: rubric.student_reply.template,
          buttons: rubric.student_reply.buttons ?? [],
        }
      : { show_total: false, show_level: false, template: '', buttons: [] },
    locked: [...(locked ?? [])],
  };
}

function num(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Raw payload sent to the server — AC-13.6: blank numeric fields go through as `null`, never
 * coerced to a default. Dimension `bands`/`sub_factors` are carried through byte-identical
 * (AC-12.5) — Drawer 1 never rewrites content, only structure. */
function rubricFromModel(model: TemplateFormModel): unknown {
  const outputFields: string[] = [];
  if (model.outputComment) outputFields.push('comment');
  if (model.outputFix) outputFields.push('fix');
  return {
    schema_version: 2,
    course_key: model.courseKey,
    task_type: model.taskType,
    tone: model.tone,
    feedback_language: model.feedbackLanguage,
    scale: { min: num(model.scaleMin), max: num(model.scaleMax), step: num(model.scaleStep) },
    aggregation: { method: model.aggMethod, round: model.aggRound },
    levels: model.levels.map((lv) => ({ min: num(lv.min), max: num(lv.max), code: lv.code, label: lv.label })),
    output_fields: outputFields,
    dimensions: model.dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      weight: num(d.weight),
      bands: d.bands,
      sub_factors: d.sub_factors,
    })),
    comment_bank: [],
    student_reply: model.studentReplyEnabled
      ? {
          show_total: model.studentReply.show_total,
          show_level: model.studentReply.show_level,
          template: model.studentReply.template,
          buttons: model.studentReply.buttons,
        }
      : null,
  };
}

function modelToRubricV2(model: TemplateFormModel): RubricV2 {
  return rubricFromModel(model) as unknown as RubricV2;
}

function blockingIssues(model: TemplateFormModel, t: (k: string) => string): string[] {
  const out: string[] = [];
  if (model.key.trim() === '') out.push(t('templates.blocking.keyRequired'));
  if (model.name.trim() === '') out.push(t('templates.blocking.nameRequired'));
  if (model.dimensions.length === 0) out.push(t('templates.blocking.noDimensions'));
  else if (!model.dimensions.some((d) => d.key === 'pronunciation')) out.push(t('templates.blocking.missingPronunciation'));
  if (num(model.scaleMin) === null || num(model.scaleMax) === null || num(model.scaleStep) === null) {
    out.push(t('templates.blocking.numberRequired'));
  }
  if (model.dimensions.some((d) => num(d.weight) === null)) out.push(t('templates.blocking.numberRequired'));
  if (model.levels.some((lv) => num(lv.min) === null || num(lv.max) === null)) out.push(t('templates.blocking.numberRequired'));
  if (!model.outputComment && !model.outputFix) out.push(t('templates.blocking.noOutputFields'));
  return out;
}

type FormMode = 'create' | 'edit' | 'duplicate';

export function TemplateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RubricTemplateRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [mode, setMode] = useState<FormMode>('create');
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<TemplateFormModel>(blankModel());
  const [draft, setDraft] = useState<TemplateFormModel>(blankModel());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<{ heading: string; issues: string[]; detail?: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<null | (() => void)>(null);
  const [confirmAction, setConfirmAction] = useState<null | { title: string; body: string; destructive?: boolean; run: () => void }>(null);
  // DEF-4 fix: per-row in-flight tracking for Ẩn/Hiện, Xóa and Khôi phục (AC-14.11) — a double
  // click on any of the three must not fire the request twice.
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  // DEF-5 fix: AC-14.2 — a 409 "key already exists" must move focus to the `key` field. One ref
  // covers both the create/edit `key` input (`tpl-key`) and the duplicate flow's separate
  // `tpl-dup-key` input, since only one of the two is ever rendered at a time.
  const keyInputRef = useRef<HTMLInputElement>(null);

  async function withBusy(key: string, run: () => Promise<void>): Promise<void> {
    setBusyKeys((s) => new Set(s).add(key));
    try {
      await run();
    } finally {
      setBusyKeys((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  const dirty = view === 'form' && JSON.stringify(baseline) !== JSON.stringify(draft);

  function loadList(): void {
    setListError(null);
    api
      .get<RubricTemplateRow[]>('/criteria/templates?includeInactive=true')
      .then(setRows)
      .catch(() => setListError(t('errors.server')));
  }

  useEffect(() => {
    if (open) {
      loadList();
      setView('list');
      setBanner(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function requestClose(): void {
    if (dirty) {
      setPendingClose(() => onClose);
    } else {
      onClose();
    }
  }

  function openCreate(): void {
    const m = blankModel();
    setMode('create');
    setSourceKey(null);
    setBaseline(m);
    setDraft(m);
    setFormError(null);
    setView('form');
  }

  function openEdit(row: RubricTemplateRow): void {
    const m = modelFromRow(row.key, row.name, row.rubric, row.locked);
    setMode('edit');
    setSourceKey(row.key);
    setBaseline(m);
    setDraft(m);
    setFormError(null);
    setView('form');
  }

  function openDuplicate(row: RubricTemplateRow): void {
    const m = modelFromRow('', '', row.rubric, row.locked);
    setMode('duplicate');
    setSourceKey(row.key);
    setBaseline(m);
    setDraft(m);
    setFormError(null);
    setView('form');
  }

  function backToList(): void {
    if (dirty) {
      setPendingClose(() => () => setView('list'));
    } else {
      setView('list');
    }
  }

  async function submit(): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      const rubric = rubricFromModel(draft);
      const locked = draft.locked;
      if (mode === 'create') {
        await api.post('/criteria/templates', { key: draft.key, name: draft.name, rubric, locked });
      } else if (mode === 'duplicate' && sourceKey) {
        await api.post(`/criteria/templates/${sourceKey}/duplicate`, { key: draft.key, name: draft.name || undefined });
        // duplicate creates from the source; follow up with an update so edits made in the
        // pre-filled form (dimension removal, field tweaks) are not lost.
        await api.put(`/criteria/templates/${draft.key}`, { name: draft.name, rubric, locked });
      } else if (mode === 'edit' && sourceKey) {
        await api.put(`/criteria/templates/${sourceKey}`, { name: draft.name, rubric, locked });
      }
      setBanner(t('templates.saved'));
      setView('list');
      loadList();
    } catch (err) {
      const desc = describeApiError(err, t);
      setFormError(desc);
      if (err instanceof ApiError && err.status === 409 && err.serverMessage === 'template key already exists') {
        keyInputRef.current?.focus();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(row: RubricTemplateRow): Promise<void> {
    try {
      await api.delete(`/criteria/templates/${row.key}`);
      loadList();
    } catch (err) {
      const desc = describeApiError(err, t);
      setListError(`${desc.heading}${desc.detail ? ` — ${desc.detail}` : ''}`);
      loadList();
    }
  }

  async function toggleActive(row: RubricTemplateRow): Promise<void> {
    try {
      await api.patch(`/criteria/templates/${row.key}/active`, { isActive: !row.isActive });
      loadList();
    } catch {
      setListError(t('errors.server'));
    }
  }

  async function resetRow(row: RubricTemplateRow): Promise<void> {
    try {
      await api.post(`/criteria/templates/${row.key}/reset`, {});
      loadList();
    } catch (err) {
      const desc = describeApiError(err, t);
      setListError(`${desc.heading}${desc.detail ? ` — ${desc.detail}` : ''}`);
      loadList();
    }
  }

  const draftRubric = useMemo(() => modelToRubricV2(draft), [draft]);
  const computedMax = useMemo(() => maxTotal(draftRubric), [draftRubric]);
  const issues = useMemo(() => levelIssues(draftRubric), [draftRubric]);
  const blocking = useMemo(() => blockingIssues(draft, t), [draft, t]);
  const stepDoesNotDivide = useMemo(() => {
    const min = num(draft.scaleMin);
    const max = num(draft.scaleMax);
    const step = num(draft.scaleStep);
    if (min === null || max === null || step === null || step <= 0) return false;
    return Math.abs(((max - min) / step) % 1) > 1e-9;
  }, [draft.scaleMin, draft.scaleMax, draft.scaleStep]);

  function setDim(idx: number, patch: Partial<DimensionDraft>): void {
    setDraft((d) => ({ ...d, dimensions: d.dimensions.map((dim, i) => (i === idx ? { ...dim, ...patch } : dim)) }));
  }

  function removeDim(idx: number): void {
    const dim = draft.dimensions[idx];
    const hasContent = Object.keys(dim.bands ?? {}).length > 0 || (dim.sub_factors ?? []).length > 0;
    const run = () => setDraft((d) => ({ ...d, dimensions: d.dimensions.filter((_, i) => i !== idx) }));
    if (hasContent) {
      setConfirmAction({
        title: t('templates.removeDimension', { key: dim.key }),
        body: t('templates.removeDimensionConfirm'),
        destructive: true,
        run,
      });
    } else {
      run();
    }
  }

  function setLevel(idx: number, patch: Partial<LevelDraft>): void {
    setDraft((d) => ({ ...d, levels: d.levels.map((lv, i) => (i === idx ? { ...lv, ...patch } : lv)) }));
  }

  function moveLevel(idx: number, dir: -1 | 1): void {
    setDraft((d) => {
      const next = [...d.levels];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return d;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...d, levels: next };
    });
  }

  return (
    <>
      <Drawer
        open={open}
        onRequestClose={requestClose}
        title={t('templates.title')}
        size="md"
        closeLabel={t('drawer.close')}
        footer={
          view === 'form' ? (
            <>
              <Button variant="ghost" onClick={backToList} disabled={saving}>
                {t('templates.title')}
              </Button>
              <Button onClick={submit} disabled={saving || blocking.length > 0}>
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

        {view === 'list' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openCreate}>
                <IconPlus /> {t('templates.new')}
              </Button>
            </div>
            {listError && (
              <Alert variant="destructive" role="alert">
                {listError}{' '}
                <Button variant="link" size="sm" onClick={loadList}>
                  {t('errors.retry')}
                </Button>
              </Alert>
            )}
            {rows === null && !listError && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            )}
            {rows !== null && rows.length === 0 && !listError && (
              <p className="py-8 text-center text-body text-muted-foreground">{t('templates.empty')}</p>
            )}
            {rows !== null &&
              rows.map((row) => (
                <div key={row.key} className="space-y-1 border-b border-border py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-medium">{row.name}</span>
                    {row.isSystem && <Badge variant="secondary">{t('templates.badgeSystem')}</Badge>}
                    {!row.isActive && <Badge variant="outline">{t('templates.badgeInactive')}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
                    <span className="font-mono">{row.key}</span>
                    <span>{t('templates.maxTotal', { value: maxTotal(row.rubric) })}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                      {t('templates.edit')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openDuplicate(row)}>
                      <IconCopy /> {t('templates.duplicate')}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={busyKeys.has(row.key)}
                      aria-label={row.isActive ? `${t('templates.hide')} ${row.name}` : `${t('templates.show')} ${row.name}`}
                      onClick={() => withBusy(row.key, () => toggleActive(row))}
                    >
                      {row.isActive ? <IconEyeOff /> : <IconEye />}
                    </Button>
                    {!row.isSystem && (
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={busyKeys.has(row.key)}
                        aria-label={`${t('templates.delete')} ${row.name}`}
                        onClick={() =>
                          setConfirmAction({
                            title: t('templates.confirmDeleteTitle'),
                            body: t('templates.confirmDeleteBody'),
                            destructive: true,
                            run: () => withBusy(row.key, () => deleteRow(row)),
                          })
                        }
                      >
                        <IconTrash />
                      </Button>
                    )}
                    {row.isSystem && (
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={busyKeys.has(row.key)}
                        aria-label={`${t('templates.reset')} ${row.name}`}
                        onClick={() =>
                          setConfirmAction({
                            title: t('templates.confirmResetTitle'),
                            body: t('templates.confirmResetBody'),
                            destructive: true,
                            run: () => withBusy(row.key, () => resetRow(row)),
                          })
                        }
                      >
                        <IconRestore />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {view === 'form' && (
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <button type="button" className="text-caption text-primary underline" onClick={backToList}>
              ← {t('templates.title')}
            </button>

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

            {mode === 'duplicate' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tpl-dup-key">{t('templates.duplicateKeyLabel')}</Label>
                  <Input ref={keyInputRef} id="tpl-dup-key" value={draft.key} onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tpl-dup-name">{t('templates.duplicateNameLabel')}</Label>
                  <Input id="tpl-dup-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </div>
              </div>
            )}

            <section className="space-y-3">
              <h3 className="text-h3">{t('templates.title')}</h3>
              {mode !== 'duplicate' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="tpl-key">{t('templates.key')}</Label>
                    {mode === 'edit' ? (
                      <>
                        <Input id="tpl-key" value={draft.key} readOnly aria-disabled="true" className="bg-muted text-muted-foreground" />
                        <p className="mt-1 flex items-center gap-1 text-caption text-muted-foreground">
                          <IconLock width={14} height={14} /> {t('templates.keyImmutable')}
                        </p>
                      </>
                    ) : (
                      <Input ref={keyInputRef} id="tpl-key" value={draft.key} onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <Label htmlFor="tpl-name">{t('templates.name')}</Label>
                    <Input id="tpl-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tpl-course-key">{t('templates.courseKey')}</Label>
                  <Input id="tpl-course-key" value={draft.courseKey} onChange={(e) => setDraft((d) => ({ ...d, courseKey: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tpl-task-type">{t('templates.taskType')}</Label>
                  <Input id="tpl-task-type" value={draft.taskType} onChange={(e) => setDraft((d) => ({ ...d, taskType: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tpl-tone">{t('templates.tone')}</Label>
                  <Input id="tpl-tone" value={draft.tone} onChange={(e) => setDraft((d) => ({ ...d, tone: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tpl-lang">{t('templates.feedbackLanguage')}</Label>
                  <Input id="tpl-lang" value={draft.feedbackLanguage} onChange={(e) => setDraft((d) => ({ ...d, feedbackLanguage: e.target.value }))} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-h3">{t('templates.scale')}</h3>
                <Badge>{t('templates.maxTotal', { value: computedMax })}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="tpl-scale-min">{t('templates.scaleMin')}</Label>
                  <Input id="tpl-scale-min" type="number" value={draft.scaleMin} onChange={(e) => setDraft((d) => ({ ...d, scaleMin: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tpl-scale-max">{t('templates.scaleMax')}</Label>
                  <Input id="tpl-scale-max" type="number" value={draft.scaleMax} onChange={(e) => setDraft((d) => ({ ...d, scaleMax: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tpl-scale-step">{t('templates.scaleStep')}</Label>
                  <Input id="tpl-scale-step" type="number" value={draft.scaleStep} onChange={(e) => setDraft((d) => ({ ...d, scaleStep: e.target.value }))} />
                  {stepDoesNotDivide && <p className="mt-1 text-caption text-warning">{t('templates.stepHint')}</p>}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tpl-agg-method">{t('templates.aggregationMethod')}</Label>
                  <SelectNative
                    id="tpl-agg-method"
                    value={draft.aggMethod}
                    onChange={(e) => setDraft((d) => ({ ...d, aggMethod: e.target.value }))}
                  >
                    <option value="sum">{t('templates.method.sum')}</option>
                    <option value="average">{t('templates.method.average')}</option>
                    <option value="weighted_average">{t('templates.method.weighted_average')}</option>
                  </SelectNative>
                </div>
                <div>
                  <Label htmlFor="tpl-agg-round">{t('templates.aggregationRound')}</Label>
                  <SelectNative id="tpl-agg-round" value={draft.aggRound} onChange={(e) => setDraft((d) => ({ ...d, aggRound: e.target.value }))}>
                    <option value="none">{t('templates.round.none')}</option>
                    <option value="nearest_int">{t('templates.round.nearest_int')}</option>
                  </SelectNative>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-h3">{t('templates.dimensions')}</h3>
              {draft.dimensions.map((dim, idx) => (
                <div key={idx} className="flex flex-wrap items-end gap-2 border-b border-border pb-2">
                  <div>
                    <Label htmlFor={`dim-key-${idx}`}>{t('templates.dimKey')}</Label>
                    <Input id={`dim-key-${idx}`} value={dim.key} onChange={(e) => setDim(idx, { key: e.target.value })} className="w-40" />
                  </div>
                  <div>
                    <Label htmlFor={`dim-label-${idx}`}>{t('templates.dimLabel')}</Label>
                    <Input id={`dim-label-${idx}`} value={dim.label} onChange={(e) => setDim(idx, { label: e.target.value })} className="w-40" />
                  </div>
                  <div>
                    <Label htmlFor={`dim-weight-${idx}`}>{t('templates.dimWeight')}</Label>
                    <Input
                      id={`dim-weight-${idx}`}
                      type="number"
                      value={dim.weight}
                      onChange={(e) => setDim(idx, { weight: e.target.value })}
                      className="w-24"
                    />
                  </div>
                  <Button variant="outline" size="icon" aria-label={t('templates.removeDimension', { key: dim.key || idx })} onClick={() => removeDim(idx)}>
                    <IconTrash />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={() => setDraft((d) => ({ ...d, dimensions: [...d.dimensions, { key: '', label: '', weight: '1', bands: {}, sub_factors: [] }] }))}>
                <IconPlus /> {t('templates.addDimension')}
              </Button>
            </section>

            <section className="space-y-3">
              <h3 className="text-h3">{t('templates.levels')}</h3>
              {issues.length > 0 && (
                <div role="status" className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-caption">
                  <p className="flex items-center gap-1 font-medium text-warning">
                    <IconAlertTriangle width={16} height={16} /> {t('templates.levels')}
                  </p>
                  <ul className="ml-4 list-disc">
                    {issues.map((iss, i) => (
                      <li key={i}>{levelIssueText(iss, t)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {draft.levels.map((lv, idx) => {
                const flagged = issues.some((iss) => iss.index === idx);
                return (
                  <div key={idx} className={`flex flex-wrap items-end gap-2 border-b pb-2 ${flagged ? 'border-warning' : 'border-border'}`}>
                    <div>
                      <Label htmlFor={`lv-min-${idx}`}>{t('templates.levelMin')}</Label>
                      <Input id={`lv-min-${idx}`} type="number" value={lv.min} onChange={(e) => setLevel(idx, { min: e.target.value })} className="w-20" />
                    </div>
                    <div>
                      <Label htmlFor={`lv-max-${idx}`}>{t('templates.levelMax')}</Label>
                      <Input id={`lv-max-${idx}`} type="number" value={lv.max} onChange={(e) => setLevel(idx, { max: e.target.value })} className="w-20" />
                    </div>
                    <div>
                      <Label htmlFor={`lv-code-${idx}`}>{t('templates.levelCode')}</Label>
                      <Input id={`lv-code-${idx}`} value={lv.code} onChange={(e) => setLevel(idx, { code: e.target.value })} className="w-24" />
                    </div>
                    <div>
                      <Label htmlFor={`lv-label-${idx}`}>{t('templates.levelLabel')}</Label>
                      <Input id={`lv-label-${idx}`} value={lv.label} onChange={(e) => setLevel(idx, { label: e.target.value })} className="w-32" />
                    </div>
                    <Button variant="outline" size="icon" aria-label={`${t('templates.levelLabel')} ${idx + 1} ↑`} onClick={() => moveLevel(idx, -1)}>
                      <IconChevronUp />
                    </Button>
                    <Button variant="outline" size="icon" aria-label={`${t('templates.levelLabel')} ${idx + 1} ↓`} onClick={() => moveLevel(idx, 1)}>
                      <IconChevronDown />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t('templates.removeLevel', { index: idx + 1 })}
                      onClick={() => setDraft((d) => ({ ...d, levels: d.levels.filter((_, i) => i !== idx) }))}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                onClick={() => setDraft((d) => ({ ...d, levels: [...d.levels, { min: '', max: '', code: '', label: '' }] }))}
              >
                <IconPlus /> {t('templates.addLevel')}
              </Button>
            </section>

            <section className="space-y-2">
              <h3 className="text-h3">{t('templates.outputFields')}</h3>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.outputComment} onChange={(e) => setDraft((d) => ({ ...d, outputComment: e.target.checked }))} className="h-4 w-4 accent-primary" />
                {t('templates.outputComment')}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.outputFix} onChange={(e) => setDraft((d) => ({ ...d, outputFix: e.target.checked }))} className="h-4 w-4 accent-primary" />
                {t('templates.outputFix')}
              </label>
            </section>

            <section className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.studentReplyEnabled}
                  onChange={(e) => setDraft((d) => ({ ...d, studentReplyEnabled: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-h3">{t('templates.studentReply')}</span>
              </label>
              {draft.studentReplyEnabled && (
                <div className="space-y-2 pl-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.studentReply.show_total}
                      onChange={(e) => setDraft((d) => ({ ...d, studentReply: { ...d.studentReply, show_total: e.target.checked } }))}
                      className="h-4 w-4 accent-primary"
                    />
                    {t('templates.showTotal')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.studentReply.show_level}
                      onChange={(e) => setDraft((d) => ({ ...d, studentReply: { ...d.studentReply, show_level: e.target.checked } }))}
                      className="h-4 w-4 accent-primary"
                    />
                    {t('templates.showLevel')}
                  </label>
                  <div>
                    <Label htmlFor="tpl-reply-template">{t('templates.replyTemplate')}</Label>
                    <Textarea
                      id="tpl-reply-template"
                      value={draft.studentReply.template}
                      onChange={(e) => setDraft((d) => ({ ...d, studentReply: { ...d.studentReply, template: e.target.value } }))}
                    />
                  </div>
                  <p className="text-body font-medium">{t('templates.buttons')}</p>
                  {draft.studentReply.buttons.map((b, idx) => (
                    <div key={idx} className="flex flex-wrap items-end gap-2">
                      <div>
                        <Label htmlFor={`btn-title-${idx}`}>{t('templates.buttonTitle')}</Label>
                        <Input
                          id={`btn-title-${idx}`}
                          maxLength={100}
                          value={b.title}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              studentReply: {
                                ...d.studentReply,
                                buttons: d.studentReply.buttons.map((bb, i) => (i === idx ? { ...bb, title: e.target.value } : bb)),
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`btn-action-${idx}`}>{t('templates.buttonAction')}</Label>
                        <Input
                          id={`btn-action-${idx}`}
                          value={b.action}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              studentReply: {
                                ...d.studentReply,
                                buttons: d.studentReply.buttons.map((bb, i) => (i === idx ? { ...bb, action: e.target.value } : bb)),
                              },
                            }))
                          }
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={t('templates.removeButton', { index: idx + 1 })}
                        onClick={() =>
                          setDraft((d) => ({ ...d, studentReply: { ...d.studentReply, buttons: d.studentReply.buttons.filter((_, i) => i !== idx) } }))
                        }
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => setDraft((d) => ({ ...d, studentReply: { ...d.studentReply, buttons: [...d.studentReply.buttons, { title: '', action: '' }] } }))}
                  >
                    <IconPlus /> {t('templates.addButton')}
                  </Button>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-h3">{t('templates.locked')}</h3>
              {LOCK_PATHS.map((path) => (
                <label key={path} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.locked.includes(path)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        locked: e.target.checked ? [...new Set([...d.locked, path])] : d.locked.filter((p) => p !== path),
                      }))
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  {t(`templates.lockPath.${LOCK_I18N_SUFFIX[path]}`)}
                </label>
              ))}
              <p className="text-caption text-muted-foreground">{t('templates.lockedHint')}</p>
            </section>

            {blocking.length > 0 && (
              <Alert variant="destructive" role="alert">
                <ul className="ml-4 list-disc">
                  {blocking.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </form>
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
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ''}
        body={confirmAction?.body ?? ''}
        confirmLabel={t('templates.delete')}
        cancelLabel={t('drawer.unsavedStay')}
        destructive={confirmAction?.destructive}
        onConfirm={() => {
          confirmAction?.run();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}

// Re-exported so RubricDrawer can reuse the exact lock-path label mapping without duplicating it.
export { LOCK_PATHS, LOCK_I18N_SUFFIX };
export type { RubricTemplateRow };
