import {
  type AddApplicationEventRequest,
  type ApplicationEvent,
  InterviewKindSchema,
  InterviewOutcomeSchema,
  MessageChannelSchema,
} from '@careerly/contracts';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Dialog, DialogActions } from '../../../shared/ui/Dialog';
import { Field, Input, Select, Textarea } from '../../../shared/ui/form';
import { PlusIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import { useAddApplicationEvent, useApplicationEvents } from '../api/applications-api';

type EntryType = AddApplicationEventRequest['type'];
const ENTRY_TYPES: EntryType[] = ['NOTE', 'INTERVIEW', 'MESSAGE'];

/**
 * The timeline of an application (roadmap 7.5, RF-APP-04): the changes of state, recorded on their own (RN-09),
 * and the notes, interviews and messages the user adds. Newest first. Nothing in it is edited or deleted.
 */
export function Timeline({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation();
  const events = useApplicationEvents(applicationId);
  const [adding, setAdding] = useState<EntryType | null>(null);
  const titleId = useId();
  // What counts as upcoming, fixed when the page opens.
  const [now] = useState(() => Date.now());

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-section-title text-indigo-navy">
            {t('applications.timeline.title')}
          </h2>
          <p className="text-sm text-steel-text">{t('applications.timeline.appendOnly')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ENTRY_TYPES.map((type) => (
            <Button key={type} variant="secondary" size="sm" onClick={() => setAdding(type)}>
              <PlusIcon />
              {t(`applications.timeline.add.${type}`)}
            </Button>
          ))}
        </div>
      </div>
      {events.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('applications.loading')}
        </p>
      )}
      {events.isError && <InlineError>{t('applications.timeline.loadError')}</InlineError>}
      {events.data && (
        <ol aria-labelledby={titleId} className="flex flex-col divide-y divide-silver-lining">
          {[...events.data.events].reverse().map((event) => (
            <TimelineItem key={event.id} event={event} now={now} />
          ))}
        </ol>
      )}
      {adding && (
        <AddEntryDialog
          applicationId={applicationId}
          type={adding}
          onClose={() => setAdding(null)}
        />
      )}
    </Card>
  );
}

function TimelineItem({ event, now }: { event: ApplicationEvent; now: number }) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(event.occurredAt));
  const upcoming = new Date(event.occurredAt).getTime() > now;
  const status = (value: string) => t(`applications.statuses.${value}`);

  let title: string;
  let body: ReactNode = null;
  switch (event.type) {
    case 'STATUS_CHANGE':
      title =
        event.from === null
          ? t('applications.timeline.created', { status: status(event.to) })
          : event.reopened
            ? t('applications.timeline.reopened', { status: status(event.to) })
            : event.backward
              ? t('applications.timeline.back', { from: status(event.from), to: status(event.to) })
              : t('applications.timeline.moved', {
                  from: status(event.from),
                  to: status(event.to),
                });
      break;
    case 'NOTE':
      title = t('applications.timeline.note');
      body = <Text>{event.text}</Text>;
      break;
    case 'INTERVIEW':
      title = t('applications.timeline.interview', {
        kind: t(`applications.timeline.kinds.${event.kind}`),
      });
      body = (
        <>
          {event.interviewers.length > 0 && (
            <p className="text-sm text-slate-ink">
              {t('applications.timeline.with', { names: event.interviewers.join(', ') })}
            </p>
          )}
          {event.notes && <Text>{event.notes}</Text>}
        </>
      );
      break;
    case 'MESSAGE':
      title = event.from
        ? t('applications.timeline.messageFrom', {
            channel: t(`applications.timeline.channels.${event.channel}`),
            from: event.from,
          })
        : t('applications.timeline.message', {
            channel: t(`applications.timeline.channels.${event.channel}`),
          });
      body = <Text>{event.text}</Text>;
      break;
  }

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-slate-ink">{title}</p>
        {event.type === 'INTERVIEW' && (
          <Tag>{t(`applications.timeline.outcomes.${event.outcome}`)}</Tag>
        )}
        {upcoming && <Tag>{t('applications.timeline.upcoming')}</Tag>}
      </div>
      <p className="text-xs text-steel-text">
        <time dateTime={event.occurredAt}>{when}</time>
      </p>
      {body}
    </li>
  );
}

const Text = ({ children }: { children: string }) => (
  <p className="text-sm whitespace-pre-wrap text-slate-ink">{children}</p>
);

