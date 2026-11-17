import { z } from 'zod';

// ---------------------------------------------------------------------------
// Telemetry (RF-TEL-01 to RF-TEL-10, RN-18 to RN-21, ARCHITECTURE §19).
// Only usage metrics from a closed schema. NEVER the CV, the profile or personal data.
// ---------------------------------------------------------------------------

/** Bumped whenever a metric is added: users are asked again, only about the new ones (RF-TEL-04). */
export const TELEMETRY_CONSENT_VERSION = 1;

/** Each metric is enabled separately (RF-TEL-03). */
export const TelemetryMetricIdSchema = z.enum([
  'activeUsage',
  'applications',
  'sources',
  'positionCategories',
  'positionTitles',
  'funnel',
  'workModeAndCountry',
  'features',
]);
export type TelemetryMetricId = z.infer<typeof TelemetryMetricIdSchema>;

/** Consent version in which each metric was added. */
export const TELEMETRY_METRIC_SINCE: Record<TelemetryMetricId, number> = {
  activeUsage: 1,
  applications: 1,
  sources: 1,
  positionCategories: 1,
  positionTitles: 1,
  funnel: 1,
  workModeAndCountry: 1,
  features: 1,
};

// --- Report format (shared with the receiver) -------------------------------

/** Job portals reported by domain; anything else is `other`, no URL is `unknown` (RF-TEL-03c). */
export const KNOWN_JOB_PORTALS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'getonbrd.com',
  'computrabajo.com',
  'bumeran.com',
  'zonajobs.com',
  'infojobs.net',
  'tecnoempleo.com',
  'remoteok.com',
  'weworkremotely.com',
  'wellfound.com',
  'workable.com',
  'lever.co',
  'greenhouse.io',
  'stackoverflow.com',
] as const;
export const JobSourceSchema = z.enum([...KNOWN_JOB_PORTALS, 'other', 'unknown']);

/** Role category extracted from the job description (RF-JD-02). */
export const RoleCategorySchema = z.enum([
  'backend',
  'frontend',
  'fullstack',
  'mobile',
  'data',
  'ml',
  'devops',
  'qa',
  'security',
  'design',
  'product',
  'management',
  'other',
]);
export type RoleCategory = z.infer<typeof RoleCategorySchema>;
export const SenioritySchema = z.enum([
  'intern',
  'junior',
  'semi-senior',
  'senior',
  'lead',
  'principal',
  'unknown',
]);
export type Seniority = z.infer<typeof SenioritySchema>;
export const ApplicationStatusSchema = z.enum([
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'GHOSTED',
]);
export const TelemetryWorkModeSchema = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);
export type TelemetryWorkMode = z.infer<typeof TelemetryWorkModeSchema>;
export const OutputLanguageSchema = z.enum(['es', 'en']);

/** Maximum length of a reported position title (RF-TEL-03e). */
export const TELEMETRY_TITLE_MAX_LENGTH = 80;

const count = z.number().int().min(0).max(100_000);
/** `{ key: count }` where every key must belong to `keys` (no free text). Keys may be missing. */
const countsBy = <T extends z.ZodType<string>>(keys: T) => z.partialRecord(keys, count);

const PositionCategoryKeySchema = z.string().refine((key) => {
  const [category, seniority, ...rest] = key.split(':');
  return (
    rest.length === 0 &&
    RoleCategorySchema.safeParse(category).success &&
    SenioritySchema.safeParse(seniority).success
  );
}, 'Expected "<category>:<seniority>".');

/**
 * Metrics of one day. Strict at every level: a field outside this list makes the report fail (RN-18),
 * it is never dropped silently. Only enabled metrics appear (RN-19).
 */
export const TelemetryMetricsV1Schema = z
  .object({
    activeUsage: z.object({ active: z.literal(true) }).strict(),
    applications: z.object({ created: count }).strict(),
    sources: countsBy(JobSourceSchema),
    positionCategories: countsBy(PositionCategoryKeySchema),
    positionTitles: z.array(z.string().trim().min(1).max(TELEMETRY_TITLE_MAX_LENGTH)).max(50),
    funnel: countsBy(ApplicationStatusSchema),
    workMode: countsBy(TelemetryWorkModeSchema),
    /** ISO 3166-1 alpha-2. */
    countries: countsBy(z.string().regex(/^[A-Z]{2}$/)),
    features: z
      .object({
        resumesGenerated: count,
        outputLanguages: countsBy(OutputLanguageSchema),
        gapsAnswered: count,
        aiTokens: z.number().int().min(0).max(100_000_000),
      })
      .strict(),
  })
  .partial()
  .strict();
