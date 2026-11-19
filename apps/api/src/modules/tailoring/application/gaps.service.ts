import type {
  Evidence,
  GapAnswer,
  GapQuestion,
  GapQuestions,
  TailoringSession as StoredSession,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import {
  gapQuestions,
  invalidAnswerReason,
  isAffirmative,
  keepAnswers,
  matchWithAnswers,
} from '../domain/gap.js';
import {
  applySessionEvent,
  InvalidSessionTransitionError,
  TailoringSessionValidationError,
} from '../domain/tailoring-session.js';
import {
  GapQuestionNotFoundError,
  GapQuestionRepository,
  ProfileReader,
  ProfileWriter,
  SessionNotMatchedError,
  TailoringSessionNotFoundError,
  TailoringSessionRepository,
} from './tailoring.ports.js';

/**
 * The gap questions of a session (RF-TAIL-04) and their answers (RF-GAP-01): asking them stores the list, which
 * then stays the same while the user answers in any order or skips. An affirmative answer is added to the master
 * profile at once (RF-TAIL-05) and the match follows it (RF-GAP-05); a "no" only stays in the session (RN-12).
 */
@Injectable()
export class GapsService {
  constructor(
    private readonly sessions: TailoringSessionRepository,
    private readonly questions: GapQuestionRepository,
    private readonly profile: ProfileReader,
    private readonly writer: ProfileWriter,
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
    const question = asked.find((candidate) => candidate.requirementId === requirementId);
    if (!question) throw new GapQuestionNotFoundError(requirementId);
    const invalid = invalidAnswerReason(answer, await this.profile.read());
    if (invalid) throw new TailoringSessionValidationError(invalid);

    // A changed answer replaces what the previous one added.
    if (question.created.length > 0) await this.writer.undo(id, question.created);
    const created = isAffirmative(answer) ? await this.addToProfile(id, question, answer) : [];
    await this.questions.saveAnswer(id, requirementId, answer, new Date().toISOString(), created);

    const questions = await this.questions.list(id);
    const { createdAt, updatedAt: _updatedAt, ...current } = await this.load(id);
    if (current.match) {
      await this.sessions.save({
        ...current,
        match: matchWithAnswers(current.match, questions),
        createdAt,
        updatedAt: new Date().toISOString(),
      });
    }
    return { questions };
  }

  /**
   * Adds the answer to the profile: an achievement with what the user did in each chosen position, or in the
   * project (created first when it is new). The requirement's catalog tool goes with the achievement. If a
   * write fails, what was already added is undone.
   */
  private async addToProfile(
    sessionId: string,
    question: GapQuestion,
    answer: GapAnswer,
  ): Promise<Evidence[]> {
    const toolIds = question.tool ? [question.tool.id] : [];
    const created: Evidence[] = [];
    try {
      if (answer.answer === 'USED_AT_WORK') {
        for (const positionId of answer.positionIds) {
          const id = await this.writer.createAchievement(
            sessionId,
            { kind: 'position', id: positionId },
            { text: answer.detail, toolIds },
          );
          created.push({ kind: 'ACHIEVEMENT', id });
        }
      } else if (answer.answer === 'USED_ELSEWHERE') {
        let projectId: string;
        if ('id' in answer.project) {
          projectId = answer.project.id;
        } else {
          projectId = await this.writer.createProject(sessionId, { ...answer.project, toolIds });
          created.push({ kind: 'PROJECT', id: projectId });
        }
        const id = await this.writer.createAchievement(
          sessionId,
          { kind: 'project', id: projectId },
          { text: answer.detail, toolIds },
        );
        created.push({ kind: 'ACHIEVEMENT', id });
      }
    } catch (error) {
      if (created.length > 0) await this.writer.undo(sessionId, created);
      throw error;
    }
    return created;
  }

  private async load(id: string): Promise<StoredSession> {
    const session = await this.sessions.find(id);
    if (!session) throw new TailoringSessionNotFoundError(id);
    return session;
  }
}
