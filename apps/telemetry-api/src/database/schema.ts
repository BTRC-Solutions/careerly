import type { TelemetryMetricsV1 } from '@careerly/contracts';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * The receiver's data (ARCHITECTURE §19.4). No IPs anywhere (RNF-23); kept without a time limit (D-11).
 */

/** An installation that sent at least once, with the key it must sign with from then on (ADR-26). */
export const installs = pgTable('installs', {
  installId: uuid('install_id').primaryKey(),
  /** Ed25519, its 32 raw bytes in base64url. */
  publicKey: text('public_key').notNull(),
  /** UTC day of its first accepted request. */
  registeredOn: date('registered_on', { mode: 'string' }).notNull(),
  /** Left out of the statistics (a suspicious installation) without deleting its data. */
  excluded: boolean('excluded').notNull().default(false),
});

/** One report per installation and day: the first one wins. */
export const reports = pgTable(
  'reports',
  {
    installId: uuid('install_id')
      .notNull()
      .references(() => installs.installId),
    /** The installation's local day the report describes. */
    day: date('day', { mode: 'string' }).notNull(),
    schemaVersion: integer('schema_version').notNull(),
    appVersion: text('app_version').notNull(),
    metrics: jsonb('metrics').$type<TelemetryMetricsV1>().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.installId, table.day] }),
    index('reports_day_idx').on(table.day),
  ],
);

/** "Already sent today": one successful request per installation and UTC day. */
export const sends = pgTable(
  'sends',
  {
    installId: uuid('install_id')
      .notNull()
      .references(() => installs.installId),
    utcDay: date('utc_day', { mode: 'string' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.installId, table.utcDay] })],
);
