import {
  EducationKindSchema,
  LanguageLevelSchema,
  LinkKindSchema,
  ProjectKindSchema,
  WorkModeSchema,
} from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { z } from 'zod';
import { AiError, LlmClient, type LlmPart, untrustedText } from '../../ai/index.js';
import {
  type CvFile,
  CvExtractor,
  CvImportError,
  type RawCvDraft,
} from '../application/cv-import.ports.js';
import { aiFailure } from './ai-failure.js';
import { docxLinks, pdfLinks } from './cv-links.js';
import { CV_IMPORT_V1 } from './prompts/cv-import.v1.js';

/*
 * The answer the model must produce. Plain schema (no transforms): it is also sent to the provider
 * as JSON Schema. Dates are validated loosely here and strictly when the user confirms.
 */
const text = z.string();
const nullableText = z.string().nullable();
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .nullable();
const toolNames = z.array(z.string());
const achievements = z.array(z.object({ text, metrics: nullableText, tools: toolNames }));

const CvExtractionSchema = z.object({
  personalInfo: z.object({
    firstNames: nullableText,
    lastNames: nullableText,
    headline: nullableText,
    location: nullableText,
    email: nullableText,
    phone: nullableText,
    summary: nullableText,
    links: z.array(z.object({ kind: LinkKindSchema, url: text, label: nullableText })),
  }),
  positions: z.array(
    z.object({
      company: text,
      title: text,
      location: nullableText,
      workMode: WorkModeSchema.nullable(),
      startDate: month,
      endDate: month,
      context: nullableText,
      tools: toolNames,
      achievements,
    }),
  ),
  projects: z.array(
    z.object({
      name: text,
      kind: ProjectKindSchema,
      role: nullableText,
      url: nullableText,
      startDate: month,
      endDate: month,
      description: nullableText,
      tools: toolNames,
      achievements,
    }),
  ),
  education: z.array(
    z.object({
      institution: text,
      title: text,
      kind: EducationKindSchema,
      field: nullableText,
      startDate: month,
      endDate: month,
      description: nullableText,
    }),
  ),
  certifications: z.array(
    z.object({
      name: text,
      issuer: nullableText,
      issueDate: month,
      expirationDate: month,
      credentialId: nullableText,
      url: nullableText,
    }),
  ),
  languages: z.array(z.object({ language: text, level: LanguageLevelSchema, notes: nullableText })),
});

/** Long CVs produce long answers; extraction uses the small tier (ARCHITECTURE §7.3). */
const TIMEOUT_MS = 180_000;

/**
 * Reads a CV with the active AI provider (ADR-23). PDFs go to the model as documents (it reads the
 * layout); DOCX files are converted to text locally first. The file and the draft are never
 * stored or logged.
 */
@Injectable()
export class LlmCvExtractor extends CvExtractor {
  private readonly logger = new Logger(LlmCvExtractor.name);

  constructor(private readonly llm: LlmClient) {
    super();
  }

  async extract(file: CvFile): Promise<RawCvDraft> {
    const content = await this.toParts(file);
    try {
      const { data, usage } = await this.llm.generateStructured({
        task: 'cv-import',
        prompt: CV_IMPORT_V1,
        tier: 'small',
        input: [
          {
            type: 'text',
            text: 'Extract this CV into the JSON schema. Remember: only what the CV says.',
          },
          ...content,
        ],
        schema: CvExtractionSchema,
        timeoutMs: TIMEOUT_MS,
      });
      this.logger.log(
        `CV read with ${usage.model} (${file.kind}, ${data.positions.length} positions, ${usage.attempts} attempt(s)).`,
      );
      return data;
    } catch (error) {
      if (error instanceof AiError) throw toImportError(error);
      throw error;
    }
  }

  private async toParts(file: CvFile): Promise<LlmPart[]> {
    const content =
      file.kind === 'pdf'
        ? [{ type: 'document', mimeType: 'application/pdf', data: file.data } satisfies LlmPart]
        : [await this.docxText(file.data)];
    const links = file.kind === 'pdf' ? await pdfLinks(file.data) : await docxLinks(file.data);
    // The link targets of the file: the visible text of a link is often just "LinkedIn".
    return links.length > 0 ? [...content, untrustedText('cv-links', links.join('\n'))] : content;
  }

  private async docxText(data: Buffer): Promise<LlmPart> {
    let raw: string;
    try {
      raw = (await mammoth.extractRawText({ buffer: data })).value;
    } catch {
      throw new CvImportError('UNREADABLE_FILE', 'The DOCX file could not be read.');
    }
    const cleaned = raw.replace(/\n{3,}/g, '\n\n').trim();
    if (!cleaned) throw new CvImportError('UNREADABLE_FILE', 'The DOCX file has no text.');
    return untrustedText('cv', cleaned);
  }
}

function toImportError(error: AiError): CvImportError {
  return new CvImportError(aiFailure(error), error.message);
}
