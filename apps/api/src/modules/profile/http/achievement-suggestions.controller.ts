import {
  type AchievementSuggestion,
  type SuggestAchievementRequest,
  SuggestAchievementRequestSchema,
} from '@careerly/contracts';
import { Body, Controller, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { AchievementSuggestionService } from '../application/achievement-suggestion.service.js';
import { ProfileErrorsInterceptor } from './profile-errors.interceptor.js';

/**
 * Wording suggestions for an achievement (RF-PROF-10). Saves nothing: the user accepts or discards the
 * suggestion in the form, then saves it as usual.
 */
@Controller('profile/achievements/suggestions')
@UseInterceptors(ProfileErrorsInterceptor)
export class AchievementSuggestionsController {
  constructor(private readonly suggestions: AchievementSuggestionService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  suggest(
    @Body(new ZodValidationPipe(SuggestAchievementRequestSchema)) body: SuggestAchievementRequest,
  ): Promise<AchievementSuggestion> {
    return this.suggestions.suggest(body);
  }
}
