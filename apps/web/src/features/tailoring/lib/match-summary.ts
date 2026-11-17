import type {
  Evidence,
  EvidenceKind,
  LanguageLevel,
  MatchResult,
  MatchStatus,
  Profile,
  RequirementMatch,
} from '@careerly/contracts';

/*
 * What the match summary shows (RF-TAIL-03): requirements grouped by status and an orientative score.
 */

/** Required requirements weigh twice as much as nice-to-have ones; a partial one counts half. */
const IMPORTANCE_WEIGHT = { REQUIRED: 2, NICE_TO_HAVE: 1 } as const;
const STATUS_CREDIT: Record<MatchStatus, number> = { COVERED: 1, PARTIAL: 0.5, MISSING: 0 };

export interface MatchSummary {
  /** 0–100, or `null` when the job description has no requirements. */
  score: number | null;
  covered: RequirementMatch[];
  partial: RequirementMatch[];
  missing: RequirementMatch[];
}

export function summarizeMatch(match: MatchResult): MatchSummary {
  const byStatus = (status: MatchStatus) => match.requirements.filter((r) => r.status === status);
  const total = match.requirements.reduce((sum, r) => sum + IMPORTANCE_WEIGHT[r.importance], 0);
  const earned = match.requirements.reduce(
    (sum, r) => sum + IMPORTANCE_WEIGHT[r.importance] * STATUS_CREDIT[r.status],
    0,
  );
  return {
    score: total === 0 ? null : Math.round((earned / total) * 100),
    // Required ones first, keeping the job description's order otherwise.
    covered: requiredFirst(byStatus('COVERED')),
    partial: requiredFirst(byStatus('PARTIAL')),
    missing: requiredFirst(byStatus('MISSING')),
  };
}

const requiredFirst = (list: RequirementMatch[]) =>
  [...list].sort((a, b) => IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance]);

/** A piece of evidence as the user recognizes it: what it is and where it comes from. */
export interface DescribedEvidence {
  kind: EvidenceKind;
  /** e.g. the achievement's text, or "Backend Engineer · Acme". */
  text: string;
  /** e.g. the position the achievement belongs to; `null` when there is nothing to add. */
  context: string | null;
  /** Spoken languages only: shown translated. */
  level?: LanguageLevel;
}

/** Looks the evidence up in the profile; `null` if it was deleted after the match. */
export function describeEvidence(evidence: Evidence, profile: Profile): DescribedEvidence | null {
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  const of = (text: string, context: string | null = null): DescribedEvidence => ({
    kind: evidence.kind,
    text,
    context: context || null,
  });

  switch (evidence.kind) {
    case 'ACHIEVEMENT': {
      for (const position of profile.positions) {
        const found = position.achievements.find((a) => a.id === evidence.id);
        if (found) return of(found.text, join(position.title, position.company));
      }
      for (const project of profile.projects) {
        const found = project.achievements.find((a) => a.id === evidence.id);
        if (found) return of(found.text, project.name);
      }
      return null;
    }
    case 'POSITION': {
      const found = profile.positions.find((p) => p.id === evidence.id);
      return found ? of(join(found.title, found.company)) : null;
    }
    case 'PROJECT': {
      const found = profile.projects.find((p) => p.id === evidence.id);
      return found ? of(found.name, found.role) : null;
    }
    case 'EDUCATION': {
      const found = profile.education.find((e) => e.id === evidence.id);
      return found ? of(join(found.title, found.institution)) : null;
    }
    case 'CERTIFICATION': {
      const found = profile.certifications.find((c) => c.id === evidence.id);
      return found ? of(join(found.name, found.issuer)) : null;
    }
    case 'LANGUAGE': {
      const found = profile.languages.find((l) => l.id === evidence.id);
      return found ? { ...of(found.language), level: found.level } : null;
    }
  }
}