export type TelemetryMetricsV1 = z.infer<typeof TelemetryMetricsV1Schema>;

/** One report per installation per day (ARCHITECTURE §19.3). Idempotency key: `(installId, day)`. */
export const TelemetryReportV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    installId: z.uuid(),
    day: z.iso.date(),
    appVersion: z.string().min(1).max(50),
    metrics: TelemetryMetricsV1Schema,
  })
  .strict();
export type TelemetryReportV1 = z.infer<typeof TelemetryReportV1Schema>;

// --- Local API (`/telemetry/*`) -----------------------------------------------

export const TelemetryConsentStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export type TelemetryConsentStatus = z.infer<typeof TelemetryConsentStatusSchema>;

/** `GET /telemetry/settings` and `PATCH /telemetry/settings` response. */
export const TelemetrySettingsResponseSchema = z.object({
  /**
   * `PENDING`: the user never chose. `ACCEPTED`: at least one metric is enabled. `REJECTED`: none is.
   */
  status: TelemetryConsentStatusSchema,
  /** Consent version the user last answered (0 = never). */
  consentVersion: z.number().int().min(0),
  /** True when the consent window must be shown: never answered, or there are new metrics. */
  promptRequired: z.boolean(),
  metrics: z.array(
    z.object({
      id: TelemetryMetricIdSchema,
      enabled: z.boolean(),
      /** Added after the user's last answer: the window shows only these (RF-TEL-04). */
      isNew: z.boolean(),
    }),
  ),
  /** Anonymous installation id; `null` until the user accepts at least one metric (RN-19). */
  installId: z.uuid().nullable(),
});
export type TelemetrySettingsResponse = z.infer<typeof TelemetrySettingsResponseSchema>;

/**
 * `PATCH /telemetry/settings`.
 * - `decision` answers the consent window. `ACCEPT` enables the new metrics (or the ones given in
 *   `metrics`); `REJECT` disables the new metrics. Metrics answered before do not change (RF-TEL-04).
 * - Without `decision`, `metrics` toggles metrics from Settings → Privacy (RF-TEL-05).
 */
export const UpdateTelemetrySettingsRequestSchema = z
  .object({
    decision: z.enum(['ACCEPT', 'REJECT']).optional(),
    metrics: z.partialRecord(TelemetryMetricIdSchema, z.boolean()).optional(),
  })
  .strict()
  .refine((body) => body.decision !== undefined || body.metrics !== undefined, {
    message: 'Provide a decision or the metrics to change.',
  })
  .refine((body) => body.decision !== 'REJECT' || body.metrics === undefined, {
    message: '"REJECT" cannot be combined with metrics.',
  });
export type UpdateTelemetrySettingsRequest = z.infer<typeof UpdateTelemetrySettingsRequestSchema>;

/** `GET /telemetry/preview`: the exact report today's activity would produce, or `null` (RF-TEL-06). */
export const TelemetryPreviewResponseSchema = z.object({
  report: TelemetryReportV1Schema.nullable(),
});
export type TelemetryPreviewResponse = z.infer<typeof TelemetryPreviewResponseSchema>;

export const TelemetryReportStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED']);

/** `GET /telemetry/reports`: local history, newest first, exactly as built (RF-TEL-06). */
export const TelemetryReportsResponseSchema = z.object({
  reports: z.array(
    z.object({
      day: z.iso.date(),
      status: TelemetryReportStatusSchema,
      attempts: z.number().int().min(0),
      createdAt: z.iso.datetime(),
      sentAt: z.iso.datetime().nullable(),
      payload: TelemetryReportV1Schema,
    }),
  ),
});
export type TelemetryReportsResponse = z.infer<typeof TelemetryReportsResponseSchema>;

/** `POST /telemetry/install-id/regenerate` response (RF-TEL-07). */
export const RegenerateInstallIdResponseSchema = z.object({ installId: z.uuid() });
export type RegenerateInstallIdResponse = z.infer<typeof RegenerateInstallIdResponseSchema>;
