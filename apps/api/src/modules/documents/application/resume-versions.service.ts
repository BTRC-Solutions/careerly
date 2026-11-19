import { createHash, randomUUID } from 'node:crypto';
import type {
  PageBudget,
  ResumeDocument,
  ResumeLanguage,
  ResumeVersion,
  ResumeVersionData,
  TailoredResumeData,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { toTemplateData } from '../domain/resume-labels.js';
import {
  ResumeRenderer,
  ResumeVersionFileStore,
  ResumeVersionNotFoundError,
  ResumeVersionRepository,
  type StoredResumeVersion,
  TemplateCatalog,
} from './documents.ports.js';

/** One CV of a session to finalize. */
export interface ResumeToFinalize {
  language: ResumeLanguage;
  /** The CV as it goes into the PDF. */
  document: ResumeDocument;
  /** The CV as reviewed, with the sources of every bullet. */
  sources: TailoredResumeData;
  pageBudget: PageBudget;
  fileName: string;
}

/**
 * Finalized CVs (RF-TAIL-14, RNF-10, ARCHITECTURE §9): every CV is rendered once more, and its PDF, the data
 * the template received and a copy of the template are written to `files/snapshots/<id>/`, so the CV is the
 * same whatever happens later to the profile or the template (RN-13). Then the versions are saved together.
 */
@Injectable()
export class ResumeVersionsService {
  constructor(
    private readonly templates: TemplateCatalog,
    private readonly renderer: ResumeRenderer,
    private readonly versions: ResumeVersionRepository,
    private readonly files: ResumeVersionFileStore,
  ) {}

  /**
   * Freezes the CVs of a session, all of them or none. Idempotent: a session already finalized gets its
   * versions back unchanged, so finalizing again after a failure later on does not create new ones.
   * Throws `TemplateNotFoundError` and `RenderError`.
   */
  async finalize(
    sessionId: string,
    templateId: string,
    resumes: ResumeToFinalize[],
  ): Promise<ResumeVersion[]> {
    const existing = await this.versions.listBySession(sessionId);
    if (existing.length > 0) return existing;

    const template = await this.templates.get(templateId);
    const createdAt = new Date().toISOString();
    const written: StoredResumeVersion[] = [];
    try {
      for (const resume of resumes) {
        const document = toTemplateData(resume.document);
        const { pdf, pageCount } = await this.renderer.render(template, document);
        const data: ResumeVersionData = { document, sources: resume.sources };
        const version: StoredResumeVersion = {
          id: randomUUID(),
          sessionId,
          language: resume.language,
          templateId: template.id,
          templateName: template.name,
          templateVersion: template.version,
          pageCount,
          pageBudget: resume.pageBudget,
          contentHash: contentHash(data, template.id, template.version),
          fileName: resume.fileName,
          createdAt,
          data,
        };
        await this.files.write(version.id, { pdf, data: document, template });
        written.push(version);
      }
      await this.versions.insertAll(written);
    } catch (error) {
      await Promise.all(written.map((version) => this.files.remove(version.id)));
      throw error;
    }
    return written.map(withoutData);
  }

  async listBySession(sessionId: string): Promise<ResumeVersion[]> {
    return this.versions.listBySession(sessionId);
  }

  async find(id: string): Promise<StoredResumeVersion> {
    const version = await this.versions.find(id);
    if (!version) throw new ResumeVersionNotFoundError(id);
    return version;
  }

  /** Exactly the PDF that was finalized (RF-APP-08), with the name to save it with. */
  async pdf(id: string): Promise<{ pdf: Uint8Array; fileName: string }> {
    const version = await this.find(id);
    return { pdf: await this.files.readPdf(id), fileName: version.fileName };
  }
}

/** SHA-256 of the data, the template id and its version (ARCHITECTURE §9). */
export function contentHash(
  data: ResumeVersionData,
  templateId: string,
  templateVersion: number,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ data, templateId, templateVersion }))
    .digest('hex');
}

function withoutData({ data: _data, ...version }: StoredResumeVersion): ResumeVersion {
  return version;
}
