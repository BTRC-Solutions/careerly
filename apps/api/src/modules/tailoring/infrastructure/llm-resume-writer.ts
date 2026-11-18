import type { Evidence, ResumeLanguage } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmClient, untrustedText } from '../../ai/index.js';
import { ResumeWriter, type ResumeWritingInput } from '../application/tailoring.ports.js';
import type { WrittenResume } from '../domain/resume-writing.js';
import { describeProfile, parseRef } from './llm-requirement-matcher.js';
import { RESUME_WRITING_V1 } from './prompts/resume-writing.v1.js';

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

  async write({ profile, analysis, match, language }: ResumeWritingInput) {
    const { text: profileText, refs } = describeProfile(profile);
    const ownSummary = profile.personalInfo.summary?.trim();
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
      prompt: RESUME_WRITING_V1,
      tier: 'large',
      input: [
        // The profile goes first: it is the large, stable part of the session's prompts (caching).
        {
          type: 'text',
          text: [
            `Master profile of the candidate:\n\n${profileText}`,
            ownSummary &&
              `\nThe candidate's own summary (source material, not final text):\n${ownSummary}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
        { type: 'text', text: 'The job description, as analyzed:' },
        untrustedText('job-description-analysis', jobText),
        {
          type: 'text',
          text: `Output language: ${LANGUAGE_NAMES[language]}. Write the bullets and the summary in it.`,
        },
      ],
      schema: ResumeWritingAnswerSchema,
      timeoutMs: TIMEOUT_MS,
    });

    const resume = toWrittenResume(data, refs);
    this.logger.log(
      `Wrote a ${language} CV with ${resume.experiences.length} experience(s) using ${usage.model} ` +
        `(${usage.attempts} attempt(s)).`,
    );
    return { resume, promptVersion: RESUME_WRITING_V1.id, model: usage.model };
  }
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
