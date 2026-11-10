import { Module } from '@nestjs/common';
import { ToolCatalogService } from './application/tool-catalog.service.js';
import { ToolRepository } from './application/tool.repository.js';
import { ToolsController } from './http/tools.controller.js';
import { DrizzleToolRepository } from './infrastructure/drizzle-tool.repository.js';
import { ToolCatalogSeeder } from './infrastructure/tool-catalog-seeder.js';

/**
 * Master profile (ARCHITECTURE §4). For now only the tool catalog (F2.1);
 * positions, achievements, projects, etc. arrive in F2.2–2.5.
 */
@Module({
  controllers: [ToolsController],
  providers: [
    ToolCatalogService,
    ToolCatalogSeeder,
    { provide: ToolRepository, useClass: DrizzleToolRepository },
  ],
  exports: [ToolCatalogService],
})
export class ProfileModule {}
