import { randomUUID } from 'node:crypto';
import type {
  Certification,
  CreateCertificationRequest,
  CreateEducationRequest,
  CreateLanguageSkillRequest,
  Education,
  LanguageSkill,
  PersonalInfo,
  Profile,
  UpdateCertificationRequest,
  UpdateEducationRequest,
  UpdateLanguageSkillRequest,
  UpdatePersonalInfoRequest,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ProfileNotFoundError } from '../domain/profile-errors.js';
import {
  assertDateRange,
  compareByMonthDesc,
  compareLanguageSkills,
  compareReverseChronological,
} from '../domain/profile-rules.js';
import {
  ExperienceRepository,
  PersonalInfoRepository,
  type SimpleSection,
  SimpleSectionRepository,
  type SimpleSectionTypes,
} from './profile.repositories.js';

type SectionItem<S extends SimpleSection> = SimpleSectionTypes[S]['item'];

const SECTION_LABELS: Record<SimpleSection, string> = {
  education: 'Education',
  certifications: 'Certification',
  languages: 'Language',
};

/**
 * The whole master profile, personal information (RF-PROF-01) and the flat sections:
 * education, certifications and languages (RF-PROF-05).
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly personalInfo: PersonalInfoRepository,
    private readonly experience: ExperienceRepository,
    private readonly sections: SimpleSectionRepository,
  ) {}

  async getProfile(): Promise<Profile> {
    const [personalInfo, positions, projects, education, certifications, languages] =
      await Promise.all([
        this.personalInfo.get(),
        this.experience.listPositions(),
        this.experience.listProjects(),
        this.sections.list('education'),
        this.sections.list('certifications'),
        this.sections.list('languages'),
      ]);

    return {
      personalInfo,
      positions: positions.sort(compareReverseChronological),
      projects: projects.sort(compareReverseChronological),
      education: education.sort(compareReverseChronological),
      certifications: certifications.sort(
        (a, b) =>
          compareByMonthDesc(a.issueDate, b.issueDate) || b.createdAt.localeCompare(a.createdAt),
      ),
      languages: languages.sort(compareLanguageSkills),
    };
  }

  async updatePersonalInfo(patch: UpdatePersonalInfoRequest): Promise<PersonalInfo> {
    const { updatedAt: _updatedAt, ...current } = await this.personalInfo.get();
    return this.personalInfo.save({ ...current, ...patch }, now());
  }

  // --- Education, certifications, languages ------------------------------------

  createEducation(request: CreateEducationRequest): Promise<Education> {
    assertDateRange(request.startDate, request.endDate);
    return this.create('education', request);
  }

  async updateEducation(id: string, patch: UpdateEducationRequest): Promise<Education> {
    const current = await this.get('education', id);
    assertDateRange(
      'startDate' in patch ? (patch.startDate ?? null) : current.startDate,
      'endDate' in patch ? (patch.endDate ?? null) : current.endDate,
    );
    return this.update('education', id, patch);
  }

  createCertification(request: CreateCertificationRequest): Promise<Certification> {
    assertDateRange(request.issueDate, request.expirationDate, 'expirationDate');
    return this.create('certifications', request);
  }

  async updateCertification(id: string, patch: UpdateCertificationRequest): Promise<Certification> {
    const current = await this.get('certifications', id);
    assertDateRange(
      'issueDate' in patch ? (patch.issueDate ?? null) : current.issueDate,
      'expirationDate' in patch ? (patch.expirationDate ?? null) : current.expirationDate,
      'expirationDate',
    );
    return this.update('certifications', id, patch);
  }

  createLanguage(request: CreateLanguageSkillRequest): Promise<LanguageSkill> {
    return this.create('languages', request);
  }

  async updateLanguage(id: string, patch: UpdateLanguageSkillRequest): Promise<LanguageSkill> {
    await this.get('languages', id);
    return this.update('languages', id, patch);
  }

  async deleteFromSection(section: SimpleSection, id: string): Promise<void> {
    if (!(await this.sections.delete(section, id))) {
      throw new ProfileNotFoundError(SECTION_LABELS[section]);
    }
  }

  private async get<S extends SimpleSection>(section: S, id: string): Promise<SectionItem<S>> {
    const item = await this.sections.find(section, id);
    if (!item) throw new ProfileNotFoundError(SECTION_LABELS[section]);
    return item;
  }

  private async create<S extends SimpleSection>(
    section: S,
    fields: SimpleSectionTypes[S]['fields'],
  ): Promise<SectionItem<S>> {
    const id = randomUUID();
    await this.sections.insert(
      section,
      { id, origin: 'MANUAL', originSessionId: null, now: now() },
      fields,
    );
    return this.get(section, id);
  }

  private async update<S extends SimpleSection>(
    section: S,
    id: string,
    patch: Partial<SimpleSectionTypes[S]['fields']>,
  ): Promise<SectionItem<S>> {
    await this.sections.update(section, id, patch, now());
    return this.get(section, id);
  }
}

function now(): string {
  return new Date().toISOString();
}
