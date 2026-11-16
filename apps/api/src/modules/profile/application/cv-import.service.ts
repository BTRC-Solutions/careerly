import type {
  ConfirmCvImportRequest,
  ConfirmCvImportResponse,
  CvImportDraft,
  DraftTool,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ProfileValidationError } from '../domain/profile-errors.js';
import { assertDateRange } from '../domain/profile-rules.js';
import {
  type CvFile,
  CvExtractor,
  ProfileImportRepository,
  type RawCvDraft,
} from './cv-import.ports.js';
import { ExperienceRepository, PersonalInfoRepository } from './profile.repositories.js';
import { ToolCatalogService } from './tool-catalog.service.js';

/**
 * Imports a CV into the master profile (RF-PROF-09, roadmap 2.7): the AI makes a draft that is
 * never saved as is; only what the user confirms is created, with origin `IMPORT` (RF-PROF-07).
 */
@Injectable()
export class CvImportService {
  constructor(
    private readonly extractor: CvExtractor,
    private readonly tools: ToolCatalogService,
    private readonly experience: ExperienceRepository,
    private readonly personalInfo: PersonalInfoRepository,
    private readonly imports: ProfileImportRepository,
  ) {}

  /** Reads the CV and returns a draft with its tools resolved against the catalog. Saves nothing. */
  async draft(file: CvFile): Promise<CvImportDraft> {
    const raw = await this.extractor.extract(file);
    const resolve = this.toolResolver();
    const resolveAll = (names: string[]) => Promise.all(dedupe(names).map(resolve));

    return {
      personalInfo: raw.personalInfo,
      positions: await Promise.all(
        raw.positions.map(async (position) => ({
          ...position,
          tools: await resolveAll(position.tools),
          achievements: await this.resolveAchievements(position.achievements, resolveAll),
        })),
      ),
      projects: await Promise.all(
        raw.projects.map(async (project) => ({
          ...project,
          tools: await resolveAll(project.tools),
          achievements: await this.resolveAchievements(project.achievements, resolveAll),
        })),
      ),
      education: raw.education,
      certifications: raw.certifications,
      // A language is a label in the profile: "español" (as Spanish writes it) shows as "Español".
      languages: raw.languages.map((item) => ({ ...item, language: capitalize(item.language) })),
    };
  }

  /** Creates everything the user kept, in one transaction, with origin `IMPORT`. */
  async confirm(request: ConfirmCvImportRequest): Promise<ConfirmCvImportResponse> {
    this.assertDates(request);
    await this.assertToolsExist(request);

    const now = new Date().toISOString();
    const personalInfo = request.personalInfo
      ? await this.mergedPersonalInfo(request.personalInfo)
      : null;
    await this.imports.save({
      element: (id) => ({ id, origin: 'IMPORT', originSessionId: null, now }),
      personalInfo,
      request,
    });

    const count = <T extends { achievements: unknown[] }>(items: T[]) =>
      items.reduce((total, item) => total + item.achievements.length, 0);
    return {
      personalInfoUpdated: personalInfo !== null,
      positions: request.positions.length,
      achievements: count(request.positions) + count(request.projects),
      projects: request.projects.length,
      education: request.education.length,
      certifications: request.certifications.length,
      languages: request.languages.length,
    };
  }

  private async resolveAchievements(
    achievements: RawCvDraft['positions'][number]['achievements'],
    resolveAll: (names: string[]) => Promise<DraftTool[]>,
  ) {
    return Promise.all(
      achievements.map(async (achievement) => ({
        ...achievement,
        tools: await resolveAll(achievement.tools),
      })),
    );
  }

  /** Resolves each distinct name once per draft. */
  private toolResolver() {
    const cache = new Map<string, Promise<DraftTool>>();
    return (name: string) => {
      const key = name.trim().toLowerCase();
      let resolved = cache.get(key);
      if (!resolved) {
        resolved = this.tools.resolve(name).then((tool) => ({
          name: name.trim(),
          toolId: tool?.id ?? null,
          toolName: tool?.name ?? null,
        }));
        cache.set(key, resolved);
      }
      return resolved;
    };
  }

  private async mergedPersonalInfo(patch: NonNullable<ConfirmCvImportRequest['personalInfo']>) {
    const { updatedAt: _updatedAt, ...current } = await this.personalInfo.get();
    return { ...current, ...patch };
  }

  private assertDates(request: ConfirmCvImportRequest) {
    const check = (label: string, start: string | null, end: string | null, endField?: string) => {
      try {
        assertDateRange(start, end, endField);
      } catch (error) {
        throw new ProfileValidationError(`${label}: ${(error as Error).message}`);
      }
    };
    request.positions.forEach((p, i) => check(`positions.${i}`, p.startDate, p.endDate));
    request.projects.forEach((p, i) => check(`projects.${i}`, p.startDate, p.endDate));
    request.education.forEach((e, i) => check(`education.${i}`, e.startDate, e.endDate));
    request.certifications.forEach((c, i) =>
      check(`certifications.${i}`, c.issueDate, c.expirationDate, 'expirationDate'),
    );
  }

  private async assertToolsExist(request: ConfirmCvImportRequest) {
    const ids = [...request.positions, ...request.projects].flatMap((item) => [
      ...item.toolIds,
      ...item.achievements.flatMap((achievement) => achievement.toolIds),
    ]);
    const unique = dedupe(ids);
    if (unique.length === 0) return;
    const existing = await this.experience.findExistingToolIds(unique);
    const unknown = unique.filter((id) => !existing.has(id));
    if (unknown.length > 0) {
      throw new ProfileValidationError(`Unknown tool id(s): ${unknown.join(', ')}.`);
    }
  }
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function capitalize(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}
