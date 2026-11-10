import {
  type Certification,
  CreateLanguageSkillRequestSchema,
  type Education,
  EducationKindSchema,
  LanguageLevelSchema,
  type LanguageSkill,
} from '@careerly/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useFieldError } from '../../../shared/lib/form-errors';
import { Field, Input, Select, Textarea } from '../../../shared/ui/form';
import { monthOrNull } from '../lib/dates';
import { CertificationFormSchema, EducationFormSchema } from '../lib/form-schemas';
import { FormActions } from './FormActions';

interface FormProps<TBody> {
  onSubmit: (body: TBody) => Promise<unknown>;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  submitLabel?: string;
}

const monthField = { setValueAs: monthOrNull };

/** Runs the submit and swallows the error: FormActions shows it from the mutation. */
async function attempt(action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    // Shown by FormActions.
  }
}

// --- Education (RF-PROF-05) ---------------------------------------------------------

type EducationOutput = z.output<typeof EducationFormSchema>;

export function EducationForm({
  initial,
  onSubmit,
  ...actions
}: FormProps<EducationOutput> & { initial?: Education }) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const form = useForm<z.input<typeof EducationFormSchema>, unknown, EducationOutput>({
    resolver: zodResolver(EducationFormSchema),
    defaultValues: {
      institution: initial?.institution ?? '',
      title: initial?.title ?? '',
      kind: initial?.kind ?? 'DEGREE',
      field: initial?.field ?? '',
      startDate: initial?.startDate ?? null,
      endDate: initial?.endDate ?? null,
      description: initial?.description ?? '',
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={(e) => void form.handleSubmit((v) => attempt(() => onSubmit(v)))(e)} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('profile.education.titleField')} error={fieldError(errors.title)}>
          {(control) => <Input {...control} {...form.register('title')} />}
        </Field>
        <Field label={t('profile.education.institution')} error={fieldError(errors.institution)}>
          {(control) => <Input {...control} {...form.register('institution')} />}
        </Field>
        <Field label={t('profile.education.kind')} error={fieldError(errors.kind)}>
          {(control) => (
            <Select {...control} {...form.register('kind')}>
              {EducationKindSchema.options.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`profile.enums.educationKind.${kind}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('profile.education.field')} error={fieldError(errors.field)}>
          {(control) => <Input {...control} {...form.register('field')} />}
        </Field>
        <Field label={t('profile.dates.start')} error={fieldError(errors.startDate)}>
          {(control) => (
            <Input type="month" {...control} {...form.register('startDate', monthField)} />
          )}
        </Field>
        <Field
          label={t('profile.dates.end')}
          hint={t('profile.education.endHint')}
          error={fieldError(errors.endDate)}
        >
          {(control) => (
            <Input type="month" {...control} {...form.register('endDate', monthField)} />
          )}
        </Field>
        <Field
          label={t('profile.education.description')}
          error={fieldError(errors.description)}
          className="col-span-2"
        >
          {(control) => <Textarea rows={3} {...control} {...form.register('description')} />}
        </Field>
      </div>
      <FormActions {...actions} />
    </form>
  );
}

// --- Certifications (RF-PROF-05) --------------------------------------------------------

type CertificationOutput = z.output<typeof CertificationFormSchema>;

export function CertificationForm({
  initial,
  onSubmit,
  ...actions
}: FormProps<CertificationOutput> & { initial?: Certification }) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const form = useForm<z.input<typeof CertificationFormSchema>, unknown, CertificationOutput>({
    resolver: zodResolver(CertificationFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      issuer: initial?.issuer ?? '',
      issueDate: initial?.issueDate ?? null,
      expirationDate: initial?.expirationDate ?? null,
      credentialId: initial?.credentialId ?? '',
      url: initial?.url ?? '',
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={(e) => void form.handleSubmit((v) => attempt(() => onSubmit(v)))(e)} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('profile.certifications.name')} error={fieldError(errors.name)}>
          {(control) => <Input {...control} {...form.register('name')} />}
        </Field>
        <Field label={t('profile.certifications.issuer')} error={fieldError(errors.issuer)}>
          {(control) => <Input {...control} {...form.register('issuer')} />}
        </Field>
        <Field label={t('profile.certifications.issueDate')} error={fieldError(errors.issueDate)}>
          {(control) => (
            <Input type="month" {...control} {...form.register('issueDate', monthField)} />
          )}
        </Field>
        <Field
          label={t('profile.certifications.expirationDate')}
          error={fieldError(errors.expirationDate)}
        >
          {(control) => (
            <Input type="month" {...control} {...form.register('expirationDate', monthField)} />
          )}
        </Field>
        <Field
          label={t('profile.certifications.credentialId')}
          error={fieldError(errors.credentialId)}
        >
          {(control) => <Input {...control} {...form.register('credentialId')} />}
        </Field>
        <Field
          label={t('profile.certifications.url')}
          error={errors.url && t('validation.invalidUrl')}
        >
          {(control) => (
            <Input type="url" placeholder="https://" {...control} {...form.register('url')} />
          )}
        </Field>
      </div>
      <FormActions {...actions} />
    </form>
  );
}

// --- Languages (RF-PROF-05) ----------------------------------------------------------------

type LanguageOutput = z.output<typeof CreateLanguageSkillRequestSchema>;

export function LanguageForm({
  initial,
  onSubmit,
  ...actions
}: FormProps<LanguageOutput> & { initial?: LanguageSkill }) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const form = useForm<z.input<typeof CreateLanguageSkillRequestSchema>, unknown, LanguageOutput>({
    resolver: zodResolver(CreateLanguageSkillRequestSchema),
    defaultValues: {
      language: initial?.language ?? '',
      level: initial?.level ?? 'B2',
      notes: initial?.notes ?? '',
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={(e) => void form.handleSubmit((v) => attempt(() => onSubmit(v)))(e)} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('profile.languages.language')} error={fieldError(errors.language)}>
          {(control) => <Input {...control} {...form.register('language')} />}
        </Field>
        <Field label={t('profile.languages.level')} error={fieldError(errors.level)}>
          {(control) => (
            <Select {...control} {...form.register('level')}>
              {LanguageLevelSchema.options.map((level) => (
                <option key={level} value={level}>
                  {t(`profile.enums.languageLevel.${level}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('profile.languages.notes')}
          hint={t('profile.languages.notesHint')}
          error={fieldError(errors.notes)}
          className="col-span-2"
        >
          {(control) => <Input {...control} {...form.register('notes')} />}
        </Field>
      </div>
      <FormActions {...actions} />
    </form>
  );
}
