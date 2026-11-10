import { type PersonalInfo, ProfileLinkSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { profilePersonalInfo } from '../../../platform/database/schema.js';
import {
  PersonalInfoRepository,
  type PersonalInfoFields,
} from '../application/profile.repositories.js';

const SINGLE_ROW_ID = 1;
const LinksSchema = z.array(ProfileLinkSchema).catch([]);

const EMPTY: PersonalInfo = {
  fullName: null,
  headline: null,
  location: null,
  email: null,
  phone: null,
  summary: null,
  links: [],
  updatedAt: null,
};

@Injectable()
export class DrizzlePersonalInfoRepository extends PersonalInfoRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async get(): Promise<PersonalInfo> {
    const row = await this.database.db
      .select()
      .from(profilePersonalInfo)
      .where(eq(profilePersonalInfo.id, SINGLE_ROW_ID))
      .get();
    if (!row) return EMPTY;

    const { id: _id, links, ...fields } = row;
    return { ...fields, links: LinksSchema.parse(safeJson(links)) };
  }

  async save(fields: PersonalInfoFields, now: string): Promise<PersonalInfo> {
    const values = { ...fields, links: JSON.stringify(fields.links), updatedAt: now };
    await this.database.db
      .insert(profilePersonalInfo)
      .values({ id: SINGLE_ROW_ID, ...values })
      .onConflictDoUpdate({ target: profilePersonalInfo.id, set: values });
    return this.get();
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}
