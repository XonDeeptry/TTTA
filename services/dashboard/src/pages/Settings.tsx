import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { SelectNative } from '../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface SettingView {
  key: string;
  kind: 'string' | 'boolean' | 'number';
  masked: boolean;
  value: string | number | boolean | null;
}

export function Settings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SettingView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);

  function load(): void {
    void api.get<SettingView[]>('/settings').then(setSettings);
  }

  useEffect(load, []);

  async function save(setting: SettingView): Promise<void> {
    const raw = drafts[setting.key] ?? '';
    const value = setting.kind === 'boolean' ? raw === 'true' : setting.kind === 'number' ? Number(raw) : raw;
    await api.put(`/settings/${setting.key}`, { value });
    setSavedKey(setting.key);
    load();
  }

  return (
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('settings.title')}</h1>
      <Card>
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
              {settings.map((s) => (
                <TableRow key={s.key}>
                  <TableCell className="font-medium">{s.key}</TableCell>
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
                      <Input
                        type={s.masked ? 'password' : s.kind === 'number' ? 'number' : 'text'}
                        placeholder={s.masked && s.value ? String(s.value) : ''}
                        defaultValue={s.masked ? '' : String(s.value ?? '')}
                        onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                        className="max-w-sm"
                      />
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
    </main>
  );
}
