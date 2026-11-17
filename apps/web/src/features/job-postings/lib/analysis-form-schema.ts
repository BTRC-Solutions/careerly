import { type JobAnalysis, UpdateJobAnalysisRequestSchema } from '@careerly/contracts';
import { z } from 'zod';

/*
 * The analysis corrections form (RF-JD-03): the shared request schema, with the country, the years and the
 * keywords as text inputs (empty means "not stated"; keywords are comma-separated).
 */

const request = UpdateJobAnalysisRequestSchema.shape;

export const AnalysisFormSchema = z
  .object({
    roleCategory: request.roleCategory,
    seniority: request.seniority,
    workMode: request.workMode,
    // `refine` (not `regex`) so the field shows its own message, not the generic format one.
    country: z
      .string()
      .trim()
      .refine((value) => /^([A-Za-z]{2})?$/.test(value), 'validation.countryCode'),
    yearsOfExperience: z
      .string()
      .trim()
      .refine((value) => /^\d*$/.test(value) && Number(value) <= 40, 'validation.years'),
    keywords: z.string(),
    requirements: request.requirements,
  })
  .transform(({ country, yearsOfExperience, keywords, ...fields }) => ({
    ...fields,
    country: country ? country.toUpperCase() : null,
    yearsOfExperience: yearsOfExperience === '' ? null : Number(yearsOfExperience),
    keywords: keywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, 30),
  }));

export type AnalysisFormInput = z.input<typeof AnalysisFormSchema>;
export type AnalysisFormOutput = z.output<typeof AnalysisFormSchema>;

export function analysisFormDefaults(analysis: JobAnalysis): AnalysisFormInput {
  return {
    roleCategory: analysis.roleCategory,
    seniority: analysis.seniority,
    workMode: analysis.workMode,
    country: analysis.country ?? '',
    yearsOfExperience: analysis.yearsOfExperience?.toString() ?? '',
    keywords: analysis.keywords.join(', '),
    requirements: analysis.requirements.map(({ id, label, kind, importance }) => ({
      id,
      label,
      kind,
      importance,
    })),
  };
}
