import type { Evidence, Profile, ResumeLanguage } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmClient, untrustedText } from '../../ai/index.js';
import {
  type ResumeRewritingInput,
  ResumeWriter,
  type ResumeWritingInput,
} from '../application/tailoring.ports.js';
import type { WrittenResume } from '../domain/resume-writing.js';
import type { TruthIssue, TruthRewrite } from '../domain/truth-guard.js';
import { describeProfile, parseRef } from './llm-requirement-matcher.js';
import { RESUME_REWRITING_V1 } from './prompts/resume-rewriting.v1.js';
import { RESUME_WRITING_V2 } from './prompts/resume-writing.v2.js';

/** The answer the model must produce (plain schema: it is also sent as JSON Schema). */
const ResumeWritingAnswerSchema = z.object({
  summary: z.string(),
  summarySources: z.array(z.string()),
  experiences: z.array(
    z.object({
      experience: z.string(),
      bullets: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })),
    }),
  ),
});

const LANGUAGE_NAMES: Record<ResumeLanguage, string> = { es: 'Spanish', en: 'English' };

/** Writing a whole CV with the large model takes longer than an extraction. */
const TIMEOUT_MS = 180_000;

/**
 * Words a tailored CV with the active AI provider (ADR-23), large tier. Like the match, the profile goes with
 * short references (`[A3]`) that are mapped back to ids here; `tailoredResumeData` then keeps only the sources
 * that belong to each experience (RN-01). The job description goes in an untrusted block. Neither the prompt
 * nor the answer is logged.
 */
@Injectable()
export class LlmResumeWriter extends ResumeWriter {
  private readonly logger = new Logger(LlmResumeWriter.name);

  constructor(private readonly llm: LlmClient) {
    super();
  }

  async write({ profile, analysis, match, language, scope, instructions }: ResumeWritingInput) {
    const { text: profileText, refs } = describeProfile(profile);
    const refOf = new Map([...refs].map(([ref, evidence]) => [evidence.id, ref]));
    const task =
      scope.kind === 'SUMMARY'
        ? 'Write only the summary.'
        : scope.kind === 'EXPERIENCE'
          ? `Write only the bullets of [${refOf.get(scope.experienceId) ?? '?'}].`
          : 'Write the whole CV.';
    const status = new Map(match?.requirements.map((r) => [r.requirementId, r.status]));
    const jobText = [
      `Role: ${analysis.roleCategory}, ${analysis.seniority}.`,
      analysis.yearsOfExperience !== null &&
        `Years of experience asked: ${analysis.yearsOfExperience}.`,
      analysis.keywords.length > 0 && `Keywords: ${analysis.keywords.join(', ')}.`,
      'Requirements (with what the profile shows for each: COVERED, PARTIAL or MISSING):',
      ...analysis.requirements.map(
        (r) => `- [${status.get(r.id) ?? 'UNKNOWN'}] (${r.kind}, ${r.importance}) ${r.label}`,
      ),
    ]
      .filter(Boolean)
      .join('\n');

    const { data, usage } = await this.llm.generateStructured({
      task: 'resume-writing',
      prompt: RESUME_WRITING_V2,
      tier: 'large',
      input: [
        // The profile goes first: it is the large, stable part of the session's prompts (caching).
        { type: 'text', text: profileBlock(profileText, profile) },
        { type: 'text', text: 'The job description, as analyzed:' },
        untrustedText('job-description-analysis', jobText),
        {
          type: 'text',
          text: `Output language: ${LANGUAGE_NAMES[language]}. Write the bullets and the summary in it. ${task}`,
        },
        // The candidate's own words, for this version only: never logged.
        ...(instructions
          ? [
              {
                type: 'text' as const,
                text: `Indications from the candidate for this version:
${instructions}`,
              },
            ]
          : []),
      ],
      schema: ResumeWritingAnswerSchema,
      timeoutMs: TIMEOUT_MS,
    });

    const resume = toWrittenResume(data, refs);
    this.logger.log(
      `Wrote a ${language} CV with ${resume.experiences.length} experience(s) using ${usage.model} ` +
        `(${usage.attempts} attempt(s)).`,
    );
    return { resume, promptVersion: RESUME_WRITING_V2.id, model: usage.model };
  }

