import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

/** STYLES.md (desktop adaptation): never place two primary buttons side by side. */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-navy text-pure-white shadow-button hover:bg-midnight-ink',
  secondary: 'border border-indigo-navy bg-transparent text-indigo-navy hover:bg-cloud-canvas',
  /** Low-emphasis row actions (edit, move, remove). */
  ghost: 'bg-transparent text-steel-text hover:bg-cloud-canvas hover:text-indigo-navy',
};

const SIZES: Record<Size, string> = {
  md: 'h-9 px-4',
  sm: 'h-8 px-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
