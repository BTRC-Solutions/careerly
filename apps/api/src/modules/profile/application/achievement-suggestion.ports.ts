import type { AchievementSuggestion, SuggestAchievementRequest } from '@careerly/contracts';
import type { CvImportFailure } from './cv-import.ports.js';

/** Why there is no suggestion: the AI could not be used, or its answer added facts (RN-01). */
export type SuggestionFailure = Exclude<CvImportFailure, 'UNREADABLE_FILE'> | 'AI_UNFAITHFUL';

export class AchievementSuggestionError extends Error {
  constructor(
    readonly reason: SuggestionFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AchievementSuggestionError';
  }
}

/**
 * Port: rewords an achievement with AI (RF-PROF-10). Never stores or logs the text. Throws
 * `AchievementSuggestionError` when the AI cannot be used.
 */
export abstract class AchievementSuggester {
  abstract suggest(achievement: SuggestAchievementRequest): Promise<AchievementSuggestion>;
}
