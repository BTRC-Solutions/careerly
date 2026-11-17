import { describe, expect, it } from 'vitest';
import { formDefaults, JobPostingFormSchema } from './form-schema';

describe('JobPostingFormSchema', () => {
  it('sends only the text when nothing else is filled', () => {
    expect(JobPostingFormSchema.parse({ ...formDefaults(), text: 'We are hiring' })).toEqual({
      text: 'We are hiring',
      title: null,
      company: null,
      url: null,
      location: null,
      workMode: null,
      salary: null,
    });
  });

  it('builds the salary range from its inputs', () => {
    const parsed = JobPostingFormSchema.parse({
      ...formDefaults(),
      text: 'x',
      workMode: 'HYBRID',
      salaryMin: '3000',
      salaryMax: '',
      salaryCurrency: 'ars',
      salaryPeriod: 'MONTH',
    });
    expect(parsed.workMode).toBe('HYBRID');
    expect(parsed.salary).toEqual({ min: 3000, max: null, currency: 'ARS', period: 'MONTH' });
  });

  it('points at the field that is wrong', () => {
    const result = JobPostingFormSchema.safeParse({
      ...formDefaults(),
      text: 'x',
      salaryMin: '5000',
      salaryMax: '4000',
      salaryCurrency: 'dollars',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual(
      expect.arrayContaining([['salaryCurrency', 'validation.currency']]),
    );

    const range = JobPostingFormSchema.safeParse({
      ...formDefaults(),
      text: 'x',
      salaryMin: '5000',
      salaryMax: '4000',
    });
    expect(range.error?.issues[0]).toMatchObject({
      path: ['salaryMax'],
      message: 'validation.salaryRange',
    });
  });

  it('round-trips a saved posting through the form defaults', () => {
    const saved = {
      id: 'p-1',
      text: 'JD',
      title: 'Engineer',
      company: 'Acme',
      url: 'https://acme.example/jobs/1',
      location: 'Remote',
      workMode: 'REMOTE' as const,
      salary: { min: 1, max: 2, currency: 'USD', period: 'YEAR' as const },
      createdAt: '2026-11-17T10:00:00.000Z',
      updatedAt: '2026-11-17T10:00:00.000Z',
    };
    const { id: _id, createdAt: _created, updatedAt: _updated, ...fields } = saved;
    expect(JobPostingFormSchema.parse(formDefaults(saved))).toEqual(fields);
  });
});
