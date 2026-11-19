import type { ResumeLanguage } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { GapQuestionRepository, TailoredResumeRepository } from './tailoring.ports.js';

/** How much the tailoring features were used in a period: counts only, never what was written (RN-18). */
export interface TailoringUsage {
  resumesGenerated: number;
  outputLanguages: Partial<Record<ResumeLanguage, number>>;
  gapsAnswered: number;
}

/**
 * Usage of the tailoring features for the "uso de funciones" telemetry metric (RF-TEL-03h). A CV counts once
 * per session and language, on the day it was last generated (regenerating it moves it to that day); a gap
 * counts when its current answer was given, skipped ones aside.
 */
@Injectable()
export class TailoringUsageService {
  constructor(
    private readonly resumes: TailoredResumeRepository,
    private readonly questions: GapQuestionRepository,
  ) {}

  /** Usage in `[from, to)`, ISO instants. */
  async usageBetween(from: string, to: string): Promise<TailoringUsage> {
    const [languages, answers] = await Promise.all([
      this.resumes.languagesGeneratedBetween(from, to),
      this.questions.answersBetween(from, to),
    ]);
    const outputLanguages: Partial<Record<ResumeLanguage, number>> = {};
    for (const language of languages) {
      outputLanguages[language] = (outputLanguages[language] ?? 0) + 1;
    }
    return {
      resumesGenerated: languages.length,
      outputLanguages,
      gapsAnswered: answers.filter((answer) => answer.answer !== 'SKIPPED').length,
    };
  }
}
