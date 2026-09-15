import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Drawer } from '../../components/ui/drawer';
import { Textarea } from '../../components/ui/textarea';

interface ClassConfigView {
  advisorZaloId: string;
  autoSend: boolean;
  criteriaId: number | null;
  readingText: string | null;
}

interface ReadingTextCellProps {
  className: string;
  config: ClassConfigView | null;
  onSaved: () => void;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Bài đọc hiện tại của một lớp (ILM-Clone D151), soạn trong cửa sổ nổi — pilot 09-15: ô nhập hai
 * dòng trong bảng quá chật để dán và soát một đoạn văn. Lưu NGAY khi bấm Lưu (không chờ nút Lưu
 * của hàng), giữ nguyên ghim tiêu chí / Zalo ID / tự động gửi đang lưu của lớp.
 */
export function ReadingTextCell({ className, config, onSaved }: ReadingTextCellProps) {
  const { t } = useTranslation();
  const current = config?.readingText ?? '';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft !== current;

  function openDialog(): void {
    setDraft(current);
    setError(null);
    setOpen(true);
  }

  async function save(text: string): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/classes-config/${encodeURIComponent(className)}`, {
        advisorZaloId: config?.advisorZaloId ?? '',
        autoSend: config?.autoSend ?? false,
        criteriaId: config?.criteriaId ?? null,
        readingText: text,
      });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message || t('errors.server'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mt-2 space-y-1">
        {current && (
          <p className="line-clamp-2 max-w-[16rem] text-caption text-muted-foreground" title={current}>
            {current}
          </p>
        )}
        <Button size="sm" variant="outline" onClick={openDialog}>
          {current ? t('criteria.readingTextEdit', { count: countWords(current) }) : t('criteria.readingTextAdd')}
        </Button>
      </div>

      <Drawer
        open={open}
        placement="center"
        size="md"
        title={t('criteria.readingTextDialogTitle', { className })}
        closeLabel={t('drawer.close')}
        // Lỡ bấm ra ngoài khi đang sửa dở thì KHÔNG đóng — đoạn văn vừa dán không được mất.
        onRequestClose={(reason) => {
          if (saving || (dirty && reason === 'backdrop')) return;
          setOpen(false);
        }}
        footer={
          <>
            {current && (
              <Button variant="ghost" onClick={() => save('')} disabled={saving}>
                {t('criteria.readingTextClear')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {t('criteria.cancel')}
            </Button>
            <Button onClick={() => save(draft)} disabled={saving || !dirty}>
              {t('criteria.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-body text-foreground/80">{t('criteria.readingTextHint')}</p>
          {error && (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          )}
          <Textarea
            rows={14}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t('criteria.readingText')}
            className="text-body"
          />
          <p className="text-caption text-muted-foreground">{t('criteria.readingTextWords', { count: countWords(draft) })}</p>
        </div>
      </Drawer>
    </>
  );
}
