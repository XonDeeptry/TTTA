import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/badge';

interface DimensionLike {
  key?: string;
  name?: string;
  label?: string;
  bands?: Record<string, string[] | string>;
  sub_factors?: { label?: string; by_band?: Record<string, string> }[];
}

interface RubricLike {
  scale?: { min?: number; max?: number; step?: number };
  band_scale?: number[];
  aggregation?: { method?: string; round?: string };
  levels?: { min?: number; max?: number; code?: string; label?: string }[];
  output_fields?: string[];
  dimensions?: DimensionLike[];
  comment_bank?: { dimension?: string | null; intent?: string | null; text?: string }[];
  student_reply?: { template?: string } | null;
}

function bandLines(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim() !== '');
  return typeof value === 'string' && value.trim() ? [value] : [];
}

/**
 * Nội dung một bộ tiêu chí ở dạng NGƯỜI ĐỌC ĐƯỢC — thay cho JSON thô của nút "Xem trước" cũ.
 * Pilot 09-15: đội học thuật cần thấy ngay khóa đang chấm bằng gì mà không mở trình soạn.
 */
export function RubricSummary({ rubric }: { rubric: unknown }) {
  const { t } = useTranslation();
  const r = (rubric ?? {}) as RubricLike;
  const min = r.scale?.min ?? r.band_scale?.[0] ?? 0;
  const max = r.scale?.max ?? r.band_scale?.[1] ?? 3;
  const method = r.aggregation?.method ?? 'average';
  const dims = r.dimensions ?? [];
  const bank = r.comment_bank ?? [];

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <dt className="text-caption text-muted-foreground">{t('templates.scale')}</dt>
          <dd className="text-body font-medium">
            {min} – {max}
          </dd>
        </div>
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <dt className="text-caption text-muted-foreground">{t('templates.aggregationMethod')}</dt>
          <dd className="text-body font-medium">{t(`templates.method.${method}`, { defaultValue: method })}</dd>
        </div>
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <dt className="text-caption text-muted-foreground">{t('templates.dimensions')}</dt>
          <dd className="text-body font-medium">{dims.length}</dd>
        </div>
      </dl>

      {(r.levels ?? []).length > 0 && (
        <div>
          <h3 className="text-body font-medium">{t('templates.levels')}</h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {(r.levels ?? []).map((lv, i) => (
              <li key={i}>
                <Badge variant="outline" className="font-normal">
                  {lv.min}–{lv.max}: {lv.label || lv.code}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-body font-medium">{t('authoring.bands')}</h3>
        {dims.map((d, i) => {
          const bands = Object.entries(d.bands ?? {}).sort((a, b) => Number(b[0]) - Number(a[0]));
          const filled = bands.filter(([, v]) => bandLines(v).length > 0).length;
          return (
            <details key={d.key ?? d.name ?? i} className="rounded-md border border-border p-3" open={i === 0}>
              <summary className="cursor-pointer text-body font-medium">
                {d.label || d.name || d.key}{' '}
                <span className="text-caption font-normal text-muted-foreground">
                  ({filled}/{Number(max) - Number(min) + 1} {t('criteria.summaryBandsFilled')}
                  {(d.sub_factors ?? []).length > 0 ? ` · ${(d.sub_factors ?? []).length} ${t('authoring.subFactors').toLowerCase()}` : ''})
                </span>
              </summary>
              <ul className="mt-2 space-y-1.5">
                {bands.map(([band, value]) => {
                  const lines = bandLines(value);
                  return (
                    <li key={band} className="grid grid-cols-[3rem_1fr] gap-2 text-body">
                      <span className="font-medium tabular-nums">{band}</span>
                      {lines.length > 0 ? (
                        <span className="text-foreground/80">{lines.join(' • ')}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>

      <div>
        <h3 className="text-body font-medium">
          {t('authoring.commentBank')} ({bank.length})
        </h3>
        {bank.length > 0 && (
          <ul className="mt-1 space-y-1">
            {bank.slice(0, 5).map((c, i) => (
              <li key={i} className="text-caption text-foreground/80">
                {c.intent ? `[${c.intent}] ` : ''}
                {c.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {r.student_reply?.template && (
        <div>
          <h3 className="text-body font-medium">{t('templates.replyTemplate')}</h3>
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-caption">{r.student_reply.template}</pre>
        </div>
      )}
    </div>
  );
}
