import type {
  ResumeDocument,
  ResumeLabels,
  ResumeLanguage,
  TemplateData,
} from '@careerly/contracts';

/*
 * Fixed CV texts per language. The app adds them to the data every template receives, so built-in and uploaded
 * templates are bilingual without their own translations. Section titles are the standard ones ATS look for.
 */

const LEVELS_AS_WRITTEN = { C2: 'C2', C1: 'C1', B2: 'B2', B1: 'B1', A2: 'A2', A1: 'A1' } as const;

export const RESUME_LABELS: Record<ResumeLanguage, ResumeLabels> = {
  es: {
    sections: {
      summary: 'Perfil profesional',
      experience: 'Experiencia laboral',
      projects: 'Proyectos',
      skills: 'Habilidades técnicas',
      education: 'Educación',
      certifications: 'Certificaciones',
      languages: 'Idiomas',
    },
    present: 'actualidad',
    months: [
      'ene.',
      'feb.',
      'mar.',
      'abr.',
      'may.',
      'jun.',
      'jul.',
      'ago.',
      'sep.',
      'oct.',
      'nov.',
      'dic.',
    ],
    levels: { NATIVE: 'nativo', ...LEVELS_AS_WRITTEN },
  },
  en: {
    sections: {
      summary: 'Summary',
      experience: 'Work Experience',
      projects: 'Projects',
      skills: 'Skills',
      education: 'Education',
      certifications: 'Certifications',
      languages: 'Languages',
    },
    present: 'Present',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    levels: { NATIVE: 'native', ...LEVELS_AS_WRITTEN },
  },
};

/** The `data.json` a template receives for a document. */
export function toTemplateData(document: ResumeDocument): TemplateData {
  return { ...document, labels: RESUME_LABELS[document.language] };
}
