import { describe, expect, it } from 'vitest';
import {
  CreateJobPostingRequestSchema,
  JOB_POSTING_TEXT_MAX,
  UpdateJobPostingRequestSchema,
} from './job-postings.js';

describe('job posting requests', () => {
  it('needs only the text and normalizes empty optionals', () => {
    expect(
      CreateJobPostingRequestSchema.parse({ text: '  We are hiring…  ', company: '', url: '' }),
    ).toEqual({
      title: null,
      company: null,
      url: null,
      location: null,
      workMode: null,
      salary: null,
      text: 'We are hiring…',
    });
  });

  it('validates the salary range and normalizes the currency', () => {
    const parsed = CreateJobPostingRequestSchema.parse({
      text: 'x',
      salary: { min: 3000, max: 4000, currency: 'usd', period: 'MONTH' },
    });
    expect(parsed.salary).toEqual({ min: 3000, max: 4000, currency: 'USD', period: 'MONTH' });

    expect(
      CreateJobPostingRequestSchema.safeParse({
        text: 'x',
        salary: { min: 5000, max: 4000, currency: null, period: null },
      }).success,
    ).toBe(false);
    // A range without amounts is no range.
    expect(
      CreateJobPostingRequestSchema.parse({
        text: 'x',
        salary: { min: null, max: null, currency: 'USD', period: 'YEAR' },
      }).salary,
    ).toBeNull();
  });

  it('rejects an empty or too long text, unknown fields and empty patches', () => {
    expect(CreateJobPostingRequestSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(
      CreateJobPostingRequestSchema.safeParse({ text: 'x'.repeat(JOB_POSTING_TEXT_MAX + 1) })
        .success,
    ).toBe(false);
    expect(CreateJobPostingRequestSchema.safeParse({ text: 'x', status: 'NEW' }).success).toBe(
      false,
    );
    expect(UpdateJobPostingRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateJobPostingRequestSchema.parse({ company: 'Acme' })).toEqual({ company: 'Acme' });
  });
});
