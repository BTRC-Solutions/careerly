import { z } from 'zod';
import { LanguageLevelSchema, YearMonthSchema } from './profile.js';

/*
 * The data a CV template renders (ARCHITECTURE.md §9). It is already chosen and worded: the template only lays
 * it out. Templates (built in or uploaded by the user) read it as JSON, never as code (RNF-05).
 */

/** Languages a CV can be written in; fixed texts come translated in `ResumeLabels`. */
export const ResumeLanguageSchema = z.enum(['es', 'en']);
export type ResumeLanguage = z.infer<typeof ResumeLanguageSchema>;

export const ResumePaperSchema = z.enum(['a4', 'us-letter']);
export type ResumePaper = z.infer<typeof ResumePaperSchema>;

const text = z.string().trim().min(1);
const bullets = z.array(text);

export const ResumeLinkSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  /** Shown instead of the URL, e.g. "linkedin.com/in/ana". */
  label: text.nullable(),
});

export const ResumeBasicsSchema = z.object({
  name: text,
  headline: text.nullable(),
  location: text.nullable(),
  email: text.nullable(),
  phone: text.nullable(),
  links: z.array(ResumeLinkSchema),
});

export const ResumePositionSchema = z.object({
  company: text,
  title: text,
  location: text.nullable(),
  startDate: YearMonthSchema,
  /** `null` while the position is current. */
  endDate: YearMonthSchema.nullable(),
  bullets,
});

export const ResumeProjectSchema = z.object({
  name: text,
  role: text.nullable(),
  url: z.url({ protocol: /^https?$/ }).nullable(),
  startDate: YearMonthSchema.nullable(),
  endDate: YearMonthSchema.nullable(),
  bullets,
});

export const ResumeEducationSchema = z.object({
  institution: text,
  title: text,
  field: text.nullable(),
  startDate: YearMonthSchema.nullable(),
  endDate: YearMonthSchema.nullable(),
});

export const ResumeCertificationSchema = z.object({
  name: text,
  issuer: text.nullable(),
  issueDate: YearMonthSchema.nullable(),
});

export const ResumeSkillGroupSchema = z.object({
  /** e.g. "Backend"; `null` for a single unlabeled list. */
  label: text.nullable(),
  items: z.array(text).min(1),
});

export const ResumeLanguageSkillSchema = z.object({
  language: text,
  level: LanguageLevelSchema,
});

/** Sections are rendered in a fixed, standard order; empty ones are left out. */
export const ResumeDocumentSchema = z.object({
  language: ResumeLanguageSchema,
  paper: ResumePaperSchema,
  basics: ResumeBasicsSchema,
  summary: text.nullable(),
  experience: z.array(ResumePositionSchema),
  projects: z.array(ResumeProjectSchema),
  skills: z.array(ResumeSkillGroupSchema),
  education: z.array(ResumeEducationSchema),
  certifications: z.array(ResumeCertificationSchema),
  languages: z.array(ResumeLanguageSkillSchema),
});
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>;

/** Section keys, in the order templates are expected to render them. */
export const RESUME_SECTIONS = [
  'summary',
  'experience',
  'projects',
  'skills',
  'education',
  'certifications',
  'languages',
] as const;
export type ResumeSection = (typeof RESUME_SECTIONS)[number];

/**
 * Fixed texts in the CV's language, added by the app so any template is bilingual without its own translations:
 * standard section titles (ATS look for them), month abbreviations, "present" and language levels.
 */
export const ResumeLabelsSchema = z.object({
  sections: z.record(z.enum(RESUME_SECTIONS), text),
  present: text,
  months: z.array(text).length(12),
  levels: z.record(LanguageLevelSchema, text),
});
export type ResumeLabels = z.infer<typeof ResumeLabelsSchema>;

/** What a template receives in `data.json`: the document plus the labels for its language. */
export const TemplateDataSchema = ResumeDocumentSchema.extend({ labels: ResumeLabelsSchema });
export type TemplateData = z.infer<typeof TemplateDataSchema>;
