import { describe, expect, it } from 'vitest';
import {
  CreateEducationRequestSchema,
  CreatePositionRequestSchema,
  UpdateAchievementRequestSchema,
  UpdateEducationRequestSchema,
  UpdatePersonalInfoRequestSchema,
  UpdatePositionRequestSchema,
} from './profile.js';

describe('profile request schemas', () => {
  it('fills defaults and normalizes empty optionals on create', () => {
    expect(
      CreatePositionRequestSchema.parse({
        company: ' Acme ',
        title: 'Engineer',
        startDate: '2020-01',
        location: '',
      }),
    ).toEqual({
      company: 'Acme',
      title: 'Engineer',
      location: null,
      workMode: null,
      startDate: '2020-01',
      endDate: null,
      context: null,
      toolIds: [],
    });
    expect(CreateEducationRequestSchema.parse({ institution: 'UBA', title: 'Ing.' }).kind).toBe(
      'DEGREE',
    );
  });

  it('PATCH schemas only contain the fields that were sent (no defaults)', () => {
    expect(UpdatePositionRequestSchema.parse({ company: 'X' })).toEqual({ company: 'X' });
    expect(UpdateEducationRequestSchema.parse({ title: 'Y' })).toEqual({ title: 'Y' });
    expect(UpdateAchievementRequestSchema.parse({ metrics: null })).toEqual({ metrics: null });
  });

  it('PATCH schemas reject empty bodies and unknown keys', () => {
    expect(UpdatePositionRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdatePositionRequestSchema.safeParse({ origin: 'GAP_ANSWER' }).success).toBe(false);
  });

  it('validates months, emails and link URLs', () => {
    expect(UpdatePositionRequestSchema.safeParse({ startDate: '2020-13' }).success).toBe(false);
    expect(UpdatePositionRequestSchema.safeParse({ startDate: '2020-1' }).success).toBe(false);
    expect(UpdatePersonalInfoRequestSchema.safeParse({ email: 'nope' }).success).toBe(false);
    expect(UpdatePersonalInfoRequestSchema.parse({ email: '' })).toEqual({ email: null });
    expect(
      UpdatePersonalInfoRequestSchema.safeParse({
        links: [{ kind: 'OTHER', url: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
  });

  it('deduplicates tool ids', () => {
    expect(UpdateAchievementRequestSchema.parse({ toolIds: ['a', 'b', 'a'] })).toEqual({
      toolIds: ['a', 'b'],
    });
  });
});
