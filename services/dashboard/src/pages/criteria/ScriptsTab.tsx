import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Alert } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { SelectNative } from '../../components/ui/select-native';
import { Textarea } from '../../components/ui/textarea';
import { IconPlus } from '../../components/icons';
import { describeApiError } from './api-errors';

/**
 * Màn "Kịch bản nhận xét" (học thuật ILM 2026-10-03).
 *
 * Học thuật không quen IT ⇒ không dropdown, không JSON: chọn một CẤU TRÚC (dùng chung cho mọi khóa),
 * mỗi tiêu chí một thẻ, mỗi band một dòng gập/mở với các ô chữ. Hệ thống sinh sẵn 3 kịch bản / ô;
 * học thuật chỉ đọc và sửa. Xóa hết chữ trong một ô = xóa kịch bản đó. Một nút Lưu cho cả màn.
 */

interface ScriptsView {
  key: string;
  name: string;
  bands: string[];
  dimensions: { key: string; label: string }[];
  scripts: { dimension: string; band: string; text: string }[];
}

interface TemplateRow {
  key: string;
  name: string;
  isActive: boolean;
}

const TARGET = 3;
const cellKey = (dimension: string, band: string) => `${dimension}|${band}`;

export function ScriptsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateKey, setTemplateKey] = useState('');
  const [view, setView] = useState<ScriptsView | null>(null);
  const [cells, setCells] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void api.get<TemplateRow[]>('/criteria/templates').then((rows) => {
      setTemplates(rows);
      if (rows.length > 0) setTemplateKey((k) => k || rows[0].key);
    });
  }, []);

  useEffect(() => {
    if (!templateKey) return;
    setView(null);
    setMessage(null);
    void api.get<ScriptsView>(`/criteria/templates/${encodeURIComponent(templateKey)}/scripts`).then((v) => {
      const next: Record<string, string[]> = {};
      for (const s of v.scripts) (next[cellKey(s.dimension, s.band)] ??= []).push(s.text);
      setCells(next);
      setView(v);
      setDirty(false);
    });
  }, [templateKey]);

  // Rời trang khi chưa lưu ⇒ trình duyệt hỏi lại (học thuật soạn dài, mất bài là mất công).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const bandsHighFirst = useMemo(() => [...(view?.bands ?? [])].reverse(), [view]);

  function edit(key: string, index: number, text: string): void {
    setCells((c) => {
      const list = [...(c[key] ?? [])];
      list[index] = text;
      return { ...c, [key]: list };
    });
    setDirty(true);
  }

  function addSlot(key: string): void {
    setCells((c) => ({ ...c, [key]: [...(c[key] ?? []), ''] }));
  }

  function changeTemplate(next: string): void {
    if (dirty && !window.confirm(t('scripts.confirmDiscard'))) return;
    setTemplateKey(next);
  }

  async function save(): Promise<void> {
    if (!view) return;
    setSaving(true);
    setMessage(null);
    const scripts = Object.entries(cells).flatMap(([key, texts]) => {
      const [dimension, band] = key.split('|');
      return texts.filter((x) => x.trim()).map((text) => ({ dimension, band, text }));
    });
    try {
      const saved = await api.put<ScriptsView>(`/criteria/templates/${encodeURIComponent(view.key)}/scripts`, { scripts });
      const next: Record<string, string[]> = {};
      for (const s of saved.scripts) (next[cellKey(s.dimension, s.band)] ??= []).push(s.text);
      setCells(next);
      setView(saved);
      setDirty(false);
      setMessage({ kind: 'ok', text: t('scripts.saved', { count: saved.scripts.length }) });
    } catch (err) {
      const d = describeApiError(err, t);
      setMessage({ kind: 'error', text: [d.heading, ...d.issues].join(' — ') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section role="tabpanel" className="space-y-4">
      <p className="max-w-3xl text-body text-foreground/80">{t('scripts.hint')}</p>
      <ul className="max-w-3xl list-disc space-y-1 pl-5 text-body text-foreground/80">
        <li>{t('scripts.howRotate')}</li>
        <li>{t('scripts.howPlaceholder')}</li>
        <li>{t('scripts.howDelete')}</li>
      </ul>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="scripts-template">{t('scripts.structure')}</Label>
          <SelectNative id="scripts-template" value={templateKey} onChange={(e) => changeTemplate(e.target.value)}>
            {templates.map((tpl) => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.name}
              </option>
            ))}
          </SelectNative>
        </div>
        {canEdit && (
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? t('scripts.saving') : dirty ? t('scripts.save') : t('scripts.noChanges')}
          </Button>
        )}
        {!canEdit && <p className="text-caption text-muted-foreground">{t('scripts.readOnly')}</p>}
      </div>

      {message && (
        <Alert variant={message.kind === 'ok' ? 'default' : 'destructive'} role={message.kind === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </Alert>
      )}

      {!view && <p className="text-muted-foreground">{t('scripts.loading')}</p>}

      {view?.dimensions.map((dim) => (
        <Card key={dim.key}>
          <CardHeader>
            <CardTitle>{dim.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bandsHighFirst.map((band) => {
              const key = cellKey(dim.key, band);
              const texts = cells[key] ?? [];
              const filled = texts.filter((x) => x.trim()).length;
              // Ô trống hiển thị đủ 3 ô để học thuật thấy chỗ cần viết, không cần bấm "thêm".
              const slots = texts.length >= TARGET ? texts : [...texts, ...Array(TARGET - texts.length).fill('')];
              return (
                <details key={band} className="rounded-md border border-border px-3 py-2" open={false}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-body font-medium">
                    {t('scripts.band', { band })}
                    {filled >= TARGET ? (
                      <Badge variant="success">{t('scripts.count', { count: filled })}</Badge>
                    ) : filled > 0 ? (
                      <Badge variant="warning">{t('scripts.countLow', { count: filled, target: TARGET })}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('scripts.countNone')}</Badge>
                    )}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {slots.map((text, i) => (
                      <div key={i}>
                        <Label htmlFor={`s-${key}-${i}`} className="text-caption text-muted-foreground">
                          {t('scripts.slot', { index: i + 1 })}
                        </Label>
                        <Textarea
                          id={`s-${key}-${i}`}
                          rows={2}
                          value={text}
                          disabled={!canEdit}
                          onChange={(e) => edit(key, i, e.target.value)}
                        />
                      </div>
                    ))}
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => addSlot(key)}>
                        <IconPlus /> {t('scripts.add')}
                      </Button>
                    )}
                  </div>
                </details>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
