import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { XIcon } from './icons';

/** Tags are the only place for the pill radius (STYLES.md). */
export function Tag({
  children,
  onRemove,
  removeLabel,
  className,
}: {
  children: ReactNode;
  /** Shows a remove button when present. */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border border-silver-lining bg-cloud-canvas pr-1 pl-2.5 text-xs font-medium text-charcoal',
        !onRemove && 'pr-2.5',
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="rounded-full p-0.5 text-steel-text hover:bg-silver-lining hover:text-indigo-navy"
        >
          <XIcon width={12} height={12} />
        </button>
      )}
    </span>
  );
}
