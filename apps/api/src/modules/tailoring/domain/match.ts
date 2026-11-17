/*
 * Match between a job description's requirements and the master profile (RF-TAIL-02, ARCHITECTURE §7.2
 * steps 3 and 4). Pure:
 *
 * - Tool requirements resolved to the catalog are matched here, by tool id (so aliases are already applied,
 *   RF-GAP-02): an achievement that uses the tool covers it; a position or project that only lists it is
 *   partial evidence; otherwise it is missing.
 * - The rest (skills, spoken languages, other requirements and tools outside the catalog) is matched by the
 *   AI. Its answer is untrusted: `semanticMatches` keeps only evidence that exists in the profile, and a
 *   status with no evidence left becomes `MISSING`, so every piece of evidence points to a real id.
 */

import type {
  Evidence,
  EvidenceKind,
  JobRequirement,
  MatchStatus,
  RequirementMatch,
} from '@careerly/contracts';

/** What the match reads from the profile: ids and tools (the AI also reads the text). */
export interface MatchableAchievement {
  id: string;
  tools: { id: string }[];
}

export interface MatchableExperience {
  id: string;
  tools: { id: string }[];
  achievements: MatchableAchievement[];
}

export interface MatchableProfile {
  positions: MatchableExperience[];
  projects: MatchableExperience[];
  education: { id: string }[];
  certifications: { id: string }[];
  languages: { id: string }[];
}

/** Requirements the catalog can decide: tools with a catalog id. The rest goes to the AI. */
export function isToolMatchable(
  requirement: JobRequirement,
): requirement is JobRequirement & { tool: { id: string; name: string } } {
  return requirement.kind === 'TOOL' && requirement.tool !== null;
}

/** Deterministic match of a catalog tool against the profile. */
export function matchTool(
  requirement: JobRequirement & { tool: { id: string; name: string } },
  profile: MatchableProfile,
): RequirementMatch {
  const toolId = requirement.tool.id;
  const uses = (item: { tools: { id: string }[] }) => item.tools.some((tool) => tool.id === toolId);
  const experiences = [
    ...profile.positions.map((item) => ({ item, kind: 'POSITION' as const })),
    ...profile.projects.map((item) => ({ item, kind: 'PROJECT' as const })),
  ];

  const achievements: Evidence[] = experiences.flatMap(({ item }) =>
    item.achievements.filter(uses).map(({ id }) => ({ kind: 'ACHIEVEMENT' as const, id })),
  );
  if (achievements.length > 0) return toMatch(requirement, 'TOOLS', 'COVERED', achievements);

  const listed: Evidence[] = experiences
    .filter(({ item }) => uses(item))
    .map(({ item, kind }) => ({ kind, id: item.id }));
  if (listed.length > 0) return toMatch(requirement, 'TOOLS', 'PARTIAL', listed);

  return toMatch(requirement, 'TOOLS', 'MISSING', []);
}

/** One answer of the AI for a requirement, before it is checked. */
export interface SemanticAnswer {
  requirementId: string;
  status: MatchStatus;
  evidence: Evidence[];
}

/**
 * The AI's matches for `requirements`, checked against the profile: unknown requirements and evidence are
 * dropped, repeated evidence is kept once, the first answer per requirement wins, and a requirement with no
 * answer (or no evidence left) is `MISSING`.
 */
export function semanticMatches(
  requirements: JobRequirement[],
  answers: SemanticAnswer[],
  profile: MatchableProfile,
): RequirementMatch[] {
  const known = evidenceIndex(profile);
  const byRequirement = new Map<string, SemanticAnswer>();
  for (const answer of answers) {
    if (!byRequirement.has(answer.requirementId)) byRequirement.set(answer.requirementId, answer);
  }

  return requirements.map((requirement) => {
    const answer = byRequirement.get(requirement.id);
    if (!answer || answer.status === 'MISSING') {
      return toMatch(requirement, 'AI', 'MISSING', []);
    }
    const seen = new Set<string>();
    const evidence = answer.evidence.filter((item) => {
      const key = evidenceKey(item);
      if (!known.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return evidence.length > 0
      ? toMatch(requirement, 'AI', answer.status, evidence)
      : toMatch(requirement, 'AI', 'MISSING', []);
  });
}

/** Requirements the user will be asked about (RF-TAIL-04): partial and missing ones. */
export function countGaps(match: { requirements: Pick<RequirementMatch, 'status'>[] }): number {
  return match.requirements.filter((requirement) => requirement.status !== 'COVERED').length;
}

/** Every profile element evidence can point to, as `KIND:id`. */
export function evidenceIndex(profile: MatchableProfile): Set<string> {
  const keys = new Set<string>();
  const add = (kind: EvidenceKind, items: { id: string }[]) => {
    for (const { id } of items) keys.add(evidenceKey({ kind, id }));
  };
  add('POSITION', profile.positions);
  add('PROJECT', profile.projects);
  add(
    'ACHIEVEMENT',
    [...profile.positions, ...profile.projects].flatMap((e) => e.achievements),
  );
  add('EDUCATION', profile.education);
  add('CERTIFICATION', profile.certifications);
  add('LANGUAGE', profile.languages);
  return keys;
}

export const evidenceKey = ({ kind, id }: Evidence): string => `${kind}:${id}`;

function toMatch(
  requirement: JobRequirement,
  method: RequirementMatch['method'],
  status: MatchStatus,
  evidence: Evidence[],
): RequirementMatch {
  return {
    requirementId: requirement.id,
    label: requirement.label,
    kind: requirement.kind,
    importance: requirement.importance,
    tool: requirement.tool,
    status,
    method,
    evidence,
  };
}
