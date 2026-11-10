import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { InlineError } from '../../../shared/ui/InlineError';

/** Save / cancel row at the bottom of every profile form, with the API error if saving failed. */
export function FormActions({
  submitLabel,
  pending,
  error,
  onCancel,
  status,
}: {
  submitLabel?: string;
  pending: boolean;
  error?: Error | null;
  onCancel?: () => void;
  /** Short confirmation shown next to the buttons, e.g. "Saved". */
  status?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 flex flex-col gap-3">
      {error && <InlineError>{t('common.saveError', { message: error.message })}</InlineError>}
      <div className="flex items-center justify-end gap-3">
        <p role="status" className="mr-auto text-sm text-steel-text">
          {status}
        </p>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : (submitLabel ?? t('common.save'))}
        </Button>
      </div>
    </div>
  );
}
