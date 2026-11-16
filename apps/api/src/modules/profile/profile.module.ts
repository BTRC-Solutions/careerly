import { Module } from '@nestjs/common';
import { CvExtractor, ProfileImportRepository } from './application/cv-import.ports.js';
import { CvImportService } from './application/cv-import.service.js';
import { ExperienceService } from './application/experience.service.js';
import { ProfileChangesService } from './application/profile-changes.service.js';
import {
  ExperienceRepository,
  PersonalInfoRepository,
  ProfileChangeRepository,
  SimpleSectionRepository,
} from './application/profile.repositories.js';
import { ProfileService } from './application/profile.service.js';
import { ToolCatalogService } from './application/tool-catalog.service.js';
import { ToolRepository } from './application/tool.repository.js';
import { CvImportController } from './http/cv-import.controller.js';
import { ExperienceController } from './http/experience.controller.js';
import { ProfileController } from './http/profile.controller.js';
import { ToolsController } from './http/tools.controller.js';
import { DrizzleExperienceRepository } from './infrastructure/drizzle-experience.repository.js';
import { DrizzleProfileChangeRepository } from './infrastructure/drizzle-profile-change.repository.js';
import { DrizzleProfileImportRepository } from './infrastructure/drizzle-profile-import.repository.js';
import { LlmCvExtractor } from './infrastructure/llm-cv-extractor.js';
import { DrizzlePersonalInfoRepository } from './infrastructure/drizzle-personal-info.repository.js';
import { DrizzleSimpleSectionRepository } from './infrastructure/drizzle-simple-section.repository.js';
import { DrizzleToolRepository } from './infrastructure/drizzle-tool.repository.js';
import { ToolCatalogSeeder } from './infrastructure/tool-catalog-seeder.js';

/**
 * Master profile (ARCHITECTURE §4): tool catalog (F2.1), personal information, positions and
 * projects with achievements, education, certifications and languages (F2.2–2.5), CV import (F2.7)
 * and the per-session change log of gap answers (F2.6).
 */
@Module({
  controllers: [ToolsController, ProfileController, ExperienceController, CvImportController],
  providers: [
    ToolCatalogService,
    ToolCatalogSeeder,
    ProfileService,
    ExperienceService,
    CvImportService,
    ProfileChangesService,
    { provide: CvExtractor, useClass: LlmCvExtractor },
    { provide: ProfileImportRepository, useClass: DrizzleProfileImportRepository },
    { provide: ToolRepository, useClass: DrizzleToolRepository },
    { provide: PersonalInfoRepository, useClass: DrizzlePersonalInfoRepository },
    { provide: ExperienceRepository, useClass: DrizzleExperienceRepository },
    { provide: SimpleSectionRepository, useClass: DrizzleSimpleSectionRepository },
    { provide: ProfileChangeRepository, useClass: DrizzleProfileChangeRepository },
  ],
  exports: [ToolCatalogService, ProfileService, ProfileChangesService],
})
export class ProfileModule {}
