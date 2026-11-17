import {
  CreateJobPostingRequestSchema,
  type JobPosting,
  SalaryPeriodSchema,
  WorkModeSchema,
} from '@careerly/contracts';
import { z } from 'zod';

/*
 * The job posting form: the shared create schema, with the salary as separate text inputs (a range is
 * only sent when it has an amount) and the checks shown next to each field.
 */

const amount = z
  .string()
  .trim()
  .regex(/^\d*$/, 'validation.wholeNumber')
  .transform((value) => (value === '' ? null : Number(value)));

export const JobPostingFormSchema = CreateJobPostingRequestSchema.omit({
  salary: true,
  workMode: true,
})
  .extend({
    workMode: z.union([WorkModeSchema, z.literal('')]),
    salaryMin: amount,
    salaryMax: amount,
    salaryCurrency: z
      .string()
      .trim()
      .regex(/^([A-Za-z]{3})?$/, 'validation.currency'),
    salaryPeriod: z.union([SalaryPeriodSchema, z.literal('')]),
  })
  .superRefine((value, ctx) => {
    if (value.salaryMin !== null && value.salaryMax !== null && value.salaryMax < value.salaryMin) {
      ctx.addIssue({ code: 'custom', path: ['salaryMax'], message: 'validation.salaryRange' });
    }
  })
  .transform(({ salaryMin, salaryMax, salaryCurrency, salaryPeriod, workMode, ...fields }) => ({
    ...fields,
    workMode: workMode || null,
    salary:
      salaryMin === null && salaryMax === null
        ? null
        : {
            min: salaryMin,
            max: salaryMax,
            currency: salaryCurrency ? salaryCurrency.toUpperCase() : null,
            period: salaryPeriod || null,
          },
  }));

export type JobPostingFormInput = z.input<typeof JobPostingFormSchema>;
export type JobPostingFormOutput = z.output<typeof JobPostingFormSchema>;

export function formDefaults(posting?: JobPosting): JobPostingFormInput {
  return {
    text: posting?.text ?? '',
    title: posting?.title ?? '',
    company: posting?.company ?? '',
    url: posting?.url ?? '',
    location: posting?.location ?? '',
    workMode: posting?.workMode ?? '',
    salaryMin: posting?.salary?.min?.toString() ?? '',
    salaryMax: posting?.salary?.max?.toString() ?? '',
    salaryCurrency: posting?.salary?.currency ?? '',
    salaryPeriod: posting?.salary?.period ?? '',
  };
}
