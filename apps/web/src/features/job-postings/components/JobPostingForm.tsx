import { type JobPosting, SalaryPeriodSchema, WorkModeSchema } from '@careerly/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useFieldError } from '../../../shared/lib/form-errors';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select, Textarea } from '../../../shared/ui/form';
import { InlineError } from '../../../shared/ui/InlineError';
import {
  formDefaults,
  type JobPostingFormInput,
  type JobPostingFormOutput,
  JobPostingFormSchema,
} from '../lib/form-schema';

/** The pasted job description plus its optional details (RF-JD-01). */
export function JobPostingForm({
  initial,
  submitLabel,
  pending,
  error,
  status,
  onSubmit,
}: {
  initial?: JobPosting;
  submitLabel: string;
  pending: boolean;
  error: Error | null;
  /** Short confirmation next to the button, e.g. "Saved". */
  status?: string;
  onSubmit: (body: JobPostingFormOutput) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const form = useForm<JobPostingFormInput, unknown, JobPostingFormOutput>({
    resolver: zodResolver(JobPostingFormSchema),
    defaultValues: formDefaults(initial),
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit(async (values) => {
          try {
            await onSubmit(values);
          } catch {
            // Shown below from the mutation.
          }
        })(event)
      }
      className="flex flex-col gap-6"
    >
      <Field
        label={t('jobPostings.form.text')}
        hint={t('jobPostings.form.textHint')}
        error={fieldError(errors.text)}
      >
        {(control) => <Textarea rows={14} {...control} {...form.register('text')} />}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t('jobPostings.form.title')} error={fieldError(errors.title)}>
          {(control) => <Input {...control} {...form.register('title')} />}
        </Field>
        <Field label={t('jobPostings.form.company')} error={fieldError(errors.company)}>
          {(control) => <Input {...control} {...form.register('company')} />}
        </Field>
        <Field label={t('jobPostings.form.location')} error={fieldError(errors.location)}>
          {(control) => <Input {...control} {...form.register('location')} />}
        </Field>
        <Field label={t('jobPostings.form.workMode')} error={fieldError(errors.workMode)}>
          {(control) => (
            <Select {...control} {...form.register('workMode')}>
              <option value="">{t('common.notSpecified')}</option>
              {WorkModeSchema.options.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`profile.enums.workMode.${mode}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('jobPostings.form.url')}
          error={fieldError(errors.url)}
          className="col-span-2"
        >
          {(control) => (
            <Input type="url" placeholder="https://" {...control} {...form.register('url')} />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-slate-ink">
          {t('jobPostings.form.salary')}
        </legend>
        <div className="grid grid-cols-4 gap-4">
          <Field label={t('jobPostings.form.salaryMin')} error={fieldError(errors.salaryMin)}>
            {(control) => (
              <Input inputMode="numeric" {...control} {...form.register('salaryMin')} />
            )}
          </Field>
          <Field label={t('jobPostings.form.salaryMax')} error={fieldError(errors.salaryMax)}>
            {(control) => (
              <Input inputMode="numeric" {...control} {...form.register('salaryMax')} />
            )}
          </Field>
          <Field
            label={t('jobPostings.form.salaryCurrency')}
            error={fieldError(errors.salaryCurrency)}
          >
            {(control) => (
              <Input
                placeholder="USD"
                maxLength={3}
                {...control}
                {...form.register('salaryCurrency')}
              />
            )}
          </Field>
          <Field label={t('jobPostings.form.salaryPeriod')} error={fieldError(errors.salaryPeriod)}>
            {(control) => (
              <Select {...control} {...form.register('salaryPeriod')}>
                <option value="">{t('common.notSpecified')}</option>
                {SalaryPeriodSchema.options.map((period) => (
                  <option key={period} value={period}>
                    {t(`jobPostings.salaryPeriod.${period}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        {error && <InlineError>{t('common.saveError', { message: error.message })}</InlineError>}
        <div className="flex items-center justify-end gap-3">
          <p role="status" className="mr-auto text-sm text-steel-text">
            {status}
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? t('common.saving') : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
