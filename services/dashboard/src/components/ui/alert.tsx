import { cva, type VariantProps } from 'class-variance-authority';
import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Plain informational alert only — no dismiss/close button is ever rendered by this
 * component (F3-ux §4/§5: required for the SubmissionDetail pilot panel's
 * zero-interactive-controls safety rule). Do not add one.
 */
export const alertVariants = cva('w-full rounded-md border p-3 text-body', {
  variants: {
    variant: {
      default: 'border-border bg-card text-foreground',
      warning: 'border-warning/40 bg-warning/10 text-foreground',
      destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(({ className, variant, ...props }, ref) => (
  <div className={cn(alertVariants({ variant }), className)} ref={ref} {...props} />
));
Alert.displayName = 'Alert';
