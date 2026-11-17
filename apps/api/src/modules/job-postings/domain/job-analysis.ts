import type {
  RequirementImportance,
  RequirementKind,
  RoleCategory,
  Seniority,
  TelemetryWorkMode,
} from '@careerly/contracts';

/** A requirement as the AI extracted it, before matching it to the tool catalog. */
export interface RawRequirement {
  label: string;
  kind: RequirementKind;
  importance: RequirementImportance;
}

/** The AI's analysis of a job description, already validated against its schema (RF-JD-02). */
export interface RawJobAnalysis {
  language: string;
  roleCategory: RoleCategory;
  seniority: Seniority;
  workMode: TelemetryWorkMode;
  country: string | null;
  yearsOfExperience: number | null;
  keywords: string[];
  requirements: RawRequirement[];
}

export const MAX_REQUIREMENTS = 60;
export const MAX_KEYWORDS = 30;
const MAX_LABEL = 200;

/**
 * Cleans what the AI returned, which is untrusted output: trims and caps texts, keeps only well-formed ISO
 * codes, drops duplicates (a requirement listed as required and nice-to-have stays required) and caps the
 * lists. Nothing is invented: a value that does not fit becomes `null` or is dropped.
 */
export function normalizeAnalysis(raw: RawJobAnalysis): RawJobAnalysis {
  const language = raw.language.trim().toLowerCase();
  const country = raw.country?.trim().toUpperCase() ?? null;
  const years = raw.yearsOfExperience;

  const byLabel = new Map<string, RawRequirement>();
  for (const requirement of raw.requirements) {
    const label = clean(requirement.label);
    if (!label) continue;
    const key = `${requirement.kind}:${label.toLowerCase()}`;
    const seen = byLabel.get(key);
    if (!seen || (seen.importance === 'NICE_TO_HAVE' && requirement.importance === 'REQUIRED')) {
      byLabel.set(key, { ...requirement, label });
    }
  }

  const keywords = new Map<string, string>();
  for (const keyword of raw.keywords) {
    const value = clean(keyword);
    if (value && !keywords.has(value.toLowerCase())) keywords.set(value.toLowerCase(), value);
  }

  return {
    language: /^[a-z]{2}$/.test(language) ? language : 'und',
    roleCategory: raw.roleCategory,
    seniority: raw.seniority,
    workMode: raw.workMode,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    yearsOfExperience:
      years !== null && Number.isInteger(years) && years >= 0 && years <= 40 ? years : null,
    keywords: [...keywords.values()].slice(0, MAX_KEYWORDS),
    requirements: [...byLabel.values()].slice(0, MAX_REQUIREMENTS),
  };
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
}
