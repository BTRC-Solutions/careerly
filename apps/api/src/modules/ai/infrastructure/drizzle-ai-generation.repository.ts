import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { aiGenerations } from '../../../platform/database/schema.js';
import { type AiGenerationEntry, AiGenerationRepository } from '../application/llm.ports.js';

@Injectable()
export class DrizzleAiGenerationRepository extends AiGenerationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async record(entry: AiGenerationEntry): Promise<void> {
    await this.database.db.insert(aiGenerations).values(entry);
  }
}
