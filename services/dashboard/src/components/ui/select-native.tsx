import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Native <select>, shadcn-styled. Deliberately NOT Radix Select — this app needs
 * defaultValue/value + onChange to behave exactly like a plain <select> for two
 * call sites (Settings boolean toggle, Submissions status filter) whose payload
 * semantics must not change (see F3-ux §4/§0.1, F3-ba highest-risk notes).
 */
export const SelectNative = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative inline-block">
      <select
        className={cn(
          'flex h-9 w-full appearance-none rounded-md border border-input bg-card py-1 pl-3 pr-8 text-body shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 20 20"
        fill="none"
      >
        <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ),
);
SelectNative.displayName = 'SelectNative';
