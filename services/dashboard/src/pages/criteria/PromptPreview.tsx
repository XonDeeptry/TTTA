import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';

export type PromptVariant = 'audio' | 'text';

/**
 * Live LLM-prompt preview pane, shared by both drawers (F12 FR-20). Renders exactly the string
 * `POST /criteria/prompt-preview` returns — ZERO client-side prompt assembly (AC-20.7/20.8: plain
 * React text, no `dangerouslySetInnerHTML`, no `Tiêu chí:`/`Band ` literal anywhere here).
 *
 * The endpoint is deliberately lenient (F12-backend.md): a draft that would be REJECTED on save
 * still renders a prompt here. A preview failure never blocks Save — it only degrades this pane
 * to "last good text" (AC-20.5).
 */
export function PromptPreview({ rubric }: { rubric: unknown }) {
  const { t } = useTranslation();
  const [variant, setVariant] = useState<PromptVariant>('audio');
  const [prompt, setPrompt] = useState('');
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setUpdating(true);
    const timer = window.setTimeout(() => {
      api
        .post<{ variant: PromptVariant; prompt: string }>('/criteria/prompt-preview', { rubric, variant })
        .then((res) => {
          if (seq !== requestSeq.current) return; // AC-20.3: stale response discarded
          setPrompt(res.prompt);
          setFailed(false);
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setFailed(true);
        })
        .finally(() => {
          if (seq === requestSeq.current) setUpdating(false);
        });
    }, 400); // AC-20.2: debounced 300–500ms
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubric, variant]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-h3">{t('authoring.preview')}</span>
        <fieldset className="flex items-center gap-3 text-caption" aria-label={t('authoring.previewVariant')}>
          <legend className="sr-only">{t('authoring.previewVariant')}</legend>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="prompt-preview-variant"
              checked={variant === 'audio'}
              onChange={() => setVariant('audio')}
              className="h-4 w-4 accent-primary"
            />
            {t('authoring.variantAudio')}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="prompt-preview-variant"
              checked={variant === 'text'}
              onChange={() => setVariant('text')}
              className="h-4 w-4 accent-primary"
            />
            {t('authoring.variantText')}
          </label>
        </fieldset>
      </div>
      {updating && <p className="text-caption text-muted-foreground">{t('authoring.previewUpdating')}</p>}
      {failed && <p className="text-caption text-destructive">{t('authoring.previewError')}</p>}
      <pre
        role="region"
        aria-label={t('authoring.preview')}
        className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-caption"
      >
        {prompt || t('authoring.previewEmpty')}
      </pre>
    </div>
  );
}
