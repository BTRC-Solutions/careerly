import {
  type Evidence,
  type JobRequirement,
  MatchStatusSchema,
  type Profile,
} from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmClient, untrustedText } from '../../ai/index.js';
import { RequirementMatcher } from '../application/tailoring.ports.js';
import type { SemanticAnswer } from '../domain/match.js';
import { EVIDENCE_MATCH_V1 } from './prompts/evidence-match.v1.js';

/** The answer the model must produce (plain schema: it is also sent as JSON Schema). */
const EvidenceMatchAnswerSchema = z.object({
  matches: z.array(
    z.object({
      requirement: z.string(),
      status: MatchStatusSchema,
      evidence: z.array(z.string()),
    }),
  ),
});

/** Extraction-like task: the small tier (ARCHITECTURE §7.3). */
const TIMEOUT_MS = 120_000;

/**
 * Matches the requirements the catalog cannot decide with the active AI provider (ADR-23). The profile is
 * sent with short references (`[A3]`) instead of ids, which the model copies more reliably; they are mapped
 * back here, and `semanticMatches` checks them again. The requirements come from the job description, so
 * they go in an untrusted block. Neither the prompt nor the answer is logged.
 */
@Injectable()
export class LlmRequirementMatcher extends RequirementMatcher {
  private readonly logger = new Logger(LlmRequirementMatcher.name);

  constructor(private readonly llm: LlmClient) {
    super();
  }

  async match(requirements: JobRequirement[], profile: Profile) {
    const { text: profileText, refs } = describeProfile(profile);
    const requirementRefs = new Map(requirements.map((r, index) => [`R${index + 1}`, r.id]));
    const requirementsText = requirements
      .map((r, index) => `[R${index + 1}] (${r.kind}, ${r.importance}) ${r.label}`)
      .join('\n');

    const { data, usage } = await this.llm.generateStructured({
      task: 'evidence-match',
      prompt: EVIDENCE_MATCH_V1,
      tier: 'small',
      input: [
        // The profile goes first: it is the large, stable part of the session's prompts (caching).
        { type: 'text', text: `Master profile of the candidate:\n\n${profileText}` },
        { type: 'text', text: 'Match each of these job description requirements:' },
        untrustedText('job-requirements', requirementsText),
      ],
      schema: EvidenceMatchAnswerSchema,
      timeoutMs: TIMEOUT_MS,
    });

    const answers: SemanticAnswer[] = data.matches.flatMap((item) => {
      const requirementId = requirementRefs.get(stripBrackets(item.requirement));
      if (!requirementId) return [];
      const evidence = item.evidence.flatMap((ref) => refs.get(stripBrackets(ref)) ?? []);
      return [{ requirementId, status: item.status, evidence }];
    });
    this.logger.log(
      `Matched ${requirements.length} requirement(s) with ${usage.model} (${usage.attempts} attempt(s)).`,
    );
    return { answers, promptVersion: EVIDENCE_MATCH_V1.id, model: usage.model };
  }
}

const stripBrackets = (ref: string) =>
  ref
    .trim()
    .replace(/^\[|\]$/g, '')
    .toUpperCase();

/** The profile as text with a short reference per element, and the elements each reference stands for. */
export function describeProfile(profile: Profile): { text: string; refs: Map<string, Evidence> } {
  const refs = new Map<string, Evidence>();
  const counters: Record<string, number> = {};
  const ref = (prefix: string, evidence: Evidence) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const key = `${prefix}${counters[prefix]}`;
    refs.set(key, evidence);
    return `[${key}]`;
  };
  const dates = (start: string | null, end: string | null, ongoing: boolean) =>
    start ? `${start} – ${end ?? (ongoing ? 'present' : '?')}` : end ? `until ${end}` : 'no dates';
  const tools = (list: { name: string }[]) =>
    list.length > 0 && `Tools: ${list.map((t) => t.name).join(', ')}.`;
  const line = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' ');

  const achievements = (list: Profile['positions'][number]['achievements']) =>
    list.map((a) =>
      line(
        `  ${ref('A', { kind: 'ACHIEVEMENT', id: a.id })}`,
        a.text,
        a.metrics && `Metrics: ${a.metrics}.`,
        tools(a.tools),
      ),
    );

  const sections: string[] = [];
  const headline = profile.personalInfo.headline;
  if (headline) sections.push(`Headline: ${headline}`);

  if (profile.positions.length > 0) {
    sections.push(
      [
        'Work experience:',
        ...profile.positions.flatMap((p) => [
          line(
            ref('W', { kind: 'POSITION', id: p.id }),
            `${p.title} at ${p.company} (${dates(p.startDate, p.endDate, true)}).`,
            p.context && `Context: ${p.context}`,
            tools(p.tools),
          ),
          ...achievements(p.achievements),
        ]),
      ].join('\n'),
    );
  }
  if (profile.projects.length > 0) {
    sections.push(
      [
        'Projects:',
        ...profile.projects.flatMap((p) => [
          line(
            ref('P', { kind: 'PROJECT', id: p.id }),
            `${p.name} (${p.kind.toLowerCase().replace('_', ' ')} project${p.role ? `, ${p.role}` : ''}, ${dates(p.startDate, p.endDate, false)}).`,
            p.description,
            tools(p.tools),
          ),
          ...achievements(p.achievements),
        ]),
      ].join('\n'),
    );
  }
  if (profile.education.length > 0) {
    sections.push(
      [
        'Education:',
        ...profile.education.map((e) =>
          line(
            ref('E', { kind: 'EDUCATION', id: e.id }),
            `${e.title}${e.field ? ` (${e.field})` : ''} at ${e.institution}, ${e.kind.toLowerCase()} (${dates(e.startDate, e.endDate, false)}).`,
            e.description,
          ),
        ),
      ].join('\n'),
    );
  }
  if (profile.certifications.length > 0) {
    sections.push(
      [
        'Certifications:',
        ...profile.certifications.map((c) =>
          line(
            ref('C', { kind: 'CERTIFICATION', id: c.id }),
            `${c.name}${c.issuer ? ` (${c.issuer})` : ''}${c.issueDate ? `, ${c.issueDate}` : ''}.`,
          ),
        ),
      ].join('\n'),
    );
  }
  if (profile.languages.length > 0) {
    sections.push(
      [
        'Spoken languages:',
        ...profile.languages.map((l) =>
          line(ref('L', { kind: 'LANGUAGE', id: l.id }), `${l.language}: ${l.level}.`, l.notes),
        ),
      ].join('\n'),
    );
  }
  return { text: sections.length > 0 ? sections.join('\n\n') : '(empty profile)', refs };
}
