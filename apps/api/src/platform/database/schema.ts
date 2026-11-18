import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Database schema (source for `npm run db:generate -w @careerly/api`).
 * Each module adds its tables here as the roadmap progresses.
 */

/** Non-secret preferences (`Setting` in ARCHITECTURE.md). The AI API key is never stored here. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON-encoded value, validated with Zod by the module that owns the key. */
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Tool catalog (`Tool` in ARCHITECTURE.md, RF-PROF-06). Owned by the `profile` module.
 * Seed tools have a stable `seedSlug`; tools created by the user have none.
 */
export const tools = sqliteTable('tools', {
  id: text('id').primaryKey(),
  seedSlug: text('seed_slug').unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * Synonyms of a tool (`ToolAlias`). The canonical name is stored here too, so every lookup
 * goes through `normalized`, which is unique: a name resolves to at most one tool.
 */
export const toolAliases = sqliteTable(
  'tool_aliases',
  {
    normalized: text('normalized').primaryKey(),
    /** As written, for display. */
    alias: text('alias').notNull(),
    toolId: text('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
  },
  (table) => [index('tool_aliases_tool_id_idx').on(table.toolId)],
);

// ---------------------------------------------------------------------------
// Master profile (owned by the `profile` module; RF-PROF-01 to RF-PROF-05, RF-PROF-07).
// Dates are "YYYY-MM" strings; timestamps are ISO strings.
// ---------------------------------------------------------------------------

/** Origin and timestamps shared by every element of the profile (RF-PROF-07). */
const provenance = () => ({
  /** `MANUAL`, `IMPORT` or `GAP_ANSWER`. */
  origin: text('origin').notNull().default('MANUAL'),
  /** Tailoring session that created the element (`GAP_ANSWER`). No FK yet: sessions arrive in F5. */
  originSessionId: text('origin_session_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Personal information: a single row (`id = 1`). There is only one user and one profile. */
export const profilePersonalInfo = sqliteTable(
  'profile_personal_info',
  {
    id: integer('id').primaryKey(),
    /** Given name(s), e.g. "María José". */
    firstNames: text('first_names'),
    /** Surname(s), e.g. "García López". */
    lastNames: text('last_names'),
    headline: text('headline'),
    location: text('location'),
    email: text('email'),
    phone: text('phone'),
    summary: text('summary'),
    /** JSON array of `ProfileLink`, validated with Zod. */
    links: text('links').notNull().default('[]'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('profile_personal_info_single_row', sql`${table.id} = 1`)],
);

export const positions = sqliteTable('positions', {
  id: text('id').primaryKey(),
  company: text('company').notNull(),
  title: text('title').notNull(),
  location: text('location'),
  workMode: text('work_mode'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  context: text('context'),
  ...provenance(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  role: text('role'),
  url: text('url'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  description: text('description'),
  ...provenance(),
});

/** Belongs to exactly one position or one project; `sort_order` is the user's order inside it. */
export const achievements = sqliteTable(
  'achievements',
  {
    id: text('id').primaryKey(),
    positionId: text('position_id').references(() => positions.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    metrics: text('metrics'),
    sortOrder: integer('sort_order').notNull(),
    ...provenance(),
  },
  (table) => [
    check(
      'achievements_single_parent',
      sql`(${table.positionId} IS NULL) <> (${table.projectId} IS NULL)`,
    ),
    index('achievements_position_id_idx').on(table.positionId, table.sortOrder),
    index('achievements_project_id_idx').on(table.projectId, table.sortOrder),
  ],
);

/** Link from a profile element to a catalog tool. Tools cannot be deleted while referenced. */
const toolLink = (ownerColumn: string, owner: () => AnySQLiteColumn) => ({
  ownerId: text(ownerColumn).notNull().references(owner, { onDelete: 'cascade' }),
  toolId: text('tool_id')
    .notNull()
    .references(() => tools.id),
});

export const positionTools = sqliteTable(
  'position_tools',
  toolLink('position_id', () => positions.id),
  (table) => [
    primaryKey({ columns: [table.ownerId, table.toolId] }),
    index('position_tools_tool_id_idx').on(table.toolId),
  ],
);

export const projectTools = sqliteTable(
  'project_tools',
  toolLink('project_id', () => projects.id),
  (table) => [
    primaryKey({ columns: [table.ownerId, table.toolId] }),
    index('project_tools_tool_id_idx').on(table.toolId),
  ],
);

export const achievementTools = sqliteTable(
  'achievement_tools',
  toolLink('achievement_id', () => achievements.id),
  (table) => [
    primaryKey({ columns: [table.ownerId, table.toolId] }),
    index('achievement_tools_tool_id_idx').on(table.toolId),
  ],
);

export const education = sqliteTable('education', {
  id: text('id').primaryKey(),
  institution: text('institution').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  field: text('field'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  description: text('description'),
  ...provenance(),
});

export const certifications = sqliteTable('certifications', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  issuer: text('issuer'),
  issueDate: text('issue_date'),
  expirationDate: text('expiration_date'),
  credentialId: text('credential_id'),
  url: text('url'),
  ...provenance(),
});

export const languageSkills = sqliteTable('language_skills', {
  id: text('id').primaryKey(),
  language: text('language').notNull(),
  level: text('level').notNull(),
  notes: text('notes'),
  ...provenance(),
});

/**
 * Writes a tailoring session made to the profile, so they can be undone (RF-PROF-07, RF-TAIL-06).
 * `before`/`after` hold only the fields an update touched; a creation needs neither.
 */
export const profileChanges = sqliteTable(
  'profile_changes',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    /** `position`, `project` or `achievement`. */
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    /** `CREATE` or `UPDATE`. */
    kind: text('kind').notNull(),
    /** JSON object of field values. */
    before: text('before'),
    after: text('after'),
    /** `updated_at` of the element before and after the update. */
    previousUpdatedAt: text('previous_updated_at'),
    resultUpdatedAt: text('result_updated_at'),
    createdAt: text('created_at').notNull(),
    revertedAt: text('reverted_at'),
  },
  (table) => [index('profile_changes_session_id_idx').on(table.sessionId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Telemetry (owned by the `telemetry` module; RF-TEL-06, RF-TEL-08, ARCHITECTURE §19.2).
// Preferences (install id, enabled metrics, consent version) live in `settings`.
// ---------------------------------------------------------------------------

/** Local days (YYYY-MM-DD) in which the app was used, recorded only while telemetry is accepted. */
export const telemetryActivityDays = sqliteTable('telemetry_activity_days', {
  day: text('day').primaryKey(),
});

/** One built report per day, stored exactly as it is (or will be) sent. */
export const telemetryReports = sqliteTable(
  'telemetry_reports',
  {
    day: text('day').primaryKey(),
    /** JSON of a `TelemetryReportV1`. */
    payload: text('payload').notNull(),
    status: text('status', { enum: ['PENDING', 'SENT', 'FAILED'] }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: text('created_at').notNull(),
    sentAt: text('sent_at'),
  },
  (table) => [index('telemetry_reports_status_idx').on(table.status)],
);

// ---------------------------------------------------------------------------
// AI usage (owned by the `ai` module; RNF-06, RF-CONF-06, ARCHITECTURE §7.3).
// One row per call attempt. Never the prompt, the answer or the API key: only what is needed to
// report usage and cost.
// ---------------------------------------------------------------------------

export const aiGenerations = sqliteTable(
  'ai_generations',
  {
    id: text('id').primaryKey(),
    /** `AiTask`, e.g. `cv-import`. */
    task: text('task').notNull(),
    /** `AiProvider`, e.g. `gemini`. */
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** Version of the prompt file used, e.g. `cv-import.v1`. */
    promptVersion: text('prompt_version').notNull(),
    /** 1 for the first try, 2 for the retry after an invalid answer. */
    attempt: integer('attempt').notNull(),
    /** `AiGenerationStatus`. */
    status: text('status').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** Estimated from the price table in code; informative only (D-02). */
    costUsd: real('cost_usd').notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
    /** Error class when it failed (e.g. `AiRateLimitedError`); never provider messages. */
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('ai_generations_created_at_idx').on(table.createdAt)],
);

// ---------------------------------------------------------------------------
// Job descriptions (owned by the `job-postings` module; RF-JD-01).
// ---------------------------------------------------------------------------

export const jobPostings = sqliteTable(
  'job_postings',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    company: text('company'),
    url: text('url'),
    location: text('location'),
    /** `WorkMode`. */
    workMode: text('work_mode'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    /** ISO 4217. */
    salaryCurrency: text('salary_currency'),
    /** `SalaryPeriod`. */
    salaryPeriod: text('salary_period'),
    /** The job description as pasted (untrusted for the AI). */
    text: text('text').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('job_postings_created_at_idx').on(table.createdAt)],
);

/** The AI analysis of a job description (RF-JD-02); one per posting, replaced when analyzed again. */
export const jobAnalyses = sqliteTable('job_analyses', {
  jobPostingId: text('job_posting_id')
    .primaryKey()
    .references(() => jobPostings.id, { onDelete: 'cascade' }),
  /** ISO 639-1. */
  language: text('language').notNull(),
  /** `RoleCategory`. */
  roleCategory: text('role_category').notNull(),
  /** `Seniority`. */
  seniority: text('seniority').notNull(),
  /** `remote`, `hybrid`, `onsite` or `unknown`. */
  workMode: text('work_mode').notNull(),
  /** ISO 3166-1 alpha-2. */
  country: text('country'),
  yearsOfExperience: integer('years_of_experience'),
  /** JSON array of strings. */
  keywords: text('keywords').notNull(),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  analyzedAt: text('analyzed_at').notNull(),
  /** Last correction by the user (RF-JD-03); null while it is as the AI produced it. */
  editedAt: text('edited_at'),
});

/**
 * Requirements of a job description, normalized so they can be aggregated across postings (ADR-09).
 * `tool_id` points to the profile module's catalog without a foreign key (modules do not share tables);
 * `tool_name` keeps the name it had when matched.
 */
export const jobRequirements = sqliteTable(
  'job_requirements',
  {
    id: text('id').primaryKey(),
    jobPostingId: text('job_posting_id')
      .notNull()
      .references(() => jobPostings.id, { onDelete: 'cascade' }),
    /** Order in the analysis. */
    position: integer('position').notNull(),
    label: text('label').notNull(),
    /** `RequirementKind`. */
    kind: text('kind').notNull(),
    /** `RequirementImportance`. */
    importance: text('importance').notNull(),
    toolId: text('tool_id'),
    toolName: text('tool_name'),
  },
  (table) => [
    index('job_requirements_posting_idx').on(table.jobPostingId, table.position),
    index('job_requirements_tool_idx').on(table.toolId),
  ],
);

// ---------------------------------------------------------------------------
// Background jobs (owned by the `jobs` module; ARCHITECTURE §10).
// ---------------------------------------------------------------------------

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    /** Handler that runs it, e.g. `jd-analysis`. */
    type: text('type').notNull(),
    /** JSON with ids only: the handler reads the content from its module (no profile or JD text here). */
    payload: text('payload').notNull(),
    /** Makes enqueueing idempotent, e.g. `<sessionId>:<step>`. */
    dedupeKey: text('dedupe_key'),
    /** `JobStatus`. */
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    /** Not before this instant (retries wait with exponential backoff). */
    runAt: text('run_at').notNull(),
    /** Error code or class of the last failure; never its message (it could carry content). */
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (table) => [
    uniqueIndex('jobs_dedupe_key_idx').on(table.dedupeKey),
    index('jobs_status_run_at_idx').on(table.status, table.runAt),
  ],
);

// ---------------------------------------------------------------------------
// Tailoring sessions (owned by the `tailoring` module; ARCHITECTURE §6–7).
// ---------------------------------------------------------------------------

/**
 * One CV adaptation for a job description (RF-TAIL-01). `job_posting_id` has no foreign key: the posting
 * belongs to another module (modules do not share tables), and a session outlives its posting.
 */
export const tailoringSessions = sqliteTable(
  'tailoring_sessions',
  {
    id: text('id').primaryKey(),
    jobPostingId: text('job_posting_id').notNull(),
    /** JSON array of `ResumeLanguage`. */
    languages: text('languages').notNull(),
    /** 1 or 2. */
    pageBudget: integer('page_budget').notNull(),
    templateId: text('template_id').notNull(),
    /** `TailoringSessionStatus`. */
    status: text('status').notNull(),
    /** `TailoringFailedStep`, only while `FAILED`. */
    failedStep: text('failed_step'),
    /** JSON `MatchResult`: ids and requirement labels, no profile text. */
    match: text('match'),
    /** JSON `Regeneration` while one is in course (RF-TAIL-13); it holds the user's indications. */
    regeneration: text('regeneration'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('tailoring_sessions_posting_idx').on(table.jobPostingId),
    index('tailoring_sessions_updated_at_idx').on(table.updatedAt),
  ],
);

/**
 * The tailored CV of one session and language (RF-TAIL-10, RF-TAIL-11). `data` holds only the worded parts and
 * profile ids (`TailoredResumeData`); the rest is copied from the profile when the CV is built (RN-03).
 */
export const tailoredResumes = sqliteTable(
  'tailored_resumes',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => tailoringSessions.id, { onDelete: 'cascade' }),
    /** `ResumeLanguage`. */
    language: text('language').notNull(),
    /** JSON `TailoredResumeData`. */
    data: text('data').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    generatedAt: text('generated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.language] })],
);
