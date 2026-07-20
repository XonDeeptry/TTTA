import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

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
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{t('settings.title')}</h1>
      <table>
        <tbody>
          {settings.map((s) => (
            <tr key={s.key}>
              <td>{s.key}</td>
              <td>
                {s.kind === 'boolean' ? (
                  <select
                    defaultValue={String(s.value ?? '')}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={s.masked ? 'password' : s.kind === 'number' ? 'number' : 'text'}
                    placeholder={s.masked && s.value ? String(s.value) : ''}
                    defaultValue={s.masked ? '' : String(s.value ?? '')}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                  />
                )}
              </td>
              <td>
                <button onClick={() => save(s)}>{t('settings.save')}</button>
                {savedKey === s.key && <span> {t('settings.saved')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
