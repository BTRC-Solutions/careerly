import { DrizzleQueryError } from 'drizzle-orm/errors';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { NestPinoLogger, withoutQueryParams } from './logger.js';

/* What a failed query leaves in the log: the query, never its parameters (RNF-02, roadmap 8.4). */

const failed = () =>
  new DrizzleQueryError(
    'insert into "profile_achievements" ("id", "text") values (?, ?)',
    ['a1', 'Led the secret\n    migration of Acme'],
    new Error('UNIQUE constraint failed: profile_achievements.id'),
  );

function capture() {
  const lines: string[] = [];
  const logger = new NestPinoLogger(
    pino({ level: 'trace' }, { write: (line: string) => lines.push(line) }),
  );
  return { logger, output: () => lines.join('') };
}

describe('withoutQueryParams', () => {
  it('cuts the parameters of a failed query and keeps the query', () => {
    expect(withoutQueryParams(failed().message)).toBe(
      'Failed query: insert into "profile_achievements" ("id", "text") values (?, ?)\nparams: [not logged]',
    );
  });

  it('cuts them from a stack and keeps the frames', () => {
    const stack = withoutQueryParams(failed().stack!);
    expect(stack).not.toContain('secret');
    expect(stack).toMatch(/^Error: Failed query: insert[^\n]*\nparams: \[not logged\]\n\s+at /);
  });

  it('leaves any other text as it is', () => {
    expect(withoutQueryParams('Backup created: x.zip (10 bytes).')).toBe(
      'Backup created: x.zip (10 bytes).',
    );
  });
});

describe('NestPinoLogger', () => {
  it('never writes the parameters of a failed query, in the message or the stack', () => {
    const { logger, output } = capture();
    const error = failed();
    logger.error(error.message, error.stack, 'ApiExceptionFilter');
    logger.warn(`Telemetry reports were not built: ${error.message}`, 'TelemetryScheduler');
    logger.log(error.message, 'Test');

    expect(output()).toContain('Failed query: insert into');
    expect(output()).toContain('params: [not logged]');
    expect(output()).not.toContain('secret');
    expect(output()).not.toContain('Acme');
  });
});
