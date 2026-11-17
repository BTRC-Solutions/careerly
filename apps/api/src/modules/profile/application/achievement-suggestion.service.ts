import type { AchievementSuggestion, SuggestAchievementRequest } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { inventedNumbers } from '../domain/suggestion-faithfulness.js';
import {
  AchievementSuggester,
  AchievementSuggestionError,
} from './achievement-suggestion.ports.js';

/** One more try when the first answer adds a fact; models usually comply the second time. */
const ATTEMPTS = 2;
const MAX_QUESTIONS = 3;

/**
 * Wording suggestions for achievements (RF-PROF-10). Nothing is saved here: the user accepts or discards
 * the suggestion in the form, and saving the form is what changes the profile. An answer with a number the
 * achievement does not have is never shown (RN-01).
 */
@Injectable()
export class AchievementSuggestionService {
  constructor(private readonly suggester: AchievementSuggester) {}

  async suggest(achievement: SuggestAchievementRequest): Promise<AchievementSuggestion> {
    const source = [achievement.text, achievement.metrics ?? ''].join('\n');
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const answer = await this.suggester.suggest(achievement);
      const suggestion = {
        text: answer.text.trim(),
        metrics: answer.metrics?.trim() || null,
        questions: answer.questions
          .map((question) => question.trim())
          .filter(Boolean)
          .slice(0, MAX_QUESTIONS),
      };
      const said = [suggestion.text, suggestion.metrics ?? ''].join('\n');
      if (suggestion.text && inventedNumbers(source, said).length === 0) return suggestion;
    }
    throw new AchievementSuggestionError(
      'AI_UNFAITHFUL',
      'The AI suggested data that is not in the achievement; the suggestion was discarded.',
    );
  }
}
