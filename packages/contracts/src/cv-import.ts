import { z } from 'zod';
import {
  CreateCertificationRequestSchema,
  CreateEducationRequestSchema,
  CreateLanguageSkillRequestSchema,
  CreatePositionRequestSchema,
  CreateProjectRequestSchema,
  CreateAchievementRequestSchema,
  EducationKindSchema,
  LanguageLevelSchema,
  LinkKindSchema,
  ProjectKindSchema,
  UpdatePersonalInfoRequestSchema,
  WorkModeSchema,
  YearMonthSchema,
} from './profile.js';

/*
 * Importing a CV into the master profile (RF-PROF-09, roadmap 2.7):
 * 1. `POST /profile/import` (PDF or DOCX) → a draft. Nothing is saved.
 * 2. The user reviews and corrects the draft.
 * 3. `POST /profile/import/confirm` → everything is created with origin `IMPORT`.
 */

/** Accepted CV files and their maximum size. */
export const CV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CV_IMPORT_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

/**
 * A tool as written in the CV, resolved against the catalog when possible (`toolId`).
 * Unresolved tools can be created by the user before confirming (`POST /tools`).
 */
export const DraftToolSchema = z.object({
  /** As written in the CV. */
  name: z.string(),
  toolId: z.string().nullable(),
  /** Catalog name when resolved, e.g. "PostgreSQL" for "postgres". */
  toolName: z.string().nullable(),
});
export type DraftTool = z.infer<typeof DraftToolSchema>;

const nullableText = z.string().nullable();
const nullableMonth = YearMonthSchema.nullable();

export const DraftAchievementSchema = z.object({
  text: z.string(),
  metrics: nullableText,
  tools: z.array(DraftToolSchema),
});
export type DraftAchievement = z.infer<typeof DraftAchievementSchema>;

/** `POST /profile/import` response: what the AI read, for the user to review. */
export const CvImportDraftSchema = z.object({
  personalInfo: z.object({
    firstNames: nullableText,
    lastNames: nullableText,
    headline: nullableText,
    location: nullableText,
    email: nullableText,
    phone: nullableText,
    summary: nullableText,
    links: z.array(z.object({ kind: LinkKindSchema, url: z.string(), label: nullableText })),
  }),
  positions: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: nullableText,
      workMode: WorkModeSchema.nullable(),
      /** Can be missing in a CV; the user must fill it in before confirming. */
      startDate: nullableMonth,
      endDate: nullableMonth,
      context: nullableText,
      tools: z.array(DraftToolSchema),
      achievements: z.array(DraftAchievementSchema),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      kind: ProjectKindSchema,
      role: nullableText,
      url: nullableText,
      startDate: nullableMonth,
      endDate: nullableMonth,
      description: nullableText,
      tools: z.array(DraftToolSchema),
      achievements: z.array(DraftAchievementSchema),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      title: z.string(),
      kind: EducationKindSchema,
      field: nullableText,
      startDate: nullableMonth,
      endDate: nullableMonth,
      description: nullableText,
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: nullableText,
      issueDate: nullableMonth,
      expirationDate: nullableMonth,
      credentialId: nullableText,
      url: nullableText,
    }),
  ),
  languages: z.array(
    z.object({ language: z.string(), level: LanguageLevelSchema, notes: nullableText }),
  ),
});
export type CvImportDraft = z.infer<typeof CvImportDraftSchema>;

/**
 * `POST /profile/import/confirm`: the reviewed draft, with the same rules as creating each element
 * by hand (tools as catalog ids). Personal info only overwrites the fields that are sent.
 */
export const ConfirmCvImportRequestSchema = z
  .object({
    personalInfo: UpdatePersonalInfoRequestSchema.optional(),
    positions: z
      .array(
        CreatePositionRequestSchema.extend({
          achievements: z.array(CreateAchievementRequestSchema).max(200).default([]),
        }),
      )
      .max(100)
      .default([]),
    projects: z
      .array(
        CreateProjectRequestSchema.extend({
          achievements: z.array(CreateAchievementRequestSchema).max(200).default([]),
        }),
      )
      .max(100)
      .default([]),
    education: z.array(CreateEducationRequestSchema).max(100).default([]),
    certifications: z.array(CreateCertificationRequestSchema).max(100).default([]),
    languages: z.array(CreateLanguageSkillRequestSchema).max(50).default([]),
  })
  .strict();
export type ConfirmCvImportRequest = z.infer<typeof ConfirmCvImportRequestSchema>;

/** `POST /profile/import/confirm` response: how many elements were created. */
export const ConfirmCvImportResponseSchema = z.object({
  personalInfoUpdated: z.boolean(),
  positions: z.number().int().nonnegative(),
  achievements: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
  education: z.number().int().nonnegative(),
  certifications: z.number().int().nonnegative(),
  languages: z.number().int().nonnegative(),
});
export type ConfirmCvImportResponse = z.infer<typeof ConfirmCvImportResponseSchema>;
