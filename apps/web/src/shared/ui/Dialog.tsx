import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { XIcon } from './icons';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Wider dialogs for long forms. */
  size?: 'md' | 'lg';
}

/**
 * Modal dialog (Radix): focus trap, Escape to close, focus returns to the trigger.
 * White card, 8px radius, `shadow-md` over a Midnight Ink scrim.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: DialogProps) {
  const { t } = useTranslation();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-midnight-ink/30" />
        <RadixDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card bg-pure-white shadow-md',
            size === 'md' ? 'max-w-lg' : 'max-w-2xl',
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(event) => {
            // Start in the first form field instead of the close button. Dialogs without fields
            // (confirmations) keep Radix's default: the first button.
            const field = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
              'input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
            );
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <RadixDialog.Title className="text-section-title text-indigo-navy">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-sm text-steel-text">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              className="-mt-1 -mr-2 rounded-control p-2 text-steel-text hover:bg-cloud-canvas hover:text-indigo-navy"
              aria-label={t('common.close')}
            >
              <XIcon />
            </RadixDialog.Close>
          </div>
          <div className="overflow-y-auto px-6 pt-4 pb-6">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Footer row for dialog actions: secondary on the left, primary on the right. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-3">{children}</div>;
}
