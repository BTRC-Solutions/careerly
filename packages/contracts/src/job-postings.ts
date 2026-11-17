import { z } from 'zod';
import { JobViewSchema } from './jobs.js';
import { WorkModeSchema } from './profile.js';
import { RoleCategorySchema, SenioritySchema, TelemetryWorkModeSchema } from './telemetry.js';

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

// ---------------------------------------------------------------------------
// Analysis (RF-JD-02, ADR-09)
// ---------------------------------------------------------------------------

/** What a requirement is about. `TOOL`s are matched to the tool catalog when possible. */
export const RequirementKindSchema = z.enum(['TOOL', 'SKILL', 'LANGUAGE', 'OTHER']);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const RequirementImportanceSchema = z.enum(['REQUIRED', 'NICE_TO_HAVE']);
export type RequirementImportance = z.infer<typeof RequirementImportanceSchema>;

export const JobRequirementSchema = z.object({
  id: z.string(),
  /** As the job description says it, e.g. "5+ years with Node.js" or "PostgreSQL". */
  label: z.string(),
  kind: RequirementKindSchema,
  importance: RequirementImportanceSchema,
  /** The catalog tool it was matched to (`TOOL` only), with its canonical name. */
  tool: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type JobRequirement = z.infer<typeof JobRequirementSchema>;

/** Structured analysis of a job description (RF-JD-02), produced by the AI and editable in step 4.6. */
export const JobAnalysisSchema = z.object({
  jobPostingId: z.string(),
  /** ISO 639-1 code of the job description, e.g. `es` or `en`. */
  language: z.string(),
  roleCategory: RoleCategorySchema,
  seniority: SenioritySchema,
  workMode: TelemetryWorkModeSchema,
  /** ISO 3166-1 alpha-2 country of the position, when stated. */
  country: z.string().nullable(),
  /** Minimum years of experience asked for, when stated. */
  yearsOfExperience: z.number().int().nonnegative().nullable(),
  keywords: z.array(z.string()),
  requirements: z.array(JobRequirementSchema),
  /** e.g. `jd-analysis.v1`. */
  promptVersion: z.string(),
  model: z.string(),
  analyzedAt: z.iso.datetime(),
});
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;

/** `GET /job-postings/:id/analysis`: the last analysis and the job of the one in progress, if any. */
export const JobAnalysisStateSchema = z.object({
  analysis: JobAnalysisSchema.nullable(),
  /** The latest analysis job (pending, running, or finished with its outcome). */
  job: JobViewSchema.nullable(),
});
export type JobAnalysisState = z.infer<typeof JobAnalysisStateSchema>;
