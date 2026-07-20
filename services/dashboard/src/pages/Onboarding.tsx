import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

interface ZaloBinding {
  id: number;
  zaloUserId: string;
  displayName: string | null;
  status: string;
}

export function Onboarding() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<ZaloBinding[]>([]);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<number, string>>({});
  const [activatedId, setActivatedId] = useState<number | null>(null);

  function load(): void {
    void api.get<ZaloBinding[]>('/onboarding/pending').then(setPending);
  }

  useEffect(load, []);

  async function activate(e: FormEvent, id: number): Promise<void> {
    e.preventDefault();
    const phone = phoneDrafts[id];
    if (!phone) return;
    await api.patch(`/onboarding/${id}/activate`, { phone });
    setActivatedId(id);
    load();
  }

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>{t('onboarding.title')}</h1>
      {pending.length === 0 && <p>{t('onboarding.empty')}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {pending.map((b) => (
          <li key={b.id} style={{ marginBottom: '1rem' }}>
            <strong>{b.displayName ?? b.zaloUserId}</strong> ({b.zaloUserId})
            <form onSubmit={(e) => activate(e, b.id)} style={{ display: 'inline-flex', gap: '0.5rem', marginLeft: '1rem' }}>
              <input
                type="tel"
                placeholder={t('onboarding.phone')}
                onChange={(e) => setPhoneDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                required
              />
              <button type="submit">{t('onboarding.activate')}</button>
            </form>
            {activatedId === b.id && <span> {t('onboarding.activated')}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
