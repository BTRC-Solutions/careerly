import { z } from 'zod';

/*
 * CV templates (RF-TAIL-09, ADR-24): the built-in ones and the user's own `.typ` files (roadmap 4.12).
 */

/** Largest `.typ` file a user can upload; a template is plain text, so this is generous. */
export const USER_TEMPLATE_MAX_BYTES = 256 * 1024;

export const TemplateNameSchema = z.string().trim().min(1).max(80);

/** A template the CV can use: the built-in `classic` or one the user uploaded. */
export const TemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  builtIn: z.boolean(),
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

/** The text fields sent with the `.typ` file in `POST /templates`; the name defaults to the file name. */
export const UploadTemplateFieldsSchema = z.object({
  name: TemplateNameSchema.optional(),
});
export type UploadTemplateFields = z.infer<typeof UploadTemplateFieldsSchema>;

export const RenameTemplateRequestSchema = z.object({ name: TemplateNameSchema });
export type RenameTemplateRequest = z.infer<typeof RenameTemplateRequestSchema>;
