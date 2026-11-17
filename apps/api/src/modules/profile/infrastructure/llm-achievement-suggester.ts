import type { SuggestAchievementRequest } from '@careerly/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AiError, LlmClient, untrustedText } from '../../ai/index.js';
import {
  AchievementSuggester,
  AchievementSuggestionError,
} from '../application/achievement-suggestion.ports.js';
import { aiFailure } from './ai-failure.js';
import { ACHIEVEMENT_SUGGESTION_V1 } from './prompts/achievement-suggestion.v1.js';

/* The answer the model must produce (also sent to the provider as JSON Schema). */
const SuggestionAnswerSchema = z.object({
  text: z.string(),
  metrics: z.string().nullable(),
  questions: z.array(z.string()),
});

/** Wording is writing: the large tier (ARCHITECTURE §7.3). One achievement is a short answer. */
const TIMEOUT_MS = 60_000;

/**
 * Rewords an achievement with the active AI provider (ADR-23). The text goes in an untrusted block (it may
 * have been pasted from anywhere). Neither the achievement nor the suggestion is logged.
 */
@Injectable()
export class LlmAchievementSuggester extends AchievementSuggester {
  private readonly logger = new Logger(LlmAchievementSuggester.name);

  constructor(private readonly llm: LlmClient) {
    super();
  }

  async suggest(achievement: SuggestAchievementRequest) {
    try {
      const { data, usage } = await this.llm.generateStructured({
        task: 'achievement-suggestion',
        prompt: ACHIEVEMENT_SUGGESTION_V1,
        tier: 'large',
        input: [
          {
            type: 'text',
            text: 'Suggest a better wording for this achievement, with the same facts.',
          },
          untrustedText('achievement', achievement.text),
          ...(achievement.metrics ? [untrustedText('metrics', achievement.metrics)] : []),
        ],
        schema: SuggestionAnswerSchema,
        timeoutMs: TIMEOUT_MS,
      });
      this.logger.log(`Achievement suggestion from ${usage.model} (${usage.attempts} attempt(s)).`);
      return data;
    } catch (error) {
      if (error instanceof AiError) {
        throw new AchievementSuggestionError(aiFailure(error), error.message);
      }
      throw error;
    }
  }
}
