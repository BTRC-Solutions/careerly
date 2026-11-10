import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health.js';

describe('HealthResponseSchema', () => {
  it('accepts a healthy response', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      version: '0.0.0',
      database: { status: 'ok', appliedMigrations: 1 },
    });
    expect(parsed.database.appliedMigrations).toBe(1);
  });

  it('rejects a negative migration count', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      version: '0.0.0',
      database: { status: 'ok', appliedMigrations: -1 },
    });
    expect(result.success).toBe(false);
  });
});
