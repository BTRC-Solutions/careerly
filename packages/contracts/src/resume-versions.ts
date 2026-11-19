import { z } from 'zod';
import { ResumeLanguageSchema, TemplateDataSchema } from './resume.js';
import { PageBudgetSchema, TailoredResumeDataSchema } from './tailoring.js';

/*
 * Finalized CVs (RF-TAIL-14, RNF-10, ARCHITECTURE.md §9): one immutable `ResumeVersion` per language of a
 * finalized tailoring session. What was sent does not change: editing or deleting things in the profile, or
 * the template, leaves them as they were (RN-13).
 */

/**
 * The content of a finalized CV, frozen when it was finalized:
 * - `document`: exactly what the template received (`data.json`), so it can be rendered again (RNF-10).
 * - `sources`: the CV as reviewed, with the profile sources of every bullet and whether the user edited it
 *   (RF-TAIL-11, RN-05).
 */
export const ResumeVersionDataSchema = z.object({
  document: TemplateDataSchema,
  sources: TailoredResumeDataSchema,
});
export type ResumeVersionData = z.infer<typeof ResumeVersionDataSchema>;

/** A finalized CV, without its content. */
export const ResumeVersionSchema = z.object({
  id: z.string(),
  /** The tailoring session that finalized it. */
  sessionId: z.string(),
  language: ResumeLanguageSchema,
  templateId: z.string(),
  /** The template's name when it was finalized; the template may be renamed or deleted afterwards. */
  templateName: z.string(),
  templateVersion: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  pageBudget: PageBudgetSchema,
  /** SHA-256 of the data, the template id and its version. */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The name offered when downloading the PDF, e.g. "Ana Gómez - Backend Engineer - Acme (EN).pdf". */
  fileName: z.string().min(1),
  createdAt: z.iso.datetime(),
});
export type ResumeVersion = z.infer<typeof ResumeVersionSchema>;

/** `GET /tailoring-sessions/:id/resume-versions`: in the order of the session's languages. */
export const ResumeVersionListSchema = z.object({ versions: z.array(ResumeVersionSchema) });
export type ResumeVersionList = z.infer<typeof ResumeVersionListSchema>;

/**
 * `POST /tailoring-sessions/:id/finalize` (RF-TAIL-14): freezes every CV of the session. A CV over the page
 * budget needs `confirmOverBudget` (RN-04).
 */
export const FinalizeSessionRequestSchema = z
  .object({ confirmOverBudget: z.boolean().optional() })
  .strict();
export type FinalizeSessionRequest = z.infer<typeof FinalizeSessionRequestSchema>;
