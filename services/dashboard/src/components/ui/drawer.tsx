import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { IconClose } from '@/components/icons';
import { isTopmost, popTopmost, pushTopmost } from './dialog-stack';

/**
 * Hand-authored right-side slide-over drawer (F12 FR-05). No Radix, no headless-UI —
 * matches the rest of `components/ui/*` (CVA + tailwind-merge would be overkill for the
 * handful of size variants here, so this uses a small className map instead).
 *
 * Contract (F12-ba.md AC-05.*): role="dialog" aria-modal, focus trap + restore, Esc/backdrop
 * close via `onRequestClose(reason)` WITHOUT unmounting itself (the owner decides — this is
 * what makes the dirty-guard in Criteria.tsx's drawers possible), body-scroll lock restoring
 * the previous inline value, full-width below `md`, CSS-only transition respecting
 * prefers-reduced-motion.
 */
export interface DrawerProps {
  open: boolean;
  onRequestClose: (reason: 'esc' | 'backdrop' | 'close-button') => void;
  title: string;
  size?: 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
}

const SIZE_CLASS: Record<'md' | 'lg', string> = {
  md: 'md:w-[36rem]',
  lg: 'md:w-[56rem]',
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function Drawer({ open, onRequestClose, title, size = 'md', children, footer, closeLabel }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const stackId = useRef(Symbol('drawer')).current;
  const titleId = useRef(`drawer-title-${Math.random().toString(36).slice(2)}`).current;

  // DEF-1 fix: the keydown listener below is attached once per open/close cycle (NOT on every
  // render — re-attaching on every render would re-run the mount effect and regress
  // focus-restore/scroll-lock, per QA's own repro of the rejected fix). But `onRequestClose` is a
  // fresh closure on every render of the OWNER (e.g. Criteria.tsx re-renders as `dirty` flips), so
  // the effect below must never close over the callback directly — it reads it through this ref,
  // kept current by a separate, cheap effect that DOES run every render.
  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  });

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    pushTopmost(stackId);
    const panel = panelRef.current;
    const focusables = panel ? getFocusable(panel) : [];
    (focusables[0] ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        if (!isTopmost(stackId)) return;
        e.stopPropagation();
        onRequestCloseRef.current('esc');
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current || !isTopmost(stackId)) return;
      const items = getFocusable(panelRef.current);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
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
      document.body.style.overflow = previousOverflow;
      popTopmost(stackId);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-foreground/40 motion-reduce:transition-none"
        onClick={() => onRequestClose('backdrop')}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex h-full w-full flex-col bg-card shadow-md',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          SIZE_CLASS[size],
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <h2 id={titleId} className="text-h2">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => onRequestClose('close-button')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconClose />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
