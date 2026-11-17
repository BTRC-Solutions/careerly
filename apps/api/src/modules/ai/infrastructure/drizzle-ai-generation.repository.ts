import type { LlmProviderId } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { aiGenerations } from '../../../platform/database/schema.js';
import {
  type AiGenerationEntry,
  AiGenerationRepository,
  type AiGenerationUsage,
} from '../application/llm.ports.js';

@Injectable()
export class DrizzleAiGenerationRepository extends AiGenerationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async record(entry: AiGenerationEntry): Promise<void> {
    await this.database.db.insert(aiGenerations).values(entry);
  }

  async listSince(from: string): Promise<AiGenerationUsage[]> {
    const rows = await this.database.db
      .select({
        task: aiGenerations.task,
        inputTokens: aiGenerations.inputTokens,
        outputTokens: aiGenerations.outputTokens,
        costUsd: aiGenerations.costUsd,
        createdAt: aiGenerations.createdAt,
      })
      .from(aiGenerations)
      .where(gte(aiGenerations.createdAt, from));
    return rows as AiGenerationUsage[];
  }

  async latestErrorSince(provider: LlmProviderId, from: string): Promise<string | null> {
    const [latest] = await this.database.db
      .select({ errorCode: aiGenerations.errorCode })
      .from(aiGenerations)
      .where(and(eq(aiGenerations.provider, provider), gte(aiGenerations.createdAt, from)))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(1);
    return latest?.errorCode ?? null;
  }
}
