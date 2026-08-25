import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { isTopmost, popTopmost, pushTopmost } from './dialog-stack';

/**
 * Small hand-authored centered confirm modal (F12 FR-06). The ONLY confirmation mechanism
 * used anywhere in F12 — `window.confirm`/`alert`/`prompt` are forbidden (AC-06.4). Same a11y
 * contract as Drawer (focus trap, Esc, focus restore) but nests ON TOP of a drawer: the shared
 * `dialog-stack` module makes Esc close only the topmost surface (AC-05.5).
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const stackId = useRef(Symbol('confirm-dialog')).current;
  const titleId = useRef(`confirm-title-${Math.random().toString(36).slice(2)}`).current;

  // Same fix as `drawer.tsx` DEF-1: the keydown listener is attached once per open/close cycle,
  // so it must read `onCancel` through a ref kept current every render rather than closing over
  // a value from the render that happened to be active when the effect last ran.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    pushTopmost(stackId);
    const panel = panelRef.current;
    const focusables = panel ? getFocusable(panel) : [];
    (focusables[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (!isTopmost(stackId)) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = getFocusable(panelRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      popTopmost(stackId);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/40" onClick={onCancel} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn('w-full max-w-sm space-y-3 rounded-md border border-border bg-card p-6 shadow-md')}
        >
          <h3 id={titleId} className="text-h3">
            {title}
          </h3>
          <div className="text-body">{body}</div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
