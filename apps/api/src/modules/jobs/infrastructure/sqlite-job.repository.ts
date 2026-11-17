import { JobStatusSchema } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { JobRecord } from '../domain/job.js';
import { JobRepository, type NewJob } from '../application/jobs.ports.js';

interface JobRow {
  id: string;
  type: string;
  payload: string;
  dedupe_key: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/**
 * The `jobs` table through `node:sqlite` statements, which are synchronous: enqueueing can share another
 * module's `inTransaction()`, and select-then-update in `claimNext` cannot interleave with anything else.
 * Reads the connection on every call, since a restore can replace it.
 */
@Injectable()
export class SqliteJobRepository extends JobRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  enqueue(job: NewJob): JobRecord {
    const db = this.database.connection;
    if (job.dedupeKey !== null) {
      const existing = db.prepare('SELECT * FROM jobs WHERE dedupe_key = ?').get(job.dedupeKey) as
        JobRow | undefined;
      const finished =
        existing?.status === 'FAILED' || (existing?.status === 'SUCCEEDED' && job.restartFinished);
      if (existing && finished) {
        // Asking again for something that failed (or that should run again) means "run it again".
        db.prepare(
          `UPDATE jobs SET status = 'PENDING', attempts = 0, last_error = NULL, run_at = ?, updated_at = ?,
             finished_at = NULL, payload = ?, max_attempts = ? WHERE id = ?`,
        ).run(job.now, job.now, JSON.stringify(job.payload), job.maxAttempts, existing.id);
        return this.findById(existing.id)!;
      }
      if (existing) return toRecord(existing);
    }
    db.prepare(
      `INSERT INTO jobs (id, type, payload, dedupe_key, status, attempts, max_attempts, run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?, ?)`,
    ).run(
      job.id,
      job.type,
      JSON.stringify(job.payload),
      job.dedupeKey,
      job.maxAttempts,
      job.now,
      job.now,
      job.now,
    );
    return this.findById(job.id)!;
  }

  findByDedupeKey(dedupeKey: string): JobRecord | null {
    const row = this.database.connection
      .prepare('SELECT * FROM jobs WHERE dedupe_key = ?')
      .get(dedupeKey) as JobRow | undefined;
    return row ? toRecord(row) : null;
  }

  findById(id: string): JobRecord | null {
    const row = this.database.connection.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
      JobRow | undefined;
    return row ? toRecord(row) : null;
  }

  claimNext(types: string[], now: string): JobRecord | null {
    if (types.length === 0) return null;
    const db = this.database.connection;
    const row = db
      .prepare(
        `SELECT id FROM jobs WHERE status = 'PENDING' AND run_at <= ? AND type IN (${types.map(() => '?').join(', ')})
         ORDER BY run_at, created_at LIMIT 1`,
      )
      .get(now, ...types) as { id: string } | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE jobs SET status = 'RUNNING', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'PENDING'`,
    ).run(now, row.id);
    return this.findById(row.id);
  }

  markSucceeded(id: string, now: string): void {
    this.database.connection
      .prepare(
        `UPDATE jobs SET status = 'SUCCEEDED', last_error = NULL, updated_at = ?, finished_at = ? WHERE id = ?`,
      )
      .run(now, now, id);
  }

  markRetry(id: string, runAt: string, error: string, now: string): void {
    this.database.connection
      .prepare(
        `UPDATE jobs SET status = 'PENDING', run_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      )
      .run(runAt, error, now, id);
  }

  markFailed(id: string, error: string, now: string): void {
    this.database.connection
      .prepare(
        `UPDATE jobs SET status = 'FAILED', last_error = ?, updated_at = ?, finished_at = ? WHERE id = ?`,
      )
      .run(error, now, now, id);
  }

  requeueRunning(now: string): number {
    const result = this.database.connection
      .prepare(
        `UPDATE jobs SET status = 'PENDING', run_at = ?, updated_at = ? WHERE status = 'RUNNING'`,
      )
      .run(now, now);
    return Number(result.changes);
  }
}

function toRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    dedupeKey: row.dedupe_key,
    status: JobStatusSchema.parse(row.status),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAt: row.run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}
