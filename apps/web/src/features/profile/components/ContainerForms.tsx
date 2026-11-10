import {
  type Position,
  type Project,
  ProjectKindSchema,
  WorkModeSchema,
} from '@careerly/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useFieldError } from '../../../shared/lib/form-errors';
import { Checkbox, Field, Input, Select, Textarea } from '../../../shared/ui/form';
import { monthOrNull } from '../lib/dates';
import { PositionFormSchema, ProjectFormSchema, withToolIds } from '../lib/form-schemas';
import { FormActions } from './FormActions';
import { ToolPicker } from './ToolPicker';

interface FormProps<TBody> {
  onSubmit: (body: TBody) => Promise<unknown>;
  pending: boolean;
  error: Error | null;
  onCancel?: () => void;
  submitLabel?: string;
  status?: string;
}

const monthField = { setValueAs: monthOrNull };

// --- Position (RF-PROF-02) ----------------------------------------------------------

type PositionInput = z.input<typeof PositionFormSchema>;
type PositionOutput = z.output<typeof PositionFormSchema>;
export type PositionBody = ReturnType<typeof positionBody>;

function positionBody({ current, ...values }: PositionOutput) {
  return withToolIds({ ...values, endDate: current ? null : values.endDate });
}

export function PositionForm({
  initial,
  onSubmit,
  ...actions
}: FormProps<PositionBody> & { initial?: Position }) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const form = useForm<PositionInput, unknown, PositionOutput>({
    resolver: zodResolver(PositionFormSchema),
    defaultValues: {
      company: initial?.company ?? '',
      title: initial?.title ?? '',
      location: initial?.location ?? '',
      workMode: initial?.workMode ?? null,
      startDate: initial?.startDate ?? null,
      endDate: initial?.endDate ?? null,
      current: initial ? initial.endDate === null : false,
      context: initial?.context ?? '',
      tools: initial?.tools ?? [],
    } as PositionInput,
  });
  const { errors } = form.formState;
  const current = useWatch({ control: form.control, name: 'current' });

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(positionBody(values));
      form.reset(form.getValues());
    } catch {
      // Shown by FormActions.
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('profile.position.title')} error={fieldError(errors.title)}>
          {(control) => <Input {...control} {...form.register('title')} />}
        </Field>
        <Field label={t('profile.position.company')} error={fieldError(errors.company)}>
          {(control) => <Input {...control} {...form.register('company')} />}
        </Field>
        <Field label={t('profile.position.location')} error={fieldError(errors.location)}>
          {(control) => <Input {...control} {...form.register('location')} />}
        </Field>
        <Field label={t('profile.position.workMode')} error={fieldError(errors.workMode)}>
          {(control) => (
            <Select
              {...control}
              {...form.register('workMode', { setValueAs: (v: string) => v || null })}
            >
              <option value="">{t('common.notSpecified')}</option>
              {WorkModeSchema.options.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`profile.enums.workMode.${mode}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('profile.dates.start')} error={fieldError(errors.startDate)}>
          {(control) => (
            <Input type="month" {...control} {...form.register('startDate', monthField)} />
          )}
        </Field>
        <Field label={t('profile.dates.end')} error={fieldError(errors.endDate)}>
          {(control) => (
            <div className="flex flex-col gap-2">
              <Input
                type="month"
                disabled={current}
                {...control}
                {...form.register('endDate', monthField)}
              />
              <Checkbox label={t('profile.position.current')} {...form.register('current')} />
            </div>
          )}
        </Field>
        <Field
          label={t('profile.position.context')}
          hint={t('profile.position.contextHint')}
          error={fieldError(errors.context)}
          className="col-span-2"
        >
          {(control) => <Textarea rows={3} {...control} {...form.register('context')} />}
        </Field>
        <Field
          label={t('profile.tools.label')}
          labelsControl={false}
          hint={t('profile.position.toolsHint')}
          className="col-span-2"
        >
          {({ id: _id, ...aria }) => (
            <Controller
              control={form.control}
              name="tools"
              render={({ field }) => (
                <ToolPicker value={field.value} onChange={field.onChange} {...aria} />
              )}
            />
          )}
        </Field>
      </div>
      <FormActions {...actions} />
    </form>
  );
}

// --- Project (RF-PROF-04) --------------------------------------------------------------

type ProjectInput = z.input<typeof ProjectFormSchema>;
type ProjectOutput = z.output<typeof ProjectFormSchema>;
export type ProjectBody = ReturnType<typeof withToolIds<ProjectOutput>>;

export function ProjectForm({
  initial,
  onSubmit,
  ...actions
}: FormProps<ProjectBody> & { initial?: Project }) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const form = useForm<ProjectInput, unknown, ProjectOutput>({
    resolver: zodResolver(ProjectFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      kind: initial?.kind ?? 'PERSONAL',
      role: initial?.role ?? '',
      url: initial?.url ?? '',
      startDate: initial?.startDate ?? null,
      endDate: initial?.endDate ?? null,
      description: initial?.description ?? '',
      tools: initial?.tools ?? [],
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(withToolIds(values));
      form.reset(form.getValues());
    } catch {
      // Shown by FormActions.
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('profile.project.name')} error={fieldError(errors.name)}>
          {(control) => <Input {...control} {...form.register('name')} />}
        </Field>
        <Field label={t('profile.project.kind')} error={fieldError(errors.kind)}>
          {(control) => (
            <Select {...control} {...form.register('kind')}>
              {ProjectKindSchema.options.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`profile.enums.projectKind.${kind}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('profile.project.role')} error={fieldError(errors.role)}>
          {(control) => <Input {...control} {...form.register('role')} />}
        </Field>
        <Field label={t('profile.project.url')} error={errors.url && t('validation.invalidUrl')}>
          {(control) => (
            <Input type="url" placeholder="https://" {...control} {...form.register('url')} />
          )}
        </Field>
        <Field label={t('profile.dates.start')} error={fieldError(errors.startDate)}>
          {(control) => (
            <Input type="month" {...control} {...form.register('startDate', monthField)} />
          )}
        </Field>
        <Field label={t('profile.dates.end')} error={fieldError(errors.endDate)}>
          {(control) => (
            <Input type="month" {...control} {...form.register('endDate', monthField)} />
          )}
        </Field>
        <Field
          label={t('profile.project.description')}
          error={fieldError(errors.description)}
          className="col-span-2"
        >
          {(control) => <Textarea rows={3} {...control} {...form.register('description')} />}
        </Field>
        <Field label={t('profile.tools.label')} labelsControl={false} className="col-span-2">
          {({ id: _id, ...aria }) => (
            <Controller
              control={form.control}
              name="tools"
              render={({ field }) => (
                <ToolPicker value={field.value} onChange={field.onChange} {...aria} />
              )}
            />
          )}
        </Field>
      </div>
      <FormActions {...actions} />
    </form>
  );
}
