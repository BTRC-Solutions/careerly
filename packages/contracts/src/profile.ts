import { z } from 'zod';

/*
 * Master profile (RF-PROF-01 to RF-PROF-05, RF-PROF-07, RF-PROF-11).
 * Content can be written in any language; nothing here is translated.
 */

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** Month precision, as in a CV: "2023-04". */
export const YearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month in YYYY-MM format.');
export type YearMonth = z.infer<typeof YearMonthSchema>;

/** Required single-line text. */
const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Optional text: missing, `null` and `""` all mean "no value" and are stored as `null`. */
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

const optionalMonth = YearMonthSchema.nullish().transform((value) => value ?? null);

/** Where an element of the profile came from (RF-PROF-07). */
export const ProfileOriginSchema = z.enum(['MANUAL', 'IMPORT', 'GAP_ANSWER']);
export type ProfileOrigin = z.infer<typeof ProfileOriginSchema>;

/** Read-only fields present on every element of the profile. */
const ProvenanceShape = {
  origin: ProfileOriginSchema,
  /** Tailoring session that created the element when `origin` is `GAP_ANSWER`. */
  originSessionId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

/** A tool referenced by the profile (full details come from `GET /tools/:id`). */
export const ToolRefSchema = z.object({ id: z.string(), name: z.string() });
export type ToolRef = z.infer<typeof ToolRefSchema>;

/** Tool ids from the catalog. Duplicates are ignored. */
const ToolIdsSchema = z
  .array(z.string().min(1))
  .max(100)
  .transform((ids) => [...new Set(ids)]);

/**
 * Body of every PATCH: at least one field, unknown keys rejected.
 * The base schema must not use `.default()`: Zod applies defaults inside `.partial()`, which would
 * overwrite fields the client did not send (e.g. clear `toolIds`).
 */
const nonEmptyPatch = <T extends z.ZodObject>(schema: T) =>
  schema
    .partial()
    .strict()
    .refine((patch) => Object.keys(patch).length > 0, {
      message: 'At least one field must be provided.',
    });

// ---------------------------------------------------------------------------
// Personal information (RF-PROF-01)
// ---------------------------------------------------------------------------

export const LinkKindSchema = z.enum(['LINKEDIN', 'GITHUB', 'PORTFOLIO', 'WEBSITE', 'OTHER']);
export type LinkKind = z.infer<typeof LinkKindSchema>;

export const ProfileLinkSchema = z.object({
  kind: LinkKindSchema,
  url: z.url({ protocol: /^https?$/ }),
  /** Optional display text, e.g. "Blog". */
  label: optionalText(80),
});
export type ProfileLink = z.infer<typeof ProfileLinkSchema>;

export const PersonalInfoSchema = z.object({
  fullName: z.string().nullable(),
  /** Professional headline, e.g. "Senior Backend Engineer". */
  headline: z.string().nullable(),
  location: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** Free-form summary; source material for the CV summary, not final text. */
  summary: z.string().nullable(),
  links: z.array(ProfileLinkSchema),
  /** `null` until the personal information is saved for the first time. */
  updatedAt: z.iso.datetime().nullable(),
});
export type PersonalInfo = z.infer<typeof PersonalInfoSchema>;

/** `PATCH /profile/personal-info`. */
export const UpdatePersonalInfoRequestSchema = nonEmptyPatch(
  z.object({
    fullName: optionalText(120),
    headline: optionalText(160),
    location: optionalText(120),
    email: z
      .union([z.email(), z.literal('')])
      .nullish()
      .transform((value) => (value ? value : null)),
    phone: optionalText(40),
    summary: optionalText(5000),
    links: z.array(ProfileLinkSchema).max(20),
  }),
);
export type UpdatePersonalInfoRequest = z.infer<typeof UpdatePersonalInfoRequestSchema>;

// ---------------------------------------------------------------------------
// Achievements (RF-PROF-03): the smallest unit, belongs to a position or a project
// ---------------------------------------------------------------------------

export const AchievementSchema = z.object({
  id: z.string(),
  /** Detailed, factual description. Source material, not final CV text. */
  text: z.string(),
  /** Optional metrics, e.g. "-40% p95 latency, 3M requests/day". */
  metrics: z.string().nullable(),
  tools: z.array(ToolRefSchema),
  ...ProvenanceShape,
});
export type Achievement = z.infer<typeof AchievementSchema>;

const AchievementFields = z.object({
  text: requiredText(5000),
  metrics: optionalText(1000),
  toolIds: ToolIdsSchema,
});

/** `POST /profile/positions/:id/achievements` and `POST /profile/projects/:id/achievements`. */
export const CreateAchievementRequestSchema = AchievementFields.extend({
  toolIds: ToolIdsSchema.default([]),
}).strict();
export type CreateAchievementRequest = z.infer<typeof CreateAchievementRequestSchema>;

/** `PATCH /profile/achievements/:id`. `toolIds` replaces the whole list. */
export const UpdateAchievementRequestSchema = nonEmptyPatch(AchievementFields);
export type UpdateAchievementRequest = z.infer<typeof UpdateAchievementRequestSchema>;

/** `PUT /profile/positions/:id/achievements/order` (and projects): every achievement id, in the new order. */
export const ReorderAchievementsRequestSchema = z
  .object({ achievementIds: z.array(z.string().min(1)).min(1).max(1000) })
  .strict();
export type ReorderAchievementsRequest = z.infer<typeof ReorderAchievementsRequestSchema>;

// ---------------------------------------------------------------------------
// Positions / work experience (RF-PROF-02)
// ---------------------------------------------------------------------------

export const WorkModeSchema = z.enum(['ONSITE', 'REMOTE', 'HYBRID']);
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const PositionSchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  workMode: WorkModeSchema.nullable(),
  startDate: YearMonthSchema,
  /** `null` while it is the current job. */
  endDate: YearMonthSchema.nullable(),
  /** Context: product, team, industry, scale. */
  context: z.string().nullable(),
  tools: z.array(ToolRefSchema),
  /** In the user's order. */
  achievements: z.array(AchievementSchema),
  ...ProvenanceShape,
});
export type Position = z.infer<typeof PositionSchema>;

