import type {
  GapAnswer,
  GapQuestions,
  TailoringSession as StoredSession,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { gapQuestions, invalidAnswerReason, keepAnswers } from '../domain/gap.js';
import {
  applySessionEvent,
  InvalidSessionTransitionError,
  TailoringSessionValidationError,
} from '../domain/tailoring-session.js';
import {
  GapQuestionNotFoundError,
  GapQuestionRepository,
  ProfileReader,
  SessionNotMatchedError,
  TailoringSessionNotFoundError,
  TailoringSessionRepository,
} from './tailoring.ports.js';

/**
 * The gap questions of a session (RF-TAIL-04) and their answers (RF-GAP-01): asking them stores the list, which
 * then stays the same while the user answers in any order or skips.
 */
@Injectable()
export class GapsService {
  constructor(
    private readonly sessions: TailoringSessionRepository,
    private readonly questions: GapQuestionRepository,
    private readonly profile: ProfileReader,
  ) {}

  /** The asked questions with their answers or, before asking, the ones the last match would ask. */
  async list(id: string): Promise<GapQuestions> {
    const session = await this.load(id);
    const asked = await this.questions.list(id);
    if (asked.length > 0 && session.status === 'AWAITING_ANSWERS') return { questions: asked };
    if (!session.match) throw new SessionNotMatchedError(id);
    return { questions: keepAnswers(gapQuestions(session.match), asked) };
  }

  /** Goes to the questions (after the match, or back from the review), keeping earlier answers. */
  async ask(id: string): Promise<GapQuestions> {
    const stored = await this.load(id);
    const { createdAt, updatedAt: _updatedAt, ...session } = stored;
    const next = applySessionEvent(session, { type: 'ASK_GAPS' });
    const questions = keepAnswers(gapQuestions(next.match!), await this.questions.list(id));
    await this.questions.replace(id, questions);
    await this.sessions.save({ ...next, createdAt, updatedAt: new Date().toISOString() });
    return { questions };
  }

  /** Saves the answer to one question; it can change until the CVs are generated. */
  async answer(id: string, requirementId: string, answer: GapAnswer): Promise<GapQuestions> {
    const session = await this.load(id);
    if (session.status !== 'AWAITING_ANSWERS') {
      throw new InvalidSessionTransitionError(session.status, 'ANSWER_GAP');
    }
    const asked = await this.questions.list(id);
    if (!asked.some((question) => question.requirementId === requirementId)) {
      throw new GapQuestionNotFoundError(requirementId);
    }
    const invalid = invalidAnswerReason(answer, await this.profile.read());
    if (invalid) throw new TailoringSessionValidationError(invalid);

    await this.questions.saveAnswer(id, requirementId, answer, new Date().toISOString());
    return { questions: await this.questions.list(id) };
  }

  private async load(id: string): Promise<StoredSession> {
    const session = await this.sessions.find(id);
    if (!session) throw new TailoringSessionNotFoundError(id);
    return session;
  }
}
