import { z } from 'zod';
import { ApplicationStatusSchema } from './applications.js';
import { ISO_COUNTRY_CODES } from './countries.js';

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
export const TelemetryWorkModeSchema = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);
export type TelemetryWorkMode = z.infer<typeof TelemetryWorkModeSchema>;
export const OutputLanguageSchema = z.enum(['es', 'en']);

/** Maximum length of a reported position title (RF-TEL-03e). */
export const TELEMETRY_TITLE_MAX_LENGTH = 80;

/**
 * Plausibility ranges (ARCHITECTURE §19.4, ADR-26): the same for the app, before signing, and for the receiver,
 * where a value out of range rejects the whole batch. They never clip: an impossible value is discarded.
 */
export const TELEMETRY_MAX_DAILY_COUNT = 100;
export const TELEMETRY_MAX_DAILY_AI_TOKENS = 5_000_000;

const count = z.number().int().min(0).max(TELEMETRY_MAX_DAILY_COUNT);
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
    /** ISO 3166-1 alpha-2, only codes in use. */
    countries: countsBy(z.enum(ISO_COUNTRY_CODES)),
    features: z
      .object({
        resumesGenerated: count,
        outputLanguages: countsBy(OutputLanguageSchema),
        gapsAnswered: count,
        aiTokens: z.number().int().min(0).max(TELEMETRY_MAX_DAILY_AI_TOKENS),
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

// --- Sending (ARCHITECTURE §19.3–19.4, ADR-26) --------------------------------

/** Largest body the receiver reads; thirty full reports fit with room to spare. */
export const TELEMETRY_MAX_BODY_BYTES = 16 * 1024;
/** Days back a report may be sent, to cover the time without connection (RF-TEL-08). */
export const TELEMETRY_MAX_DAYS_BACK = 30;
/** Ed25519 signature of the exact body bytes, in base64. */
export const TELEMETRY_SIGNATURE_HEADER = 'x-careerly-signature';
/** Nonce of the proof of work, only for an installation the receiver does not know yet. */
export const TELEMETRY_POW_HEADER = 'x-careerly-pow';
/** The public page shows a value only when at least this many installations reported it (RN-20). */
export const TELEMETRY_ANONYMITY_THRESHOLD = 5;

/**
 * `PUT /internal/telemetry-secret`: the secret Electron's main keeps with `safeStorage` (32 random bytes in
 * base64url), from which the API derives each installation's signing key (ADR-26). `null` when the system has no
 * secure storage: then nothing is sent.
 */
export const TelemetrySecretSchema = z.object({
  secret: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .nullable(),
});
export type TelemetrySecret = z.infer<typeof TelemetrySecretSchema>;

/** An Ed25519 public key: its 32 raw bytes in base64url, without padding. */
export const TelemetryPublicKeySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * `POST /v1/reports`: every pending daily report of one installation, in one signed request per day. The
 * public key goes only in the first request of the installation.
 */
export const TelemetryBatchV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    installId: z.uuid(),
    sentAt: z.iso.datetime({ offset: true }),
    publicKey: TelemetryPublicKeySchema.optional(),
    reports: z
      .array(TelemetryReportV1Schema)
      .min(1)
      .max(TELEMETRY_MAX_DAYS_BACK + 2),
  })
  .strict()
  .refine((batch) => batch.reports.every((report) => report.installId === batch.installId), {
    message: 'Every report must belong to the installation of the batch.',
    path: ['reports'],
  })
  .refine(
    (batch) => new Set(batch.reports.map((report) => report.day)).size === batch.reports.length,
    {
      message: 'Each day goes once.',
      path: ['reports'],
    },
  );
export type TelemetryBatchV1 = z.infer<typeof TelemetryBatchV1Schema>;

/**
 * What the proof of work hashes with SHA-256 (hashcash): the hash must start with `difficulty` zero bits.
 * `utcDay` is the receiver's day, so a proof cannot be computed in advance.
 */
export function telemetryPowChallenge(
  installId: string,
  publicKey: string,
  utcDay: string,
  nonce: string,
): string {
  return `${installId}:${publicKey}:${utcDay}:${nonce}`;
}

/** `202` from `POST /v1/reports`: the days stored, and the ones ignored because they had arrived before. */
export const TelemetryBatchAcceptedSchema = z.object({
  accepted: z.array(z.iso.date()),
  duplicates: z.array(z.iso.date()),
});
export type TelemetryBatchAccepted = z.infer<typeof TelemetryBatchAcceptedSchema>;

/** Error answers of the receiver. `428` adds the difficulty the proof of work needs. */
export const TelemetryErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum([
      'UNSUPPORTED_MEDIA_TYPE',
      'PAYLOAD_TOO_LARGE',
      'RATE_LIMITED',
      'INVALID_SIGNATURE',
      'PROOF_OF_WORK_REQUIRED',
      'ALREADY_SENT_TODAY',
      'INVALID_REPORT',
      'SCHEMA_VERSION_GONE',
      'UNAUTHORIZED',
      'INVALID_PERIOD',
    ]),
    difficulty: z.number().int().min(0).optional(),
  }),
});
export type TelemetryErrorResponse = z.infer<typeof TelemetryErrorResponseSchema>;

// --- Aggregates for the public page (ARCHITECTURE §19.4–19.5) ------------------

/** A count that is `null` when fewer installations than the threshold are behind it (RN-20). */
const anonymousCount = z.number().int().min(0).nullable();

/** `GET /internal/stats`: aggregates of a period, already filtered by the anonymity threshold. */
export const TelemetryStatsSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** Installations that reported use in the period. */
  activeInstalls: anonymousCount,
  /** Installations that reported use, per day and per week (the Monday that starts it). */
  activeByDay: z.array(z.object({ day: z.iso.date(), installs: anonymousCount })),
  activeByWeek: z.array(z.object({ week: z.iso.date(), installs: anonymousCount })),
  /** Applications created per week. */
  applicationsByWeek: z.array(z.object({ week: z.iso.date(), created: anonymousCount })),
  /** Every map below keeps only the values that at least the threshold of installations reported. */
  sources: z.record(z.string(), z.number().int()),
  positionCategories: z.record(z.string(), z.number().int()),
  funnel: z.record(z.string(), z.number().int()),
  workMode: z.record(z.string(), z.number().int()),
  countries: z.record(z.string(), z.number().int()),
  outputLanguages: z.record(z.string(), z.number().int()),
  /** Titles grouped ignoring case and spaces, each reported by at least the threshold of installations. */
  positionTitles: z.array(z.object({ title: z.string(), installs: z.number().int() })),
  /** Totals of feature use, `null` below the threshold. */
  features: z.object({
    installs: anonymousCount,
    resumesGenerated: anonymousCount,
    gapsAnswered: anonymousCount,
    /** Median of the AI tokens per installation and day with use, less sensitive to outliers. */
    medianDailyAiTokens: anonymousCount,
  }),
});
export type TelemetryStats = z.infer<typeof TelemetryStatsSchema>;

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
