import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Dialog, DialogActions } from './Dialog';
import { InlineError } from './InlineError';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  /** Runs the action; the dialog closes when it resolves and shows the error if it fails. */
  onConfirm: () => Promise<unknown>;
}

/**
 * Explicit confirmation for destructive actions (STYLES.md: destructive actions use the
 * secondary style plus a confirmation dialog, never a new color).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
      title={title}
      description={description}
    >
      {error && <InlineError>{error}</InlineError>}
      <DialogActions>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