/** Now in the user's time zone, as a `datetime-local` value (minutes). */
function nowLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * Adds a note, an interview or a message. Notes are dated now; interviews may be ahead; messages were received
 * already. It says up front that the entry cannot be changed afterwards.
 */
function AddEntryDialog({
  applicationId,
  type,
  onClose,
}: {
  applicationId: string;
  type: EntryType;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const add = useAddApplicationEvent(applicationId);
  const [opened] = useState(nowLocal);
  const [occurredAt, setOccurredAt] = useState(opened);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<(typeof InterviewKindSchema.options)[number]>('TECHNICAL');
  const [outcome, setOutcome] =
    useState<(typeof InterviewOutcomeSchema.options)[number]>('PENDING');
  const [interviewers, setInterviewers] = useState('');
  const [channel, setChannel] = useState<(typeof MessageChannelSchema.options)[number]>('EMAIL');
  const [from, setFrom] = useState('');

  const when = occurredAt ? new Date(occurredAt).toISOString() : undefined;
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  const request: AddApplicationEventRequest =
    type === 'NOTE'
      ? { type, text }
      : type === 'INTERVIEW'
        ? {
            type,
            kind,
            outcome,
            interviewers: interviewers
              .split(',')
              .map((name) => name.trim())
              .filter(Boolean),
            notes: optional(text),
            occurredAt: when,
          }
        : { type, channel, from: optional(from), text, occurredAt: when };
  const ready =
    (type === 'NOTE' || when !== undefined) && (type === 'INTERVIEW' || text.trim() !== '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(request, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t(`applications.timeline.add.${type}`)}
      description={t('applications.timeline.appendOnly')}
      size="lg"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {type !== 'NOTE' && (
          <Field
            label={
              type === 'INTERVIEW'
                ? t('applications.timeline.form.interviewDate')
                : t('applications.timeline.form.receivedOn')
            }
            className="max-w-64"
          >
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                required
                max={type === 'MESSAGE' ? opened : undefined}
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            )}
          </Field>
        )}
        {type === 'INTERVIEW' && (
          <>
            <div className="flex flex-wrap gap-4">
              <Field label={t('applications.timeline.form.kind')} className="min-w-48">
                {(control) => (
                  <Select
                    {...control}
                    value={kind}
                    onChange={(event) => setKind(InterviewKindSchema.parse(event.target.value))}
                  >
                    {InterviewKindSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {t(`applications.timeline.kinds.${value}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('applications.timeline.form.outcome')} className="min-w-48">
                {(control) => (
                  <Select
                    {...control}
                    value={outcome}
                    onChange={(event) =>
                      setOutcome(InterviewOutcomeSchema.parse(event.target.value))
                    }
                  >
                    {InterviewOutcomeSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {t(`applications.timeline.outcomes.${value}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field
              label={t('applications.timeline.form.interviewers')}
              hint={t('applications.timeline.form.interviewersHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  value={interviewers}
                  onChange={(event) => setInterviewers(event.target.value)}
                />
              )}
            </Field>
          </>
        )}
        {type === 'MESSAGE' && (
          <div className="flex flex-wrap gap-4">
            <Field label={t('applications.timeline.form.channel')} className="min-w-48">
              {(control) => (
                <Select
                  {...control}
                  value={channel}
                  onChange={(event) => setChannel(MessageChannelSchema.parse(event.target.value))}
                >
                  {MessageChannelSchema.options.map((value) => (
                    <option key={value} value={value}>
                      {t(`applications.timeline.channels.${value}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('applications.timeline.form.from')} className="min-w-64 flex-1">
              {(control) => (
                <Input
                  {...control}
                  value={from}
                  maxLength={200}
                  onChange={(event) => setFrom(event.target.value)}
                />
              )}
            </Field>
          </div>
        )}
        <Field
          label={
            type === 'NOTE'
              ? t('applications.timeline.form.note')
              : type === 'INTERVIEW'
                ? t('applications.timeline.form.notes')
                : t('applications.timeline.form.message')
          }
        >
          {(control) => (
            <Textarea
              {...control}
              required={type !== 'INTERVIEW'}
              maxLength={5000}
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </Field>

        {add.error && <InlineError>{add.error.message}</InlineError>}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!ready || add.isPending}>
            {t('applications.timeline.form.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
