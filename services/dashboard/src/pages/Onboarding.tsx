import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

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
    <main id="main-content" className="space-y-6 p-6">
      <h1 className="text-h1">{t('onboarding.title')}</h1>
      {pending.length === 0 && <p className="text-muted-foreground">{t('onboarding.empty')}</p>}
      <ul className="space-y-3">
        {pending.map((b) => (
          <li key={b.id}>
            <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <strong className="text-body">{b.displayName ?? b.zaloUserId}</strong>{' '}
                <span className="text-muted-foreground">({b.zaloUserId})</span>
              </div>
              <div className="flex items-center gap-2">
                <form onSubmit={(e) => activate(e, b.id)} className="flex items-center gap-2">
                  <Label htmlFor={`onboarding-phone-${b.id}`} className="sr-only">
                    {t('onboarding.phone')}
                  </Label>
                  <Input
                    id={`onboarding-phone-${b.id}`}
                    type="tel"
                    placeholder={t('onboarding.phone')}
                    onChange={(e) => setPhoneDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                    required
                    className="max-w-xs"
                  />
                  <Button type="submit" size="sm">
                    {t('onboarding.activate')}
                  </Button>
                </form>
                {activatedId === b.id && <Badge variant="success">{t('onboarding.activated')}</Badge>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
