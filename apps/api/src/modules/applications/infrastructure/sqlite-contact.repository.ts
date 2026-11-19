import { type Contact, ContactSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { applicationContacts } from '../../../platform/database/schema.js';
import { ContactRepository } from '../application/applications.ports.js';

type Row = typeof applicationContacts.$inferSelect;

/** The contacts of applications. Reads are validated. */
@Injectable()
export class SqliteContactRepository extends ContactRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async list(applicationId: string): Promise<Contact[]> {
    const rows = await this.database.db
      .select()
      .from(applicationContacts)
      .where(eq(applicationContacts.applicationId, applicationId))
      .orderBy(asc(applicationContacts.createdAt), asc(applicationContacts.id));
    return rows.map(toContact);
  }

  async find(applicationId: string, contactId: string): Promise<Contact | null> {
    const [row] = await this.database.db
      .select()
      .from(applicationContacts)
      .where(of(applicationId, contactId));
    return row ? toContact(row) : null;
  }

  async save(applicationId: string, contact: Contact): Promise<void> {
    const values = {
      name: contact.name,
      role: contact.role,
      email: contact.email,
      linkedinUrl: contact.linkedinUrl,
      updatedAt: contact.updatedAt,
    };
    await this.database.db
      .insert(applicationContacts)
      .values({ ...values, id: contact.id, applicationId, createdAt: contact.createdAt })
      .onConflictDoUpdate({ target: applicationContacts.id, set: values });
  }

  async delete(applicationId: string, contactId: string): Promise<boolean> {
    const deleted = await this.database.db
      .delete(applicationContacts)
      .where(of(applicationId, contactId))
      .returning({ id: applicationContacts.id });
    return deleted.length > 0;
  }
}

const of = (applicationId: string, contactId: string) =>
  and(eq(applicationContacts.applicationId, applicationId), eq(applicationContacts.id, contactId));

function toContact(row: Row): Contact {
  return ContactSchema.parse({
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    linkedinUrl: row.linkedinUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
