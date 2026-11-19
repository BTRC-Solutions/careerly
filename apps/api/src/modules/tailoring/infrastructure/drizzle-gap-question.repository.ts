import {
  type Evidence,
  type GapAnswer,
  GapAnswerSchema,
  type GapQuestion,
  GapQuestionSchema,
} from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { gapQuestions } from '../../../platform/database/schema.js';
import { inTransaction } from '../../../platform/database/sqlite.js';
import { GapQuestionRepository } from '../application/tailoring.ports.js';

type Row = typeof gapQuestions.$inferSelect;

@Injectable()
export class DrizzleGapQuestionRepository extends GapQuestionRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async replace(sessionId: string, questions: GapQuestion[]): Promise<void> {
    const { connection } = this.database;
    // The proxy driver has no transactions, so the swap runs on the raw connection.
    inTransaction(connection, () => {
      connection.prepare('DELETE FROM gap_questions WHERE session_id = ?').run(sessionId);
      const insert = connection.prepare(
        'INSERT INTO gap_questions (session_id, requirement_id, position, question, answer, answered_at, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      questions.forEach(({ answer, answeredAt, created, ...question }, position) => {
        insert.run(
          sessionId,
          question.requirementId,
          position,
          JSON.stringify(question),
          answer === null ? null : JSON.stringify(answer),
          answeredAt,
          JSON.stringify(created),
        );
      });
    });
  }

  async list(sessionId: string): Promise<GapQuestion[]> {
    const rows = await this.database.db
      .select()
      .from(gapQuestions)
      .where(eq(gapQuestions.sessionId, sessionId))
      .orderBy(asc(gapQuestions.position));
    return rows.map(toQuestion);
  }

  async saveAnswer(
    sessionId: string,
    requirementId: string,
    answer: GapAnswer,
    answeredAt: string,
    created: Evidence[],
  ): Promise<void> {
    await this.database.db
      .update(gapQuestions)
      .set({ answer: JSON.stringify(answer), answeredAt, created: JSON.stringify(created) })
      .where(
        and(eq(gapQuestions.sessionId, sessionId), eq(gapQuestions.requirementId, requirementId)),
      );
  }

  async answersBetween(from: string, to: string): Promise<GapAnswer[]> {
    const rows = await this.database.db
      .select({ answer: gapQuestions.answer })
      .from(gapQuestions)
      .where(
        and(
          isNotNull(gapQuestions.answer),
          gte(gapQuestions.answeredAt, from),
          lt(gapQuestions.answeredAt, to),
        ),
      );
    return rows.map((row) => GapAnswerSchema.parse(JSON.parse(row.answer!)));
  }
}

/** JSON columns are validated on the way out. */
function toQuestion(row: Row): GapQuestion {
  return GapQuestionSchema.parse({
    ...(JSON.parse(row.question) as object),
    answer: row.answer === null ? null : GapAnswerSchema.parse(JSON.parse(row.answer)),
    answeredAt: row.answeredAt,
    created: JSON.parse(row.created) as unknown,
  });
}
