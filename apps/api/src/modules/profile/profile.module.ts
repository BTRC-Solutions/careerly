import { Module } from '@nestjs/common';
import { ExperienceService } from './application/experience.service.js';
import {
  ExperienceRepository,
  PersonalInfoRepository,
  SimpleSectionRepository,
} from './application/profile.repositories.js';
import { ProfileService } from './application/profile.service.js';
import { ToolCatalogService } from './application/tool-catalog.service.js';
import { ToolRepository } from './application/tool.repository.js';
import { ExperienceController } from './http/experience.controller.js';
import { ProfileController } from './http/profile.controller.js';
import { ToolsController } from './http/tools.controller.js';
import { DrizzleExperienceRepository } from './infrastructure/drizzle-experience.repository.js';
import { DrizzlePersonalInfoRepository } from './infrastructure/drizzle-personal-info.repository.js';
import { DrizzleSimpleSectionRepository } from './infrastructure/drizzle-simple-section.repository.js';
import { DrizzleToolRepository } from './infrastructure/drizzle-tool.repository.js';
import { ToolCatalogSeeder } from './infrastructure/tool-catalog-seeder.js';

/**
 * Master profile (ARCHITECTURE §4): tool catalog (F2.1), personal information, positions and
 * projects with achievements, education, certifications and languages (F2.2–2.5).
 */
@Module({
  controllers: [ToolsController, ProfileController, ExperienceController],
  providers: [
    ToolCatalogService,
    ToolCatalogSeeder,
    ProfileService,
    ExperienceService,
    { provide: ToolRepository, useClass: DrizzleToolRepository },
    { provide: PersonalInfoRepository, useClass: DrizzlePersonalInfoRepository },
    { provide: ExperienceRepository, useClass: DrizzleExperienceRepository },
    { provide: SimpleSectionRepository, useClass: DrizzleSimpleSectionRepository },
  ],
  exports: [ToolCatalogService, ProfileService],
})
export class ProfileModule {}
