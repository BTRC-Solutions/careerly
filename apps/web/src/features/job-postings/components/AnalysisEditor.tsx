import {
  type JobAnalysis,
  RequirementImportanceSchema,
  RequirementKindSchema,
  RoleCategorySchema,
  SenioritySchema,
  TelemetryWorkModeSchema,
} from '@careerly/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useFieldError } from '../../../shared/lib/form-errors';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select } from '../../../shared/ui/form';
import { PlusIcon, TrashIcon } from '../../../shared/ui/icons';
import { InlineError } from '../../../shared/ui/InlineError';
import { useCorrectJobAnalysis } from '../api/job-analysis-api';
import {
  AnalysisFormSchema,
  analysisFormDefaults,
  type AnalysisFormInput,
  type AnalysisFormOutput,
} from '../lib/analysis-form-schema';

/**
 * Corrections to the analysis (RF-JD-03): the facts, the keywords, and the requirements, which can be
 * added, removed or changed. Tools are matched to the catalog again when it is saved.
 */
export function AnalysisEditor({
  jobPostingId,
  analysis,
  onDone,
}: {
  jobPostingId: string;
  analysis: JobAnalysis;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const correct = useCorrectJobAnalysis(jobPostingId);
  const form = useForm<AnalysisFormInput, unknown, AnalysisFormOutput>({
    resolver: zodResolver(AnalysisFormSchema),
    defaultValues: analysisFormDefaults(analysis),
  });
  const requirements = useFieldArray({ control: form.control, name: 'requirements' });
  const { errors } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await correct.mutateAsync(values);
    } catch {
      return; // Shown through `correct.error`.
    }
    onDone();
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label={t('jobPostings.analysis.edit.title')}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-3 gap-4">
        <Field label={t('jobPostings.analysis.roleCategory')}>
          {(control) => (
            <Select {...control} {...form.register('roleCategory')}>
              {RoleCategorySchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`jobPostings.analysis.roleCategories.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('jobPostings.analysis.seniority')}>
          {(control) => (
            <Select {...control} {...form.register('seniority')}>
              {SenioritySchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`jobPostings.analysis.seniorities.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('jobPostings.analysis.workMode')}>
          {(control) => (
            <Select {...control} {...form.register('workMode')}>
              {TelemetryWorkModeSchema.options.map((value) => (
                <option key={value} value={value}>
                  {t(`jobPostings.analysis.workModes.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('jobPostings.analysis.country')}
          hint={t('jobPostings.analysis.edit.countryHint')}
          error={fieldError(errors.country)}
        >
          {(control) => (
            <Input maxLength={2} className="uppercase" {...control} {...form.register('country')} />
          )}
        </Field>
        <Field
          label={t('jobPostings.analysis.years')}
          hint={t('jobPostings.analysis.edit.yearsHint')}
          error={fieldError(errors.yearsOfExperience)}
        >
          {(control) => (
            <Input inputMode="numeric" {...control} {...form.register('yearsOfExperience')} />
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-ink">
          {t('jobPostings.analysis.edit.requirements')}
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {requirements.fields.map((requirement, index) => {
            const labelError = fieldError(errors.requirements?.[index]?.label);
            return (
              <div
                key={requirement.id}
                className="grid grid-cols-[1fr_9rem_9rem_auto] items-start gap-2"
              >
                <div>
                  <Input
                    aria-label={t('jobPostings.analysis.edit.label', { number: index + 1 })}
                    aria-invalid={Boolean(labelError)}
                    {...form.register(`requirements.${index}.label`)}
                  />
                  {labelError && <p className="mt-1 text-sm text-slate-ink">{labelError}</p>}
                </div>
                <Select
                  aria-label={t('jobPostings.analysis.edit.kind', { number: index + 1 })}
                  {...form.register(`requirements.${index}.kind`)}
                >
                  {RequirementKindSchema.options.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`jobPostings.analysis.kinds.${kind}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label={t('jobPostings.analysis.edit.importance', { number: index + 1 })}
                  {...form.register(`requirements.${index}.importance`)}
                >
                  {RequirementImportanceSchema.options.map((importance) => (
                    <option key={importance} value={importance}>
                      {t(`jobPostings.analysis.importances.${importance}`)}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('jobPostings.analysis.edit.remove', {
                    label: form.getValues(`requirements.${index}.label`) || index + 1,
                  })}
                  onClick={() => requirements.remove(index)}
                >
                  <TrashIcon />
                </Button>
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => requirements.append({ label: '', kind: 'SKILL', importance: 'REQUIRED' })}
        >
          <PlusIcon /> {t('jobPostings.analysis.edit.add')}
        </Button>
      </fieldset>

      <Field
        label={t('jobPostings.analysis.keywords')}
        hint={t('jobPostings.analysis.edit.keywordsHint')}
      >
        {(control) => <Input {...control} {...form.register('keywords')} />}
      </Field>

      {correct.error && (
        <InlineError>{t('common.saveError', { message: correct.error.message })}</InlineError>
      )}
      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={correct.isPending}>
          {correct.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}
