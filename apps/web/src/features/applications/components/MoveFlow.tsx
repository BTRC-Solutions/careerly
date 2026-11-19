import type { ApplicationStatus, ApplicationSummary } from '@careerly/contracts';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { useMoveApplication } from '../api/applications-api';
import { type BoardColumn, planMove } from '../lib/moves';
import { PickClosedDialog } from './PickClosedDialog';
import { SendApplicationDialog } from './SendApplicationDialog';

type Movable = Pick<
  ApplicationSummary,
  'id' | 'jobPostingId' | 'status' | 'ghostedFrom' | 'appliedAt' | 'title'
>;

type Step =
  | { kind: 'pickClosed'; application: Movable }
  | { kind: 'send'; application: Movable; to: ApplicationStatus }
  | { kind: 'confirm'; application: Movable; to: ApplicationStatus; reopen: boolean };

/**
 * Moves applications on the board, the table or the detail page (RF-APP-03), asking first for what the move
 * needs: which result when it is closed, how it was sent the first time, and a confirmation to go back
 * (RN-09) or to reopen it (RN-10). Returns `move` and the dialogs to render, plus a status message for screen
 * readers.
 */
export function useMoveFlow(): {
  move: (application: Movable, to: ApplicationStatus | BoardColumn) => void;
  dialogs: ReactNode;
  message: string | null;
} {
  const { t } = useTranslation();
  const mutation = useMoveApplication();
  const [step, setStep] = useState<Step | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const label = (status: ApplicationStatus) => t(`applications.statuses.${status}`);

  const run = (application: Movable, to: ApplicationStatus, confirmBackward = false) =>
    mutation.mutateAsync({ id: application.id, to, confirmBackward }).then(() => {
      setMessage(t('applications.move.done', { title: titleOf(application), status: label(to) }));
    });
  const titleOf = (application: Movable) => application.title ?? t('jobPostings.untitled');

  const move = (application: Movable, to: ApplicationStatus | BoardColumn) => {
    setMessage(null);
    if (to === 'CLOSED') {
      setStep({ kind: 'pickClosed', application });
      return;
    }
    const plan = planMove(application, to);
    if (plan.kind === 'same') return;
    if (plan.kind === 'refused') {
      setMessage(
        t(`applications.move.refused.${plan.reason}`, {
          title: titleOf(application),
          status: label(to),
        }),
      );
      return;
    }
    if (plan.needsSentCv) setStep({ kind: 'send', application, to });
    else if (plan.backward || plan.reopen) {
      setStep({ kind: 'confirm', application, to, reopen: plan.reopen });
    } else {
      run(application, to).catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const close = () => setStep(null);
  const dialogs = (
    <>
      {step?.kind === 'pickClosed' && (
        <PickClosedDialog
          application={step.application}
          onPick={(to) => {
            close();
            move(step.application, to);
          }}
          onClose={close}
        />
      )}
      {step?.kind === 'send' && (
        <SendApplicationDialog
          target={{ kind: 'move', application: step.application, to: step.to }}
          onDone={() =>
            setMessage(
              t('applications.move.done', {
                title: titleOf(step.application),
                status: label(step.to),
              }),
            )
          }
          onClose={close}
        />
      )}
      <ConfirmDialog
        open={step?.kind === 'confirm'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={
          step?.kind === 'confirm'
            ? t(step.reopen ? 'applications.move.reopenTitle' : 'applications.move.backTitle', {
                status: label(step.to),
              })
            : ''
        }
        description={
          step?.kind === 'confirm'
            ? t(
                step.reopen
                  ? 'applications.move.reopenDescription'
                  : 'applications.move.backDescription',
                { title: titleOf(step.application), status: label(step.to) },
              )
            : ''
        }
        confirmLabel={t('applications.move.confirm')}
        onConfirm={async () => {
          if (step?.kind === 'confirm') await run(step.application, step.to, !step.reopen);
        }}
      />
    </>
  );
  return { move, dialogs, message };
}
