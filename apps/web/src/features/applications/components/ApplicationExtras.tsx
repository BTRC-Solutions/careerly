import {
  type Application,
  ApplicationChannelSchema,
  ApplicationPrioritySchema,
  type Contact,
  ContactRoleSchema,
} from '@careerly/contracts';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Dialog, DialogActions } from '../../../shared/ui/Dialog';
import { Field, Input, Select } from '../../../shared/ui/form';
import { PencilIcon, PlusIcon, TrashIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import {
  useContacts,
  useDeleteContact,
  useSaveContact,
  useUpdateApplication,
} from '../api/applications-api';

/*
 * The extra data and contacts of an application (roadmap 7.6, RF-APP-05, RF-APP-07). Unlike the timeline, they
 * are edited freely. They never leave the computer (not even in telemetry).
 */

/** Channel, priority and salaries, saved together. Empty means unknown. */
export function ApplicationDetailsCard({ application }: { application: Application }) {
  const { t } = useTranslation();
  const update = useUpdateApplication(application.id);
  const [channel, setChannel] = useState(application.channel ?? '');
  const [priority, setPriority] = useState(application.priority ?? '');
  const [salaryExpected, setSalaryExpected] = useState(application.salaryExpected ?? '');
  const [salaryOffered, setSalaryOffered] = useState(application.salaryOffered ?? '');
  const [saved, setSaved] = useState(false);

  const orNull = (value: string) => (value.trim() ? value.trim() : null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    update.mutate(
      {
        channel: channel ? ApplicationChannelSchema.parse(channel) : null,
        priority: priority ? ApplicationPrioritySchema.parse(priority) : null,
        salaryExpected: orNull(salaryExpected),
        salaryOffered: orNull(salaryOffered),
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="text-section-title text-indigo-navy">{t('applications.details.title')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('applications.details.channel')}>
            {(control) => (
              <Select {...control} value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">{t('applications.details.unknown')}</option>
                {ApplicationChannelSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {t(`applications.details.channels.${value}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('applications.details.priority')}>
            {(control) => (
              <Select {...control} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">{t('applications.details.unknown')}</option>
                {ApplicationPrioritySchema.options.map((value) => (
                  <option key={value} value={value}>
                    {t(`applications.details.priorities.${value}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t('applications.details.salaryExpected')}
            hint={t('applications.details.salaryHint')}
          >
            {(control) => (
              <Input
                {...control}
                maxLength={100}
                value={salaryExpected}
                onChange={(e) => setSalaryExpected(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('applications.details.salaryOffered')}>
            {(control) => (
              <Input
                {...control}
                maxLength={100}
                value={salaryOffered}
                onChange={(e) => setSalaryOffered(e.target.value)}
              />
            )}
          </Field>
        </div>
        {update.error && <InlineError>{update.error.message}</InlineError>}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={update.isPending}>
            {t('applications.details.save')}
          </Button>
          {saved && (
            <p role="status" className="text-sm text-steel-text">
              {t('applications.details.saved')}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

/** The people of the company in the process, to add, edit and delete. */
export function ContactsCard({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation();
  const contacts = useContacts(applicationId);
  const remove = useDeleteContact(applicationId);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-section-title text-indigo-navy">{t('applications.contacts.title')}</h2>
        <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
          <PlusIcon />
          {t('applications.contacts.add')}
        </Button>
      </div>
      {contacts.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('applications.loading')}
        </p>
      )}
      {contacts.isError && <InlineError>{t('applications.contacts.loadError')}</InlineError>}
      {contacts.data?.contacts.length === 0 && (
        <p className="text-sm text-steel-text">{t('applications.contacts.none')}</p>
      )}
      {contacts.data && contacts.data.contacts.length > 0 && (
        <ul
          aria-label={t('applications.contacts.title')}
          className="flex flex-col divide-y divide-silver-lining"
        >
          {contacts.data.contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-ink">
                  {contact.name}{' '}
                  <span className="font-normal text-steel-text">
                    · {t(`applications.contacts.roles.${contact.role}`)}
                  </span>
                </p>
                {contact.email && (
                  <p className="text-sm break-all text-slate-ink select-text">{contact.email}</p>
                )}
                {contact.linkedinUrl && (
                  <a
                    href={contact.linkedinUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-medium break-all text-indigo-navy underline underline-offset-2"
                  >
                    {t('applications.contacts.linkedin')}
                  </a>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('applications.contacts.edit', { name: contact.name })}
                  onClick={() => setEditing(contact)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('applications.contacts.delete', { name: contact.name })}
                  onClick={() => setDeleting(contact)}
                >
                  <TrashIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ContactDialog
          applicationId={applicationId}
          contact={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('applications.contacts.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('applications.contacts.deleteDescription')}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </Card>
  );
}

function ContactDialog({
  applicationId,
  contact,
  onClose,
}: {
  applicationId: string;
  contact: Contact | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveContact(applicationId);
  const [name, setName] = useState(contact?.name ?? '');
  const [role, setRole] = useState(contact?.role ?? 'RECRUITER');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [linkedinUrl, setLinkedinUrl] = useState(contact?.linkedinUrl ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      {
        ...(contact ? { contactId: contact.id } : {}),
        name: name.trim(),
        role,
        email: email.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  const title = contact ? t('applications.contacts.editTitle') : t('applications.contacts.add');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('applications.contacts.name')}>
          {(control) => (
            <Input
              {...control}
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('applications.contacts.role')}>
          {(control) => (
            <Select
              {...control}
              value={role}
              onChange={(e) => setRole(ContactRoleSchema.parse(e.target.value))}
            >
              {ContactRoleSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`applications.contacts.roles.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('applications.contacts.email')}>
          {(control) => (
            <Input
              {...control}
              type="email"
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('applications.contacts.linkedinUrl')}>
          {(control) => (
            <Input
              {...control}
              type="url"
              pattern="https?://.*"
              maxLength={500}
              placeholder="https://www.linkedin.com/in/…"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
            />
          )}
        </Field>
        {save.error && <InlineError>{save.error.message}</InlineError>}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            {t('applications.contacts.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
