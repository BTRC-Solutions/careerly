import {
  type JobPosting,
  RequirementImportanceSchema,
  RequirementKindSchema,
  RoleCategorySchema,
  SenioritySchema,
  TelemetryWorkModeSchema,
} from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmClient, untrustedText } from '../../ai/index.js';
import { JdAnalyzer } from '../application/job-analysis.ports.js';
import type { RawJobAnalysis } from '../domain/job-analysis.js';
import { JD_ANALYSIS_V1 } from './prompts/jd-analysis.v1.js';

/*
 * The answer the model must produce. Plain schema (no transforms): it is also sent to the provider as
 * JSON Schema. It is cleaned afterwards by `normalizeAnalysis`.
 */
const JdAnalysisAnswerSchema = z.object({
  language: z.string(),
  roleCategory: RoleCategorySchema,
  seniority: SenioritySchema,
  workMode: TelemetryWorkModeSchema,
  country: z.string().nullable(),
  yearsOfExperience: z.number().int().nullable(),
  keywords: z.array(z.string()),
  requirements: z.array(
    z.object({
      label: z.string(),
      kind: RequirementKindSchema,
      importance: RequirementImportanceSchema,
    }),
  ),
});

/** Extraction: the small tier is enough (ARCHITECTURE §7.3). */
const TIMEOUT_MS = 120_000;

/**
 * Analyzes a job description with the active AI provider (ADR-23). The text goes in an untrusted block:
 * instructions inside it are data, never followed. Neither the text nor the answer is logged.
 */
@Injectable()
export class LlmJdAnalyzer extends JdAnalyzer {
  private readonly logger = new Logger(LlmJdAnalyzer.name);

  constructor(private readonly llm: LlmClient) {
    super();
  }

  async analyze(posting: Pick<JobPosting, 'text' | 'title' | 'company' | 'location'>) {
    const details = [
      posting.title && `Title: ${posting.title}`,
      posting.company && `Company: ${posting.company}`,
      posting.location && `Location: ${posting.location}`,
    ].filter(Boolean);
    const { data, usage } = await this.llm.generateStructured({
      task: 'jd-analysis',
      prompt: JD_ANALYSIS_V1,
      tier: 'small',
      input: [
        { type: 'text', text: 'Analyze this job description into the JSON schema.' },
        ...(details.length > 0 ? [untrustedText('job-details', details.join('\n'))] : []),
        untrustedText('job-description', posting.text),
      ],
      schema: JdAnalysisAnswerSchema,
      timeoutMs: TIMEOUT_MS,
    });
    this.logger.log(
      `Job description analyzed with ${usage.model} (${data.requirements.length} requirements, ${usage.attempts} attempt(s)).`,
    );
    return {
      analysis: data satisfies RawJobAnalysis,
      promptVersion: JD_ANALYSIS_V1.id,
      model: usage.model,
    };
  }
}
