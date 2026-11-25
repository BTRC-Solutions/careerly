import { describe, expect, it } from 'vitest';
import { afterFailure, errorCodeOf, MAX_RETRY_DELAY_MS, retryDelayMs } from './job.js';

describe('jobs domain', () => {
  it('waits exponentially longer after each failed attempt, up to a cap', () => {
    expect([1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, 2000))).toEqual([
      2000, 4000, 8000, 16000,
    ]);
    expect(retryDelayMs(30, 2000)).toBe(MAX_RETRY_DELAY_MS);
  });

  it('retries until the last attempt, unless the error is permanent', () => {
    const now = new Date('2026-11-17T10:00:00.000Z');
    expect(afterFailure({ attempts: 1, maxAttempts: 3 }, false, now, 1000)).toEqual({
      retry: true,
      runAt: '2026-11-17T10:00:01.000Z',
    });
    expect(afterFailure({ attempts: 3, maxAttempts: 3 }, false, now, 1000)).toEqual({
      retry: false,
    });
    expect(afterFailure({ attempts: 1, maxAttempts: 3 }, true, now, 1000)).toEqual({
      retry: false,
    });
  });

  it('waits what the handler asked for instead of the backoff, and still gives up at the last attempt', () => {
    const now = new Date('2026-11-17T10:00:00.000Z');
    expect(afterFailure({ attempts: 1, maxAttempts: 5 }, false, now, 1000, 30 * 60_000)).toEqual({
      retry: true,
      runAt: '2026-11-17T10:30:00.000Z',
    });
    expect(afterFailure({ attempts: 5, maxAttempts: 5 }, false, now, 1000, 60_000)).toEqual({
      retry: false,
    });
  });

  it('records the error code or class, never the message', () => {
    expect(errorCodeOf(Object.assign(new Error('secret JD text'), { code: 'RATE_LIMITED' }))).toBe(
      'RATE_LIMITED',
    );
    class AiBlockedError extends Error {
      override name = 'AiBlockedError';
    }
    expect(errorCodeOf(new AiBlockedError('profile content'))).toBe('AiBlockedError');
    expect(errorCodeOf('a string')).toBe('UnknownError');
  });
});
