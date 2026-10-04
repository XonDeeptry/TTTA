import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Drawer } from '../components/ui/drawer';
import { Input } from '../components/ui/input';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { IconCriteria } from '../components/icons';
import { TemplateDrawer } from './criteria/TemplateDrawer';
import { ScriptsTab } from './criteria/ScriptsTab';
import { RubricDrawer } from './criteria/RubricDrawer';
import { ReadingTextCell } from './criteria/ReadingTextCell';
import { RubricSummary } from './criteria/RubricSummary';

interface CriteriaItem {
  id: number;
  courseId: number;
  title: string;
  version: number;
  rubric: unknown;
  templateKey?: string | null;
  createdAt: string;
}

interface ClassConfig {
  className: string;
  advisorZaloId: string;
  autoSend: boolean;
  /** null = lớp dùng bản tiêu chí mới nhất của khóa (mặc định). */
  criteriaId: number | null;
  /** D151: văn bản bài đọc hiện tại — có thì Azure chấm theo văn bản. */
  readingText: string | null;
}

/** Một hàng của `GET /classes-config/overview`: mọi lớp có học viên, kể cả lớp chưa cấu hình. */
interface ClassOverview {
  className: string;
  studentCount: number;
  courses: CourseOption[];
  config: Omit<ClassConfig, 'className'> | null;
  effective: {
    id: number;
    title: string;
    version: number;
    templateKey: string | null;
    source: 'pinned' | 'course_latest';
  } | null;
  warnings: string[];
}

interface CourseOption {
  id: number;
  key: string;
}

interface TemplateRow {
  key: string;
  name: string;
  rubric: { scale?: { min?: number; max?: number }; aggregation?: { method?: string }; dimensions?: unknown[] };
  isSystem: boolean;
  isActive: boolean;
}

type TabId = 'courses' | 'classes' | 'rubrics' | 'scripts';
const TABS: TabId[] = ['courses', 'classes', 'rubrics', 'scripts'];

/**
 * Trang Tiêu chí, chia 3 tab (pilot 09-15): trước đây là một chuỗi nút bấm — "Cấu trúc chấm điểm",
 * "Soạn nội dung", ô chọn courseId — mà không tab nào cho thấy ĐANG áp dụng gì. Đội học thuật không
 * phải người IT: mỗi tab mở ra là thấy ngay trạng thái hiện tại, nút sửa nằm cạnh thứ nó sửa.
 * Tab đang mở nằm trên URL (`?tab=`) để trang Hướng dẫn chỉ thẳng tới đó.
 */
