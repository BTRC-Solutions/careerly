import type { ApplicationStatus, ApplicationSummary } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Dialog, DialogActions } from '../../../shared/ui/Dialog';
import { InlineError } from '../../../shared/ui/InlineError';
import { CLOSED_STATUSES, planMove } from '../lib/moves';

/** Closing an application: accepted, rejected or withdrawn (the ones the rules allow from where it is). */
export function PickClosedDialog({
  application,
  onPick,
  onClose,
}: {
  application: Pick<ApplicationSummary, 'status' | 'ghostedFrom' | 'appliedAt' | 'title'>;
  onPick: (to: ApplicationStatus) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const options = CLOSED_STATUSES.filter((to) => planMove(application, to).kind === 'move');
  const [picked, setPicked] = useState<ApplicationStatus | null>(options[0] ?? null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('applications.move.closeTitle')}
      description={application.title ?? t('jobPostings.untitled')}
    >
      {options.length === 0 ? (
        <InlineError>{t('applications.move.cannotClose')}</InlineError>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-slate-ink">
            {t('applications.move.closeQuestion')}
          </legend>
          {options.map((to) => (
            <label key={to} className="inline-flex items-center gap-2 text-sm text-slate-ink">
              <input
                type="radio"
                name="closed"
                checked={picked === to}
                onChange={() => setPicked(to)}
                className="size-4 accent-indigo-navy"
              />
              {t(`applications.statuses.${to}`)}
            </label>
          ))}
        </fieldset>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!picked} onClick={() => picked && onPick(picked)}>
          {t('applications.move.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
