import { z } from 'zod';
import { WorkModeSchema } from './profile.js';

/*
 * Job descriptions (RF-JD-01). The text is pasted by the user and is untrusted data for the AI (prompt
 * injection): it is analyzed in step 4.5, never followed as instructions.
 */

/** Longest job description accepted: long postings are ~15k characters. */
export const JOB_POSTING_TEXT_MAX = 50_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

const optionalUrl = z
  .union([z.url({ protocol: /^https?$/ }), z.literal('')])
  .nullish()
  .transform((value) => (value ? value : null));

export const SalaryPeriodSchema = z.enum(['YEAR', 'MONTH', 'HOUR']);
export type SalaryPeriod = z.infer<typeof SalaryPeriodSchema>;

/** Salary range as published; any part can be missing. */
export const SalaryRangeSchema = z
  .object({
    min: z.number().int().nonnegative().nullable(),
    max: z.number().int().nonnegative().nullable(),
    /** ISO 4217, e.g. `USD`, `ARS`, `EUR`. */
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'Expected a 3-letter currency code.')
      .transform((value) => value.toUpperCase())
      .nullable(),
    period: SalaryPeriodSchema.nullable(),
  })
  .refine((salary) => salary.min === null || salary.max === null || salary.max >= salary.min, {
    message: 'The maximum salary cannot be lower than the minimum.',
    path: ['max'],
  });
export type SalaryRange = z.infer<typeof SalaryRangeSchema>;

export const JobPostingSchema = z.object({
  id: z.string(),
  /** Job title as published, e.g. "Senior Backend Engineer". */
  title: z.string().nullable(),
  company: z.string().nullable(),
  url: z.string().nullable(),
  location: z.string().nullable(),
  workMode: WorkModeSchema.nullable(),
  salary: SalaryRangeSchema.nullable(),
  /** The job description as pasted. */
  text: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

/** A row of the list: everything but the text, plus its first characters. */
export const JobPostingSummarySchema = JobPostingSchema.omit({ text: true }).extend({
  excerpt: z.string(),
});
export type JobPostingSummary = z.infer<typeof JobPostingSummarySchema>;

const JobPostingFields = z.object({
  title: optionalText(200),
  company: optionalText(160),
  url: optionalUrl,
  location: optionalText(160),
  workMode: WorkModeSchema.nullish().transform((value) => value ?? null),
  salary: SalaryRangeSchema.nullish().transform((value) =>
    value && (value.min !== null || value.max !== null) ? value : null,
  ),
  text: z.string().trim().min(1).max(JOB_POSTING_TEXT_MAX),
});

/** `POST /job-postings`: only the text is required. */
export const CreateJobPostingRequestSchema = JobPostingFields.strict();
export type CreateJobPostingRequest = z.infer<typeof CreateJobPostingRequestSchema>;

/** `PATCH /job-postings/:id`: the fields to change. */
export const UpdateJobPostingRequestSchema = JobPostingFields.partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateJobPostingRequest = z.infer<typeof UpdateJobPostingRequestSchema>;
