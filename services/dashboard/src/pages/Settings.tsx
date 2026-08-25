import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface SettingView {
  key: string;
  kind: 'string' | 'boolean' | 'number';
  masked: boolean;
  value: string | number | boolean | null;
}

interface SettingGroupDef {
  prefix: string;
  titleKey: string;
}

// Panels mirror the key prefixes in core-api's setting-defs.ts (zalo./llm./limits./sheets./internal.) —
// keep this list in sync if a new prefix is added there.
const SETTING_GROUPS: SettingGroupDef[] = [
  { prefix: 'zalo.', titleKey: 'settings.group.zalo' },
  { prefix: 'llm.', titleKey: 'settings.group.llm' },
  { prefix: 'limits.', titleKey: 'settings.group.limits' },
  { prefix: 'sheets.', titleKey: 'settings.group.sheets' },
  { prefix: 'internal.', titleKey: 'settings.group.internal' },
];

// Ô chọn model của từng provider. Gợi ý lấy TRỰC TIẾP từ provider chứ không phải danh sách cứng:
// ngày 2026-08-25 `gemini-2.5-flash` bị Google ngừng cấp và mọi lượt chấm trả 404 — một danh sách
// cứng trong code sẽ lỗi thời đúng theo cách đó. Đây là <datalist> (GỢI Ý) chứ không phải <select>,
// nên vẫn gõ tay được nếu danh sách thiếu hoặc không gọi được provider.
const MODEL_FIELDS: Record<string, string> = {
  'llm.gemini_model': 'gemini',
  'llm.openai_model': 'openai',
};

interface LlmModelList {
  provider: string;
  models: string[];
  error?: string;
}

export function Settings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SettingView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [modelHints, setModelHints] = useState<Record<string, LlmModelList>>({});

  function load(): void {
    void api.get<SettingView[]>('/settings').then(setSettings);
  }

  useEffect(load, []);

  // Endpoint không bao giờ ném lỗi (trả `error` trong body), nhưng vẫn bọc catch để một provider
  // chết không làm hỏng cả màn Cấu hình.
  useEffect(() => {
    for (const provider of new Set(Object.values(MODEL_FIELDS))) {
      void api
        .get<LlmModelList>(`/settings/llm-models/${provider}`)
        .then((r) => setModelHints((m) => ({ ...m, [provider]: r })))
        .catch(() => setModelHints((m) => ({ ...m, [provider]: { provider, models: [], error: 'unreachable' } })));
    }
  }, []);

  async function save(setting: SettingView): Promise<void> {
    const raw = drafts[setting.key] ?? '';
    const value = setting.kind === 'boolean' ? raw === 'true' : setting.kind === 'number' ? Number(raw) : raw;
    await api.put(`/settings/${setting.key}`, { value });
    setSavedKey(setting.key);
    load();
  }

  const grouped = SETTING_GROUPS.map((group) => ({
    ...group,
    items: settings.filter((s) => s.key.startsWith(group.prefix)),
  })).filter((group) => group.items.length > 0);
  const other = settings.filter((s) => !SETTING_GROUPS.some((g) => s.key.startsWith(g.prefix)));
  if (other.length > 0) {
    grouped.push({ prefix: '', titleKey: 'settings.group.other', items: other });
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('settings.title')}</h1>
      {grouped.map((group) => (
        <Card key={group.titleKey}>
          <CardHeader>
            <CardTitle>{t(group.titleKey)}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('settings.key')}</TableHead>
                  <TableHead scope="col">{t('settings.value')}</TableHead>
                  <TableHead scope="col" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">
                      <div>{t(`settings.field.${s.key}`, { defaultValue: s.key })}</div>
                      <div className="text-caption text-foreground/50">{s.key}</div>
                    </TableCell>
                    <TableCell>
                      {s.kind === 'boolean' ? (
                        <SelectNative
                          defaultValue={String(s.value ?? '')}
                          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                          className="max-w-[8rem]"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </SelectNative>
                      ) : (
                        <>
                          <Input
                            type={s.masked ? 'password' : s.kind === 'number' ? 'number' : 'text'}
                            placeholder={s.masked && s.value ? String(s.value) : ''}
                            defaultValue={s.masked ? '' : String(s.value ?? '')}
                            onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                            className="max-w-sm"
                            list={MODEL_FIELDS[s.key] ? `models-${MODEL_FIELDS[s.key]}` : undefined}
                          />
                          {MODEL_FIELDS[s.key] && (
                            <>
                              <datalist id={`models-${MODEL_FIELDS[s.key]}`}>
                                {(modelHints[MODEL_FIELDS[s.key]]?.models ?? []).map((m) => (
                                  <option key={m} value={m} />
                                ))}
                              </datalist>
                              <p className="mt-1 text-caption text-foreground/50">
                                {modelHints[MODEL_FIELDS[s.key]]?.error
                                  ? t('settings.modelsUnavailable')
                                  : t('settings.modelsHint', {
                                      count: modelHints[MODEL_FIELDS[s.key]]?.models.length ?? 0,
                                    })}
                              </p>
                            </>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => save(s)}>
                          {t('settings.save')}
                        </Button>
                        {savedKey === s.key && <Badge variant="success">{t('settings.saved')}</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
