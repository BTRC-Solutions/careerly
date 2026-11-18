import type { RevertProfileChangesResult, SessionProfileChanges } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import {
  ProfileChangeLog,
  SessionProfileChangeNotFoundError,
  TailoringSessionNotFoundError,
  TailoringSessionRepository,
} from './tailoring.ports.js';

/**
 * The changes a session made to the master profile (RF-TAIL-05) and undoing them, all at once or one by one
 * (RF-TAIL-06). Undoing works in any status: the snapshots of a finalized session keep their own copy of the
 * data (RNF-10), so the profile can still change.
 */
@Injectable()
export class SessionProfileChangesService {
  constructor(
    private readonly sessions: TailoringSessionRepository,
    private readonly log: ProfileChangeLog,
  ) {}

  async list(sessionId: string): Promise<SessionProfileChanges> {
    await this.ensureSession(sessionId);
    return { changes: await this.log.list(sessionId) };
  }

  async revert(sessionId: string, changeIds?: string[]): Promise<RevertProfileChangesResult> {
    await this.ensureSession(sessionId);
    if (changeIds) {
      const known = new Set((await this.log.list(sessionId)).map((change) => change.id));
      const unknown = changeIds.find((id) => !known.has(id));
      if (unknown !== undefined) throw new SessionProfileChangeNotFoundError(unknown);
    }
    const keptFields = await this.log.revert(sessionId, changeIds);
    return { changes: await this.log.list(sessionId), keptFields };
  }

  private async ensureSession(id: string) {
    if (!(await this.sessions.find(id))) throw new TailoringSessionNotFoundError(id);
  }
}