const PositionFields = z.object({
  company: requiredText(160),
  title: requiredText(160),
  location: optionalText(120),
  workMode: WorkModeSchema.nullish().transform((value) => value ?? null),
  startDate: YearMonthSchema,
  endDate: optionalMonth,
  context: optionalText(10000),
  toolIds: ToolIdsSchema,
});

/** `POST /profile/positions`. Achievements are added separately. */
export const CreatePositionRequestSchema = PositionFields.extend({
  toolIds: ToolIdsSchema.default([]),
}).strict();
export type CreatePositionRequest = z.infer<typeof CreatePositionRequestSchema>;

/** `PATCH /profile/positions/:id`. */
export const UpdatePositionRequestSchema = nonEmptyPatch(PositionFields);
export type UpdatePositionRequest = z.infer<typeof UpdatePositionRequestSchema>;

// ---------------------------------------------------------------------------
// Projects (RF-PROF-04): same shape as positions regarding achievements
// ---------------------------------------------------------------------------

export const ProjectKindSchema = z.enum(['PERSONAL', 'OPEN_SOURCE', 'COURSE', 'FREELANCE']);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: ProjectKindSchema,
  /** The user's role in the project, e.g. "Maintainer". */
  role: z.string().nullable(),
  url: z.string().nullable(),
  startDate: YearMonthSchema.nullable(),
  endDate: YearMonthSchema.nullable(),
  description: z.string().nullable(),
  tools: z.array(ToolRefSchema),
  achievements: z.array(AchievementSchema),
  ...ProvenanceShape,
});
export type Project = z.infer<typeof ProjectSchema>;

const ProjectFields = z.object({
  name: requiredText(160),
  kind: ProjectKindSchema,
  role: optionalText(120),
  url: optionalUrl,
  startDate: optionalMonth,
  endDate: optionalMonth,
  description: optionalText(10000),
  toolIds: ToolIdsSchema,
});

export const CreateProjectRequestSchema = ProjectFields.extend({
  toolIds: ToolIdsSchema.default([]),
}).strict();
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = nonEmptyPatch(ProjectFields);
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

// ---------------------------------------------------------------------------
// Education and courses (RF-PROF-05)
// ---------------------------------------------------------------------------

