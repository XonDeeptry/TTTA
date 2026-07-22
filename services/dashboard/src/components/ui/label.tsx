import { LabelHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label className={cn('text-body font-medium leading-none', className)} ref={ref} {...props} />
  ),
);
Label.displayName = 'Label';
