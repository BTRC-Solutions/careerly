import {
  type TelemetryBatchAccepted,
  TelemetryBatchV1Schema,
  type TelemetryErrorResponse,
  telemetryPowChallenge,
} from '@careerly/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { APP_DEPS, type AppDeps } from '../deps.js';
import { isValidProof, isValidSignature } from './crypto.js';
import { isDayInWindow, secondsToNextUtcDay, utcDay } from './days.js';
import { IpLimits } from './ip-limits.js';
import { AlreadySentTodayError, ReportsRepository } from './reports.repository.js';

/** Report formats the receiver still accepts. Older ones get `410` and the app stops sending them. */
const SUPPORTED_SCHEMA_VERSIONS = [1];

export interface IngestRequest {
  ip: string;
  contentType: string | undefined;
  body: Buffer;
  signature: string | undefined;
  pow: string | undefined;
}

export interface IngestAnswer {
  status: number;
  body: TelemetryBatchAccepted | TelemetryErrorResponse;
  headers?: Record<string, string>;
}

type ErrorCode = TelemetryErrorResponse['error']['code'];

/** Just what the signature check needs: who sends, and its key when it is new. */
const HeadSchema = z.object({
  schemaVersion: z.number().int(),
  installId: z.uuid(),
  publicKey: z.string().optional(),
});

/**
 * `POST /v1/reports` (ARCHITECTURE §19.4, ADR-26). The checks go from the cheapest to the most expensive, so each
 * rejection costs as little as possible: shape, rate limit, signature, new installation, one request a day,
 * schema and plausibility, and the insertion. The log keeps the result and the reason, never the content or IP.
 */
@Injectable()
export class IngestService {
  constructor(
    @Inject(APP_DEPS) private readonly deps: AppDeps,
    private readonly limits: IpLimits,
    private readonly repository: ReportsRepository,
  ) {}

  async ingest(request: IngestRequest): Promise<IngestAnswer> {
    const { config, now } = this.deps;
    const today = utcDay(now());

    // 1. Shape. The size was already capped while reading the body.
    if (!request.contentType?.toLowerCase().startsWith('application/json')) {
      return this.reject(415, 'UNSUPPORTED_MEDIA_TYPE');
    }

    // 2. Rate limit per IP.
    const limited = this.limits.hit(request.ip);
    if (!limited.ok) {
      return this.reject(429, 'RATE_LIMITED', {
        headers: { 'Retry-After': String(limited.retryAfterSeconds) },
      });
    }

    // 3. Signature over the exact bytes, before looking at the reports.
    let json: unknown;
    try {
      json = JSON.parse(request.body.toString('utf8'));
    } catch {
      return this.reject(400, 'INVALID_REPORT', { reason: 'not JSON' });
    }
    const head = HeadSchema.safeParse(json);
    if (!head.success) return this.reject(400, 'INVALID_REPORT', { reason: 'no installation' });
    const { installId, schemaVersion } = head.data;
    const log = { install: installId.slice(0, 8), schemaVersion };
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
      return schemaVersion < Math.min(...SUPPORTED_SCHEMA_VERSIONS)
        ? this.reject(410, 'SCHEMA_VERSION_GONE', { log })
        : this.reject(400, 'INVALID_REPORT', { log, reason: 'unknown schema version' });
    }

    const known = await this.repository.installation(installId);
    const publicKey = known?.publicKey ?? head.data.publicKey;
    const keyChanged = known && head.data.publicKey && head.data.publicKey !== known.publicKey;
    if (!publicKey || keyChanged || !isValidSignature(request.body, request.signature, publicKey)) {
      return this.reject(401, 'INVALID_SIGNATURE', { log });
    }

    // 4. A new installation pays a proof of work, and one IP registers one a day.
    if (!known) {
      const proof = request.pow ?? '';
      if (
        !isValidProof(
          telemetryPowChallenge(installId, publicKey, today, proof),
          config.powDifficulty,
        )
      ) {
        return this.reject(428, 'PROOF_OF_WORK_REQUIRED', {
          log,
          difficulty: config.powDifficulty,
        });
      }
      if (!this.limits.mayRegister(request.ip)) {
        return this.reject(429, 'RATE_LIMITED', {
          log,
          reason: 'a new installation from this IP today',
          headers: { 'Retry-After': String(secondsToNextUtcDay(now())) },
        });
      }
    }

    // 5. One successful request per installation and UTC day.
    if (known && (await this.repository.sentOn(installId, today))) {
      return this.reject(409, 'ALREADY_SENT_TODAY', { log });
    }

    // 6. Schema and plausibility: a value out of range rejects the whole batch.
    const batch = TelemetryBatchV1Schema.safeParse(json);
    if (!batch.success) {
      // Paths and rules only, never the values.
      const reason = batch.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.code}`)
        .join('; ');
      return this.reject(400, 'INVALID_REPORT', { log, reason });
    }
    const outside = batch.data.reports.filter((report) => !isDayInWindow(report.day, now()));
    if (outside.length > 0) {
      return this.reject(400, 'INVALID_REPORT', { log, reason: 'day out of the window' });
    }

    // 7. Insertion.
    if (!known && !this.limits.takeNewInstall()) {
      this.deps.logger.warn(
        { alert: 'new-installs-per-hour' },
        'The limit of new installations per hour was reached.',
      );
      return this.reject(429, 'RATE_LIMITED', {
        log,
        reason: 'new installations per hour',
        headers: { 'Retry-After': '3600' },
      });
    }
    let stored: string[];
    try {
      stored = await this.repository.store({
        installId,
        utcDay: today,
        newPublicKey: known ? null : publicKey,
        reports: batch.data.reports,
      });
    } catch (error) {
      if (error instanceof AlreadySentTodayError) {
        return this.reject(409, 'ALREADY_SENT_TODAY', { log });
      }
      throw error;
    }
    if (!known) this.limits.registered(request.ip);

    const accepted = batch.data.reports.map((r) => r.day).filter((day) => stored.includes(day));
    const duplicates = batch.data.reports.map((r) => r.day).filter((day) => !stored.includes(day));
    this.deps.logger.info(
      {
        ...log,
        status: 202,
        accepted: accepted.length,
        duplicates: duplicates.length,
        new: !known,
      },
      'Reports received.',
    );
    return { status: 202, body: { accepted, duplicates } };
  }

  private reject(
    status: number,
    code: ErrorCode,
    extra: {
      log?: object;
      reason?: string;
      difficulty?: number;
      headers?: Record<string, string>;
    } = {},
  ): IngestAnswer {
    this.deps.logger.info(
      { ...extra.log, status, code, reason: extra.reason },
      'Reports rejected.',
    );
    return {
      status,
      body: {
        error: {
          code,
          ...(extra.difficulty === undefined ? {} : { difficulty: extra.difficulty }),
        },
      },
      ...(extra.headers ? { headers: extra.headers } : {}),
    };
  }
}
