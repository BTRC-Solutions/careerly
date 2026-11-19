import type { Application, ApplicationStatus, ResumeVersion } from '@careerly/contracts';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Dialog, DialogActions } from '../../../shared/ui/Dialog';
import { Checkbox, Field, Input } from '../../../shared/ui/form';
import { InlineError } from '../../../shared/ui/InlineError';
import {
  useCreateApplication,
  useMoveApplication,
  useSendableResumes,
  useSendApplication,
} from '../api/applications-api';
import { today } from '../lib/dates';

/**
 * Create the application of a job description, record that an existing one was sent, or move one that was
 * never sent past `SAVED` on the board (roadmap 7.4), which needs to say how it was sent.
 */
export type SendTarget =
  | { kind: 'create'; jobPostingId: string }
  | { kind: 'send'; application: Application }
  | { kind: 'move'; application: { id: string; jobPostingId: string }; to: ApplicationStatus };

/**
 * Asks whether the application was sent and with which finalized CVs of its job description (RF-APP-02), or
 * whether it went without a CV made with Careerly, and on what day. When creating it, "not yet" saves it.
 */
export function SendApplicationDialog({
  target,
  sessionId,
  onDone,
  onClose,
}: {
  target: SendTarget;
  /** The finalized session it is created or sent from: its CVs come checked. */
  sessionId?: string;
  onDone?: (application: Application) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const jobPostingId =
    target.kind === 'create' ? target.jobPostingId : target.application.jobPostingId;
  const moving = target.kind === 'move' ? target : null;
  const sendable = useSendableResumes(jobPostingId);
  const alreadySent = new Set(
    target.kind === 'send' ? target.application.sentResumes.map((s) => s.resumeVersionId) : [],
  );
  const choices = (sendable.data?.versions ?? []).filter((v) => !alreadySent.has(v.id));
  const firstTime = target.kind !== 'send' || target.application.status === 'SAVED';

  const [sent, setSent] = useState(true);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [withoutCv, setWithoutCv] = useState(false);
  const [sentAt, setSentAt] = useState(today());
  const create = useCreateApplication();
  const send = useSendApplication(target.kind === 'send' ? target.application.id : '');
  const move = useMoveApplication();
  const mutation = target.kind === 'create' ? create : target.kind === 'move' ? move : send;

  // Until the user touches them, the CVs of the session (or of the newest one) come checked.
  const checked = picked ?? defaultPick(choices, sessionId);
  const ready = !sent || checked.size > 0 || withoutCv;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const sending = {
      resumeVersionIds: choices.filter((v) => checked.has(v.id)).map((v) => v.id),
      ...(withoutCv ? { sentWithoutCareerlyCv: true } : {}),
      sentAt,
    };
    const done = (application: Application) => {
      onDone?.(application);
      onClose();
    };
    if (target.kind === 'create') {
      create.mutate({ jobPostingId, ...(sent ? { sent: sending } : {}) }, { onSuccess: done });
    } else if (moving) {
      move.mutate({ id: moving.application.id, to: moving.to, sent: sending }, { onSuccess: done });
    } else {
      send.mutate(sending, { onSuccess: done });
    }
  };

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        target.kind === 'create'
          ? t('applications.send.createTitle')
          : moving
            ? t('applications.send.moveTitle', {
                status: t(`applications.statuses.${moving.to}`),
              })
            : firstTime
              ? t('applications.send.markTitle')
              : t('applications.send.addTitle')
      }
      size="lg"
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        {target.kind === 'create' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-slate-ink">
              {t('applications.send.question')}
            </legend>
            {[true, false].map((value) => (
              <label
                key={String(value)}
                className="inline-flex items-center gap-2 text-sm text-slate-ink"
              >
                <input
                  type="radio"
                  name="sent"
                  checked={sent === value}
                  onChange={() => setSent(value)}
                  className="size-4 accent-indigo-navy"
                />
                {value ? t('applications.send.yes') : t('applications.send.notYet')}
              </label>
            ))}
          </fieldset>
        )}

        {sent && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-slate-ink">
                {t('applications.send.cvs')}
              </legend>
              {sendable.isPending && (
                <p role="status" className="text-sm text-steel-text">
                  {t('applications.loading')}
                </p>
              )}
              {sendable.data && choices.length === 0 && (
                <p className="text-sm text-steel-text">{t('applications.send.noCvs')}</p>
              )}
              {choices.map((version) => (
                <Checkbox
                  key={version.id}
                  checked={checked.has(version.id)}
                  onChange={() => toggle(version.id)}
                  label={<ResumeChoice version={version} />}
                />
              ))}
              {firstTime && (
                <Checkbox
                  className="mt-1"
                  checked={withoutCv}
                  onChange={(event) => setWithoutCv(event.target.checked)}
                  label={t('applications.send.withoutCv')}
                />
              )}
            </fieldset>
            <Field label={t('applications.send.date')} className="max-w-48">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  required
                  max={today()}
                  value={sentAt}
                  onChange={(event) => setSentAt(event.target.value)}
                />
              )}
            </Field>
            {!ready && <p className="text-sm text-steel-text">{t('applications.send.pickOne')}</p>}
          </>
        )}

        {mutation.error && <InlineError>{mutation.error.message}</InlineError>}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!ready || mutation.isPending}>
            {target.kind === 'create'
              ? t('applications.send.create')
              : moving
                ? t('applications.move.confirm')
                : firstTime
                  ? t('applications.send.mark')
                  : t('applications.send.add')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ResumeChoice({ version }: { version: ResumeVersion }) {
  const { t, i18n } = useTranslation();
  const finalizedOn = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(version.createdAt),
  );
  return (
    <span className="flex flex-col">
      <span>
        {t('applications.cv', { language: t(`tailoring.review.languages.${version.language}`) })}
      </span>
      <span className="text-xs text-steel-text">
        {t('applications.send.finalizedOn', { date: finalizedOn, file: version.fileName })}
      </span>
    </span>
  );
}

/** The CVs of the given session, or else of the newest finalized session. */
function defaultPick(choices: ResumeVersion[], sessionId: string | undefined): Set<string> {
  const session = sessionId ?? choices[0]?.sessionId;
  return new Set(choices.filter((v) => v.sessionId === session).map((v) => v.id));
}