  async rewrite({ profile, language, data, issues }: ResumeRewritingInput) {
    const { text: profileText, refs } = describeProfile(profile);
    const refOf = new Map([...refs].map(([ref, evidence]) => [evidence.id, ref]));
    const cite = (ids: string[]) =>
      ids.map((id) => `[${refOf.get(id) ?? '?'}]`).join(', ') || 'none';

    const items = issues.map((issue, index) => {
      const { target } = issue;
      if (target.kind === 'SUMMARY') {
        return {
          ref: 'S1',
          target,
          line: `[S1] The summary, citing ${cite(data.summary?.sourceIds ?? [])}`,
        };
      }
      const bullet = data.experiences
        .find((e) => e.sourceId === target.experienceId)
        ?.bullets.find((b) => b.id === target.bulletId);
      const ref = `B${index + 1}`;
      return {
        ref,
        target,
        line: `[${ref}] A bullet of [${refOf.get(target.experienceId) ?? '?'}], citing ${cite(bullet?.sourceIds ?? [])}`,
      };
    });
    const itemsText = items
      .map(({ line }, index) => {
        const issue = issues[index]!;
        return [line, `  Text: ${issue.text}`, `  Problems: ${problems(issue)}`].join('\n');
      })
      .join('\n\n');

    const { data: answer, usage } = await this.llm.generateStructured({
      task: 'resume-writing',
      prompt: RESUME_REWRITING_V1,
      tier: 'large',
      input: [
        { type: 'text', text: profileBlock(profileText, profile) },
        {
          type: 'text',
          text: `Rewrite these texts of the CV, in ${LANGUAGE_NAMES[language]}:`,
        },
        // Written by the AI from a job description, which may carry instructions: data, not orders.
        untrustedText('cv-texts', itemsText),
      ],
      schema: ResumeRewritingAnswerSchema,
      timeoutMs: TIMEOUT_MS,
    });

    const byRef = new Map(items.map((item) => [item.ref, item.target]));
    const ids = (list: string[]) => list.flatMap((r) => refs.get(parseRef(r) ?? '')?.id ?? []);
    const rewrites: TruthRewrite[] = answer.rewrites.flatMap((item) => {
      const target = byRef.get(parseRef(item.item) ?? '');
      return target ? [{ target, text: item.text, sourceIds: ids(item.sources) }] : [];
    });
    this.logger.log(
      `Rewrote ${rewrites.length} of ${issues.length} ${language} text(s) using ${usage.model} ` +
        `(${usage.attempts} attempt(s)).`,
    );
    return { rewrites };
  }
}

/** The answer to a rewrite (plain schema: it is also sent as JSON Schema). */
const ResumeRewritingAnswerSchema = z.object({
  rewrites: z.array(z.object({ item: z.string(), text: z.string(), sources: z.array(z.string()) })),
});

/** What broke the rules, for the model. Tool names and numbers come from the AI's own text, not the JD. */
function problems(issue: TruthIssue): string {
  const list: string[] = [];
  for (const reason of issue.reasons) {
    if (reason === 'TOOL_NOT_IN_SOURCES') {
      list.push(`it mentions ${issue.tools.join(', ')}, which its sources do not show`);
    } else if (reason === 'NUMBER_NOT_IN_SOURCES') {
      list.push(`it has the number(s) ${issue.numbers.join(', ')}, which its sources do not have`);
    } else {
      list.push('it cites nothing of its own experience');
    }
  }
  return `${list.join('; ')}.`;
}

/**
 * The profile as the first block of every writing call, the same each time so the provider can cache it.
 * The candidate's own summary is source material, not final text.
 */
function profileBlock(profileText: string, profile: Profile): string {
  const ownSummary = profile.personalInfo.summary?.trim();
  return [
    `Master profile of the candidate:\n\n${profileText}`,
    ownSummary && `\nThe candidate's own summary (source material, not final text):\n${ownSummary}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The answer with its references turned into ids. Experiences that are not a [W] or [P] of the profile are
 * dropped; sources that are not in the profile too (`tailoredResumeData` checks the rest).
 */
export function toWrittenResume(
  answer: z.infer<typeof ResumeWritingAnswerSchema>,
  refs: Map<string, Evidence>,
): WrittenResume {
  const ids = (list: string[]) => list.flatMap((ref) => refs.get(parseRef(ref) ?? '')?.id ?? []);
  return {
    summary: { text: answer.summary, sourceIds: ids(answer.summarySources) },
    experiences: answer.experiences.flatMap((item) => {
      const owner = refs.get(parseRef(item.experience) ?? '');
      if (owner?.kind !== 'POSITION' && owner?.kind !== 'PROJECT') return [];
      return [
        {
          kind: owner.kind,
          sourceId: owner.id,
          bullets: item.bullets.map((b) => ({ text: b.text, sourceIds: ids(b.sources) })),
        },
      ];
    }),
  };
}
