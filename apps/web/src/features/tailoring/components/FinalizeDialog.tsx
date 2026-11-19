import type { TailoredResume, TailoringSession } from '@careerly/contracts';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Dialog, DialogActions } from '../../../shared/ui/Dialog';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import { useFinalizeSession } from '../api/tailoring-api';

/**
 * Confirms finalizing the session (RF-TAIL-14): every CV of its languages is frozen and can no longer be edited.
 * A CV over the page budget is pointed out and needs finalizing anyway (RN-04).
 */
export function FinalizeDialog({
  session,
  resumes,
  onClose,
}: {
  session: TailoringSession;
  resumes: TailoredResume[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const finalize = useFinalizeSession(session.id);
  const overBudget = resumes.some((resume) => !resume.data.fit?.fits);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('tailoring.finalize.title')}
      description={t('tailoring.finalize.description', { count: resumes.length })}
    >
      <ul className="flex flex-col divide-y divide-silver-lining rounded-control border border-silver-lining">
        {resumes.map(({ language, data }) => {
          const fit = data.fit;
          const fits = fit?.fits ?? false;
          return (
            <li key={language} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm font-medium text-slate-ink">
                {t('tailoring.finalize.cv', {
                  language: t(`tailoring.review.languages.${language}`),
                })}
              </span>
              <span className="flex items-center gap-2 text-sm text-steel-text">
                {fit && t('tailoring.finalize.pages', { count: fit.pageCount })}
                {!fits && (
                  <Tag>
                    {/* Signal Orange only on a dot, never on text (STYLES.md). */}
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-signal-orange" />
                    {t('tailoring.finalize.overBudget')}
                  </Tag>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {overBudget && (
        <p className="mt-4 text-sm text-slate-ink">
          {t('tailoring.finalize.overBudgetHint', { count: session.pageBudget })}
        </p>
      )}
      {finalize.error && (
        <div className="mt-4">
          <InlineError>
            {t('tailoring.finalize.error', { message: finalize.error.message })}
          </InlineError>
        </div>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={finalize.isPending}
          onClick={() =>
            finalize.mutate({ confirmOverBudget: overBudget || undefined }, { onSuccess: onClose })
          }
        >
          {finalize.isPending
            ? t('tailoring.finalize.finalizing')
            : overBudget
              ? t('tailoring.finalize.confirmAnyway')
              : t('tailoring.finalize.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
