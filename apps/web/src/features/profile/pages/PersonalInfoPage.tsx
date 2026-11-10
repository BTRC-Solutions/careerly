import {
  LinkKindSchema,
  type PersonalInfo,
  UpdatePersonalInfoRequestSchema,
} from '@careerly/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useFieldError } from '../../../shared/lib/form-errors';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select, Textarea } from '../../../shared/ui/form';
import { PlusIcon, TrashIcon } from '../../../shared/ui/icons';
import { useUpdatePersonalInfo } from '../api/profile-api';
import { FormActions } from '../components/FormActions';
import { SectionCard, WithProfile } from '../components/ProfileLayout';

type FormInput = z.input<typeof UpdatePersonalInfoRequestSchema>;
type FormOutput = z.output<typeof UpdatePersonalInfoRequestSchema>;

export function PersonalInfoPage() {
  return <WithProfile>{(profile) => <PersonalInfoForm info={profile.personalInfo} />}</WithProfile>;
}

function PersonalInfoForm({ info }: { info: PersonalInfo }) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const update = useUpdatePersonalInfo();
  const [saved, setSaved] = useState(false);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(UpdatePersonalInfoRequestSchema),
    defaultValues: {
      fullName: info.fullName ?? '',
      headline: info.headline ?? '',
      location: info.location ?? '',
      email: info.email ?? '',
      phone: info.phone ?? '',
      summary: info.summary ?? '',
      links: info.links.map((link) => ({ ...link, label: link.label ?? '' })),
    },
  });
  const links = useFieldArray({ control: form.control, name: 'links' });
  const { errors } = form.formState;
  // The schema is a partial PATCH, so RHF types `errors.links` loosely; read it as a per-row list.
  const linkErrors = errors.links as ({ url?: unknown } | undefined)[] | undefined;

  const submit = form.handleSubmit(async (values) => {
    setSaved(false);
    try {
      await update.mutateAsync(values);
    } catch {
      return; // Shown by FormActions through `update.error`.
    }
    form.reset(form.getValues());
    setSaved(true);
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <SectionCard title={t('profile.personal.title')}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('profile.personal.fullName')} error={fieldError(errors.fullName)}>
            {(control) => <Input autoComplete="name" {...control} {...form.register('fullName')} />}
          </Field>
          <Field
            label={t('profile.personal.headline')}
            hint={t('profile.personal.headlineHint')}
            error={fieldError(errors.headline)}
          >
            {(control) => <Input {...control} {...form.register('headline')} />}
          </Field>
          <Field label={t('profile.personal.email')} error={fieldError(errors.email)}>
            {(control) => (
              <Input type="email" autoComplete="email" {...control} {...form.register('email')} />
            )}
          </Field>
          <Field label={t('profile.personal.phone')} error={fieldError(errors.phone)}>
            {(control) => (
              <Input type="tel" autoComplete="tel" {...control} {...form.register('phone')} />
            )}
          </Field>
          <Field
            label={t('profile.personal.location')}
            error={fieldError(errors.location)}
            className="col-span-2"
          >
            {(control) => <Input {...control} {...form.register('location')} />}
          </Field>
          <Field
            label={t('profile.personal.summary')}
            hint={t('profile.personal.summaryHint')}
            error={fieldError(errors.summary)}
            className="col-span-2"
          >
            {(control) => <Textarea rows={5} {...control} {...form.register('summary')} />}
          </Field>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-slate-ink">
            {t('profile.personal.links')}
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {links.fields.map((link, index) => (
              <div
                key={link.id}
                className="grid grid-cols-[10rem_1fr_10rem_auto] items-start gap-2"
              >
                <Select
                  aria-label={t('profile.personal.linkKind')}
                  {...form.register(`links.${index}.kind`)}
                >
                  {LinkKindSchema.options.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`profile.enums.linkKind.${kind}`)}
                    </option>
                  ))}
                </Select>
                <div>
                  <Input
                    type="url"
                    placeholder="https://"
                    aria-label={t('profile.personal.linkUrl')}
                    aria-invalid={Boolean(linkErrors?.[index]?.url)}
                    {...form.register(`links.${index}.url`)}
                  />
                  {Boolean(linkErrors?.[index]?.url) && (
                    <p className="mt-1 text-sm text-slate-ink">{t('validation.invalidUrl')}</p>
                  )}
                </div>
                <Input
                  placeholder={t('profile.personal.linkLabelPlaceholder')}
                  aria-label={t('profile.personal.linkLabel')}
                  {...form.register(`links.${index}.label`)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-0.5"
                  aria-label={t('profile.personal.removeLink')}
                  onClick={() => links.remove(index)}
                >
                  <TrashIcon />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => links.append({ kind: 'LINKEDIN', url: '', label: '' })}
          >
            <PlusIcon /> {t('profile.personal.addLink')}
          </Button>
        </fieldset>

        <FormActions
          pending={update.isPending}
          error={update.error}
          status={saved && !form.formState.isDirty ? t('common.saved') : undefined}
        />
      </SectionCard>
    </form>
  );
}
