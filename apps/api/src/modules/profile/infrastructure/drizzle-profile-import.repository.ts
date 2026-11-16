import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BatchItem } from 'drizzle-orm/batch';
import { DatabaseService } from '../../../platform/database/database.service.js';
import {
  achievements,
  achievementTools,
  certifications,
  education,
  languageSkills,
  positions,
  positionTools,
  profilePersonalInfo,
  projects,
  projectTools,
} from '../../../platform/database/schema.js';
import { type ProfileImportPlan, ProfileImportRepository } from '../application/cv-import.ports.js';
import { asBatch } from './profile-row-mappers.js';

const PERSONAL_INFO_ROW_ID = 1;

/** Writes a confirmed CV import in a single SQLite transaction (`db.batch`): all or nothing. */
@Injectable()
export class DrizzleProfileImportRepository extends ProfileImportRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async save({ element, personalInfo, request }: ProfileImportPlan): Promise<void> {
    const { db } = this.database;
    const statements: BatchItem<'sqlite'>[] = [];
    const provenance = () => {
      const { id, origin, originSessionId, now } = element(randomUUID());
      return { id, origin, originSessionId, createdAt: now, updatedAt: now };
    };

    if (personalInfo) {
      const values = {
        ...personalInfo,
        links: JSON.stringify(personalInfo.links),
        updatedAt: element('').now,
      };
      statements.push(
        db
          .insert(profilePersonalInfo)
          .values({ id: PERSONAL_INFO_ROW_ID, ...values })
          .onConflictDoUpdate({ target: profilePersonalInfo.id, set: values }),
      );
    }

    for (const { toolIds, achievements: items, ...fields } of request.positions) {
      const row = provenance();
      statements.push(db.insert(positions).values({ ...fields, ...row }));
      if (toolIds.length > 0) {
        statements.push(
          db.insert(positionTools).values(toolIds.map((toolId) => ({ ownerId: row.id, toolId }))),
        );
      }
      this.addAchievements(statements, { positionId: row.id, projectId: null }, items, provenance);
    }

    for (const { toolIds, achievements: items, ...fields } of request.projects) {
      const row = provenance();
      statements.push(db.insert(projects).values({ ...fields, ...row }));
      if (toolIds.length > 0) {
        statements.push(
          db.insert(projectTools).values(toolIds.map((toolId) => ({ ownerId: row.id, toolId }))),
        );
      }
      this.addAchievements(statements, { positionId: null, projectId: row.id }, items, provenance);
    }

    for (const fields of request.education) {
      statements.push(db.insert(education).values({ ...fields, ...provenance() }));
    }
    for (const fields of request.certifications) {
      statements.push(db.insert(certifications).values({ ...fields, ...provenance() }));
    }
    for (const fields of request.languages) {
      statements.push(db.insert(languageSkills).values({ ...fields, ...provenance() }));
    }

    if (statements.length > 0) await db.batch(asBatch(statements));
  }

  private addAchievements(
    statements: BatchItem<'sqlite'>[],
    parent: { positionId: string | null; projectId: string | null },
    items: ProfileImportPlan['request']['positions'][number]['achievements'],
    provenance: () => {
      id: string;
      origin: string;
      originSessionId: string | null;
      createdAt: string;
      updatedAt: string;
    },
  ) {
    const { db } = this.database;
    items.forEach(({ toolIds, ...fields }, index) => {
      const row = provenance();
      // A new parent: the CV order is the user's order.
      statements.push(
        db.insert(achievements).values({ ...fields, ...parent, sortOrder: index, ...row }),
      );
      if (toolIds.length > 0) {
        statements.push(
          db
            .insert(achievementTools)
            .values(toolIds.map((toolId) => ({ ownerId: row.id, toolId }))),
        );
      }
    });
  }
}
