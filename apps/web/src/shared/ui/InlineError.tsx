import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Error or attention message. Signal Orange is never used for text (it fails WCAG AA on white),
 * so the color goes on a dot and the text stays Slate Ink (STYLES.md, desktop adaptation).
 */
export function InlineError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn('flex items-start gap-2 text-sm text-slate-ink', className)}>
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-signal-orange" />
      <span>{children}</span>
    </p>
  );
}