export const EducationKindSchema = z.enum(['DEGREE', 'COURSE', 'BOOTCAMP', 'OTHER']);
export type EducationKind = z.infer<typeof EducationKindSchema>;

export const EducationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  /** Degree or course name, e.g. "Ingeniería en Sistemas". */
  title: z.string(),
  kind: EducationKindSchema,
  field: z.string().nullable(),
  startDate: YearMonthSchema.nullable(),
  /** `null` while in progress (or unknown). */
  endDate: YearMonthSchema.nullable(),
  description: z.string().nullable(),
  ...ProvenanceShape,
});
export type Education = z.infer<typeof EducationSchema>;

const EducationFields = z.object({
  institution: requiredText(160),
  title: requiredText(160),
  kind: EducationKindSchema,
  field: optionalText(160),
  startDate: optionalMonth,
  endDate: optionalMonth,
  description: optionalText(5000),
});

export const CreateEducationRequestSchema = EducationFields.extend({
  kind: EducationKindSchema.default('DEGREE'),
}).strict();
export type CreateEducationRequest = z.infer<typeof CreateEducationRequestSchema>;

export const UpdateEducationRequestSchema = nonEmptyPatch(EducationFields);
export type UpdateEducationRequest = z.infer<typeof UpdateEducationRequestSchema>;

// ---------------------------------------------------------------------------
// Certifications (RF-PROF-05)
// ---------------------------------------------------------------------------

export const CertificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string().nullable(),
  issueDate: YearMonthSchema.nullable(),
  expirationDate: YearMonthSchema.nullable(),
  credentialId: z.string().nullable(),
  url: z.string().nullable(),
  ...ProvenanceShape,
});
export type Certification = z.infer<typeof CertificationSchema>;

const CertificationFields = z.object({
  name: requiredText(160),
  issuer: optionalText(160),
  issueDate: optionalMonth,
  expirationDate: optionalMonth,
  credentialId: optionalText(120),
  url: optionalUrl,
});

export const CreateCertificationRequestSchema = CertificationFields.strict();
export type CreateCertificationRequest = z.infer<typeof CreateCertificationRequestSchema>;

export const UpdateCertificationRequestSchema = nonEmptyPatch(CertificationFields);
export type UpdateCertificationRequest = z.infer<typeof UpdateCertificationRequestSchema>;

// ---------------------------------------------------------------------------
// Languages (RF-PROF-05)
// ---------------------------------------------------------------------------

/** CEFR levels plus native. Ordered from highest to lowest. */
export const LanguageLevelSchema = z.enum(['NATIVE', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1']);
export type LanguageLevel = z.infer<typeof LanguageLevelSchema>;

export const LanguageSkillSchema = z.object({
  id: z.string(),
  /** As the user writes it, e.g. "Inglés" or "English". */
  language: z.string(),
  level: LanguageLevelSchema,
  notes: z.string().nullable(),
  ...ProvenanceShape,
});
export type LanguageSkill = z.infer<typeof LanguageSkillSchema>;

const LanguageSkillFields = z.object({
  language: requiredText(80),
  level: LanguageLevelSchema,
  notes: optionalText(500),
});

export const CreateLanguageSkillRequestSchema = LanguageSkillFields.strict();
export type CreateLanguageSkillRequest = z.infer<typeof CreateLanguageSkillRequestSchema>;

export const UpdateLanguageSkillRequestSchema = nonEmptyPatch(LanguageSkillFields);
export type UpdateLanguageSkillRequest = z.infer<typeof UpdateLanguageSkillRequestSchema>;

// ---------------------------------------------------------------------------
// Whole profile
// ---------------------------------------------------------------------------

/**
 * `GET /profile`. Lists come sorted for display: positions, projects and education in reverse
 * chronological order (current ones first), certifications by issue date, languages by level.
 */
export const ProfileSchema = z.object({
  personalInfo: PersonalInfoSchema,
  positions: z.array(PositionSchema),
  projects: z.array(ProjectSchema),
  education: z.array(EducationSchema),
  certifications: z.array(CertificationSchema),
  languages: z.array(LanguageSkillSchema),
});
export type Profile = z.infer<typeof ProfileSchema>;
