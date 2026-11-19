import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { tailoringRelevance } from '../../../platform/database/schema.js';
import { RelevanceRepository, type SessionRelevance } from '../application/tailoring.ports.js';

const ScoresSchema = z.array(
  z.object({
    kind: z.enum(['ACHIEVEMENT', 'PROJECT']),
    id: z.string(),
    score: z.number().min(0).max(1),
  }),
);

@Injectable()
export class DrizzleRelevanceRepository extends RelevanceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async save(relevance: SessionRelevance): Promise<void> {
    const row = {
      sessionId: relevance.sessionId,
      scores: JSON.stringify(relevance.scores),
      promptVersion: relevance.promptVersion,
      model: relevance.model,
      scoredAt: relevance.scoredAt,
    };
    const { sessionId: _sessionId, ...changes } = row;
    await this.database.db
      .insert(tailoringRelevance)
      .values(row)
      .onConflictDoUpdate({ target: tailoringRelevance.sessionId, set: changes });
  }

  async find(sessionId: string): Promise<SessionRelevance | null> {
    const [row] = await this.database.db
      .select()
      .from(tailoringRelevance)
      .where(eq(tailoringRelevance.sessionId, sessionId));
    if (!row) return null;
    // JSON columns are validated on the way out.
    return { ...row, scores: ScoresSchema.parse(JSON.parse(row.scores) as unknown) };
  }
}
