import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal CSS-only tooltip (no Radix dependency) — shows on hover/focus of its
 * child trigger. Used for sidebar rail-mode icon labels only.
 */
export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-caption text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