export function Criteria() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabId = TABS.includes(searchParams.get('tab') as TabId) ? (searchParams.get('tab') as TabId) : 'courses';

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassOverview[]>([]);
  const [classDrafts, setClassDrafts] = useState<Record<string, Partial<ClassConfig>>>({});
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [allCriteria, setAllCriteria] = useState<CriteriaItem[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [viewing, setViewing] = useState<CriteriaItem | null>(null);
  const [promptCourseId, setPromptCourseId] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  // F12 — privilege-driven drawer entry points (AC-10.1: `privileges.includes(...)` only, never
  // a client-side "admin has everything" rule — the server already expands that, F10 AC-11.2).
  const privileges = user?.privileges ?? [];
  const canTemplates = privileges.includes('rubric_template');
  const canAuthor = privileges.includes('criteria_author');
  const [activeDrawer, setActiveDrawer] = useState<'template' | 'authoring' | null>(null);
  const [editingCriteria, setEditingCriteria] = useState<{ id: number; courseId: number } | null>(null);

  function loadClasses(): void {
    void api.get<ClassOverview[]>('/classes-config/overview').then(setClasses);
  }

  function loadCriteria(): void {
    void api.get<CriteriaItem[]>('/criteria').then(setAllCriteria);
  }

  function loadTemplates(): void {
    // Người không có quyền xem mẫu ⇒ 403: bảng chỉ hiện thông báo, không làm hỏng trang.
    api
      .get<TemplateRow[]>('/criteria/templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }

  useEffect(() => {
    loadClasses();
    loadCriteria();
    loadTemplates();
    void api.get<CourseOption[]>('/courses').then(setCourses);
  }, []);

  function selectTab(next: TabId): void {
    setSearchParams(next === 'courses' ? {} : { tab: next });
  }

  async function upload(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setUploadError(null);
    // Raw multipart fetch — deliberately NOT routed through api/client.ts so the
    // browser sets the multipart boundary itself (F3-ba §1.9 highest-risk item).
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/criteria', { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUploadError(body.message ?? `Upload failed: ${res.status}`);
      return;
    }
    loadCriteria();
    loadClasses();
  }

  async function saveClassConfig(className: string): Promise<void> {
    const draft = classDrafts[className] ?? {};
    const existing = classes.find((c) => c.className === className)?.config;
    await api.put(`/classes-config/${className}`, {
      advisorZaloId: draft.advisorZaloId ?? existing?.advisorZaloId ?? '',
      autoSend: draft.autoSend ?? existing?.autoSend ?? false,
      // D151: `!== undefined` chứ không `??` — chuỗi rỗng là giá trị CÓ NGHĨA (xóa bài đọc).
      readingText: draft.readingText !== undefined ? draft.readingText : (existing?.readingText ?? null),
      // `null` là giá trị CÓ NGHĨA ở đây (gỡ ghim, quay về bản mới nhất của khóa), nên dùng
      // `??` chứ không phải `||` — `|| null` sẽ nuốt mất id hợp lệ nếu nó là 0.
      criteriaId: draft.criteriaId ?? existing?.criteriaId ?? null,
    });
    loadClasses();
  }

  async function showPrompt(courseIdValue: string): Promise<void> {
    setPromptCourseId(courseIdValue);
    setPrompt(null);
    setPromptError(null);
    const latest = versionsOf(Number(courseIdValue))[0];
    if (!latest) {
      if (courseIdValue) setPromptError(t('criteria.noCriteriaYet'));
      return;
    }
    try {
      const res = await api.post<{ prompt: string }>('/criteria/prompt-preview', { rubric: latest.rubric });
      setPrompt(res.prompt);
    } catch (err) {
      setPromptError((err as Error).message);
    }
  }

  function versionsOf(courseIdValue: number): CriteriaItem[] {
    return allCriteria.filter((c) => c.courseId === courseIdValue).sort((a, b) => b.version - a.version);
  }

  function courseKey(id: number): string {
    return courses.find((o) => o.id === id)?.key ?? `#${id}`;
  }

  /** Nhãn ô chọn: khóa · tiêu đề (vN) — cần khóa vì ghim chỉ có hiệu lực trong đúng khóa đó. */
  function criteriaLabel(c: CriteriaItem): string {
    return `${courseKey(c.courseId)} · ${c.title} (v${c.version})`;
  }

  function editCriteria(c: CriteriaItem): void {
    setViewing(null);
    setEditingCriteria({ id: c.id, courseId: c.courseId });
    setActiveDrawer('authoring');
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('criteria.title')}</h1>

      <div role="tablist" aria-label={t('criteria.title')} className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={
              'rounded-t-md border-b-2 px-4 py-2 text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
              (tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t(`criteria.tab.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'courses' && (
        <section role="tabpanel" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-body text-foreground/80">{t('criteria.tabHint.courses')}</p>
            {canAuthor && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingCriteria(null);
                  setActiveDrawer('authoring');
                }}
              >
                <IconCriteria /> {t('authoring.open')}
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('criteria.course')}</TableHead>
                    <TableHead scope="col">{t('criteria.colCurrent')}</TableHead>
                    <TableHead scope="col">{t('criteria.colHistory')}</TableHead>
                    <TableHead scope="col">{t('criteria.colUsage')}</TableHead>
                    <TableHead scope="col" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...courses]
                    .sort((a, b) => a.key.localeCompare(b.key))
                    .map((course) => {
                      const versions = versionsOf(course.id);
                      const latest = versions[0];
                      const using = classes.filter((c) => c.courses.some((x) => x.id === course.id));
                      const students = using.reduce((sum, c) => sum + c.studentCount, 0);
                      return (
                        <TableRow key={course.id}>
                          <TableCell className="font-medium">{course.key}</TableCell>
                          <TableCell>
                            {latest ? (
                              <div className="space-y-1">
                                <div>
                                  {latest.title} · v{latest.version}
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  {latest.templateKey && <Badge variant="outline">{latest.templateKey}</Badge>}
                                  <span className="text-caption text-muted-foreground">
                                    {new Date(latest.createdAt).toLocaleDateString('vi-VN')}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <Badge variant="warning">{t('criteria.noCriteriaYet')}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {versions.slice(1).map((v) => (
                                <Button key={v.id} size="sm" variant="ghost" onClick={() => setViewing(v)}>
                                  v{v.version}
                                </Button>
                              ))}
                              {versions.length <= 1 && <span className="text-muted-foreground">—</span>}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {t('criteria.usage', { classes: using.length, students })}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1">
                              {latest && (
                                <Button size="sm" variant="outline" onClick={() => setViewing(latest)}>
                                  {t('criteria.view')}
                                </Button>
                              )}
                              {latest && canAuthor && (
                                <Button size="sm" variant="outline" onClick={() => editCriteria(latest)}>
                                  {t('templates.edit')}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}

      {tab === 'classes' && (
        <section role="tabpanel" className="space-y-3">
          <p className="max-w-3xl text-body text-foreground/80">{t('criteria.tabHint.classes')}</p>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('criteria.className')}</TableHead>
                    <TableHead scope="col">{t('criteria.course')}</TableHead>
                    <TableHead scope="col">{t('criteria.effectiveCriteria')}</TableHead>
                    <TableHead scope="col">{t('criteria.pinCriteria')}</TableHead>
                    <TableHead scope="col">{t('criteria.advisorZaloId')}</TableHead>
                    <TableHead scope="col">{t('criteria.autoSend')}</TableHead>
                    <TableHead scope="col" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((c) => (
                    <TableRow key={c.className}>
                      <TableCell>
                        <div>{c.className}</div>
                        <div className="text-caption text-muted-foreground">
                          {t('criteria.studentCount', { count: c.studentCount })}
                        </div>
                      </TableCell>
                      <TableCell>{c.courses.map((course) => course.key).join(', ')}</TableCell>
                      <TableCell>
                        {/* Bộ tiêu chí grading-worker thật sự dùng — đội học thuật kiểm thử cần thấy ngay (pilot 09-15). */}
                        <div className="space-y-1">
                          {c.effective ? (
                            <>
                              <div>
                                {c.effective.title} · v{c.effective.version}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={c.effective.source === 'pinned' ? 'default' : 'secondary'}>
                                  {t(c.effective.source === 'pinned' ? 'criteria.sourcePinned' : 'criteria.sourceCourseLatest')}
                                </Badge>
                                {c.effective.templateKey && <Badge variant="outline">{c.effective.templateKey}</Badge>}
                              </div>
                            </>
                          ) : (
                            <div className="text-muted-foreground">{t('criteria.noEffective')}</div>
                          )}
                          {c.warnings.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {c.warnings.map((w) => (
                                <Badge key={w} variant="warning">
                                  {t(`criteria.warning.${w}`)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <SelectNative
                          defaultValue={c.config?.criteriaId == null ? '' : String(c.config.criteriaId)}
                          aria-label={t('criteria.pinCriteria')}
                          className="max-w-[16rem]"
                          onChange={(e) =>
                            setClassDrafts((d) => ({
                              ...d,
                              [c.className]: {
                                ...d[c.className],
                                criteriaId: e.target.value === '' ? null : Number(e.target.value),
                              },
                            }))
                          }
                        >
                          <option value="">{t('criteria.classCriteriaDefault')}</option>
                          {/* Chỉ tiêu chí của đúng khóa: ghim khác khóa bị worker bỏ qua, nên không cho chọn. */}
                          {allCriteria
                            .filter((item) => c.courses.some((course) => course.id === item.courseId))
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {criteriaLabel(item)}
                              </option>
                            ))}
                        </SelectNative>
                        {/* D151: có bài đọc ⇒ Azure chấm theo văn bản; bắt buộc để điểm phát âm của trẻ đáng tin (spec §13A). */}
                        <ReadingTextCell className={c.className} config={c.config} onSaved={loadClasses} />
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={c.config?.advisorZaloId ?? ''}
                          onChange={(e) =>
                            setClassDrafts((d) => ({ ...d, [c.className]: { ...d[c.className], advisorZaloId: e.target.value } }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          defaultChecked={c.config?.autoSend ?? false}
                          onChange={(e) =>
                            setClassDrafts((d) => ({ ...d, [c.className]: { ...d[c.className], autoSend: e.target.checked } }))
                          }
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => saveClassConfig(c.className)}>
                          {t('criteria.save')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}

      {tab === 'scripts' && <ScriptsTab canEdit={canAuthor || canTemplates} />}

      {tab === 'rubrics' && (
        <section role="tabpanel" className="space-y-6">
          <p className="max-w-3xl text-body text-foreground/80">{t('criteria.tabHint.rubrics')}</p>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{t('criteria.templatesHeading')}</CardTitle>
              {canTemplates && (
                <Button variant="outline" onClick={() => setActiveDrawer('template')}>
                  <IconCriteria /> {t('templates.open')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-body text-foreground/80">{t('criteria.templatesHint')}</p>
              {templates && templates.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">{t('templates.name')}</TableHead>
                        <TableHead scope="col">{t('templates.key')}</TableHead>
                        <TableHead scope="col">{t('templates.scale')}</TableHead>
                        <TableHead scope="col">{t('templates.aggregationMethod')}</TableHead>
                        <TableHead scope="col">{t('templates.dimensions')}</TableHead>
                        <TableHead scope="col">{t('criteria.colUsage')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((tp) => {
                        const method = tp.rubric?.aggregation?.method ?? 'average';
                        const courseCount = new Set(
                          courses.filter((c) => versionsOf(c.id)[0]?.templateKey === tp.key).map((c) => c.id),
                        ).size;
                        return (
                          <TableRow key={tp.key}>
                            <TableCell>
                              <div className="font-medium">{tp.name}</div>
                              <div className="flex flex-wrap gap-1">
                                {tp.isSystem && <Badge variant="secondary">{t('templates.badgeSystem')}</Badge>}
                                {!tp.isActive && <Badge variant="warning">{t('templates.badgeInactive')}</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-caption">{tp.key}</TableCell>
                            <TableCell>
                              {tp.rubric?.scale?.min ?? 0} – {tp.rubric?.scale?.max ?? 3}
                            </TableCell>
                            <TableCell>{t(`templates.method.${method}`, { defaultValue: method })}</TableCell>
                            <TableCell>{tp.rubric?.dimensions?.length ?? 0}</TableCell>
                            <TableCell>{t('criteria.templateUsage', { count: courseCount })}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">{t('criteria.templatesEmpty')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('criteria.promptHeading')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-body text-foreground/80">{t('criteria.promptHint')}</p>
              <SelectNative
                value={promptCourseId}
                onChange={(e) => void showPrompt(e.target.value)}
                aria-label={t('criteria.promptHeading')}
                className="max-w-sm"
              >
                <option value="">{t('criteria.selectCourse')}</option>
                {[...courses]
                  .sort((a, b) => a.key.localeCompare(b.key))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.key}
                    </option>
                  ))}
              </SelectNative>
              {promptError && <Alert variant="warning">{promptError}</Alert>}
              {prompt && (
                <pre
                  role="region"
                  aria-label={t('criteria.previewRegion')}
                  className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-sans text-caption"
                >
                  {prompt}
                </pre>
              )}
            </CardContent>
          </Card>

          <details className="rounded-md border border-border bg-card p-4">
            <summary className="cursor-pointer text-body font-medium">{t('criteria.upload')}</summary>
            <div className="mt-3 space-y-3">
              {/* Native <form>; fields named exactly "courseId"/"file" so new FormData(e.currentTarget)
                  reads what core-api expects — do not wrap these in a controlled/library field. */}
              {/* F12 AC-10.4: visible but disabled+explained for a staff member without `criteria_author`. */}
              <fieldset disabled={!canAuthor} className="space-y-3 disabled:opacity-60">
                <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
                  <SelectNative name="courseId" required aria-label={t('criteria.courseId')} className="max-w-[12rem]">
                    <option value="">{t('criteria.selectCourse')}</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.key}
                      </option>
                    ))}
                  </SelectNative>
                  <input
                    name="file"
                    type="file"
                    accept=".docx"
                    required
                    className="text-body file:mr-2 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1 file:text-body"
                  />
                  <Button type="submit">{t('criteria.uploadButton')}</Button>
                </form>
              </fieldset>
              {!canAuthor && <p className="text-caption text-muted-foreground">{t('criteria.uploadNoPrivilege')}</p>}
              {uploadError && (
                <Alert variant="destructive" role="alert">
                  {uploadError}
                </Alert>
              )}
            </div>
          </details>
        </section>
      )}

      <Drawer
        open={viewing !== null}
        placement="center"
        size="lg"
        title={viewing ? criteriaLabel(viewing) : ''}
        closeLabel={t('drawer.close')}
        onRequestClose={() => setViewing(null)}
        footer={
          viewing && canAuthor ? (
            <Button onClick={() => editCriteria(viewing)}>{t('templates.edit')}</Button>
          ) : undefined
        }
      >
        {viewing && <RubricSummary rubric={viewing.rubric} />}
      </Drawer>

      {/* F12 — additive: both drawers render unconditionally (their own `open` flag hides them);
          only one may be open at a time, enforced by `activeDrawer` (F12-ux.md §1.1 AC-05.10). */}
      <TemplateDrawer
        open={activeDrawer === 'template'}
        onClose={() => {
          setActiveDrawer(null);
          loadTemplates();
        }}
      />
      <RubricDrawer
        open={activeDrawer === 'authoring'}
        onClose={() => {
          setActiveDrawer(null);
          setEditingCriteria(null);
        }}
        courses={courses}
        initialCriteria={editingCriteria}
        onSaved={() => {
          loadCriteria();
          loadClasses();
        }}
      />
    </main>
  );
}
