import {
  type Certification,
  type Education,
  EducationKindSchema,
  type LanguageSkill,
  LanguageLevelSchema,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { certifications, education, languageSkills } from '../../../platform/database/schema.js';
import {
  type NewElement,
  type SimpleSection,
  SimpleSectionRepository,
  type SimpleSectionTypes,
} from '../application/profile.repositories.js';
import { definedOnly, enumOf, provenanceOf } from './profile-row-mappers.js';

type Item<S extends SimpleSection> = SimpleSectionTypes[S]['item'];

/** Table and row mapper of each flat section. Field names match the column keys. */
const SECTIONS = {
  education: {
    table: education,
    toItem: (row: typeof education.$inferSelect): Education => ({
      id: row.id,
      institution: row.institution,
      title: row.title,
      kind: enumOf(EducationKindSchema, row.kind, 'OTHER'),
      field: row.field,
      startDate: row.startDate,
      endDate: row.endDate,
      description: row.description,
      ...provenanceOf(row),
    }),
  },
  certifications: {
    table: certifications,
    toItem: (row: typeof certifications.$inferSelect): Certification => ({
      id: row.id,
      name: row.name,
      issuer: row.issuer,
      issueDate: row.issueDate,
      expirationDate: row.expirationDate,
      credentialId: row.credentialId,
      url: row.url,
      ...provenanceOf(row),
    }),
  },
  languages: {
    table: languageSkills,
    toItem: (row: typeof languageSkills.$inferSelect): LanguageSkill => ({
      id: row.id,
      language: row.language,
      level: enumOf(LanguageLevelSchema, row.level, 'A1'),
      notes: row.notes,
      ...provenanceOf(row),
    }),
  },
} as const;

/*
 * The three tables share `id` and the provenance columns, but Drizzle cannot type a query over a
 * union of tables. The casts below are confined to this class; inputs and outputs stay typed.
 */
type AnyTable = typeof education;
type AnyRow = typeof education.$inferSelect;

@Injectable()
export class DrizzleSimpleSectionRepository extends SimpleSectionRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async list<S extends SimpleSection>(section: S): Promise<Item<S>[]> {
    const { table, toItem } = this.section(section);
    const rows = await this.database.db.select().from(table);
    return rows.map(toItem);
  }

  async find<S extends SimpleSection>(section: S, id: string): Promise<Item<S> | undefined> {
    const { table, toItem } = this.section(section);
    const row = await this.database.db.select().from(table).where(eq(table.id, id)).get();
    return row ? toItem(row) : undefined;
  }

  async insert<S extends SimpleSection>(
    section: S,
    element: NewElement,
    fields: SimpleSectionTypes[S]['fields'],
  ): Promise<void> {
    const { table } = this.section(section);
    await this.database.db.insert(table).values({
      ...(fields as object),
      id: element.id,
      origin: element.origin,
      originSessionId: element.originSessionId,
      createdAt: element.now,
      updatedAt: element.now,
    } as AnyRow);
  }

  async update<S extends SimpleSection>(
    section: S,
    id: string,
    fields: Partial<SimpleSectionTypes[S]['fields']>,
    now: string,
  ): Promise<void> {
    const { table } = this.section(section);
    await this.database.db
      .update(table)
      .set({ ...definedOnly(fields as object), updatedAt: now } as Partial<AnyRow>)
      .where(eq(table.id, id));
  }

  async delete(section: SimpleSection, id: string): Promise<boolean> {
    const { table } = this.section(section);
    const deleted = await this.database.db
      .delete(table)
      .where(eq(table.id, id))
      .returning({ id: table.id });
    return deleted.length > 0;
  }

  private section<S extends SimpleSection>(section: S) {
    return SECTIONS[section] as unknown as {
      table: AnyTable;
      toItem: (row: AnyRow) => Item<S>;
    };
  }
}
