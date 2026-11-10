import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** STYLES.md (desktop adaptation): never place two primary buttons side by side. */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-navy text-pure-white shadow-button hover:bg-midnight-ink',
  secondary: 'border border-indigo-navy bg-transparent text-indigo-navy hover:bg-cloud-canvas',
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
