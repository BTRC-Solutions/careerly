import { describe, expect, it } from 'vitest';
import { resumeFileName } from './resume-file-name.js';

describe('resumeFileName', () => {
  it('joins name, job title and company with the language', () => {
    expect(
      resumeFileName({
        name: 'Ana García',
        jobTitle: 'Backend Engineer',
        company: 'Acme',
        language: 'en',
      }),
    ).toBe('Ana García - Backend Engineer - Acme (EN).pdf');
  });

  it('leaves out the missing parts', () => {
    expect(
      resumeFileName({ name: 'Ana García', jobTitle: null, company: '  ', language: 'es' }),
    ).toBe('Ana García (ES).pdf');
  });

  it('replaces characters a file name cannot have and trims the result', () => {
    expect(
      resumeFileName({
        name: 'Ana',
        jobTitle: 'Dev C/C++ <Sr>',
        company: 'Acme: "R&D"\n...',
        language: 'en',
      }),
    ).toBe('Ana - Dev C C++ Sr - Acme R&D (EN).pdf');
  });

  it('keeps long names within the limit', () => {
    const name = resumeFileName({
      name: 'A'.repeat(300),
      jobTitle: null,
      company: null,
      language: 'en',
    });
    expect(name).toBe(`${'A'.repeat(150)} (EN).pdf`);
  });
});
