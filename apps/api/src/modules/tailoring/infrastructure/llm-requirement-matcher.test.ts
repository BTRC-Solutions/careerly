import type { Profile } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { describeProfile } from './llm-requirement-matcher.js';

const provenance = {
  origin: 'MANUAL',
  originSessionId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

const achievement = (id: string, text: string) => ({
  id,
  text,
  metrics: null,
  tools: [],
  ...provenance,
});

const profile = {
  personalInfo: {
    firstNames: 'Ana',
    lastNames: 'Pérez',
    headline: 'Data Engineer',
    location: null,
    email: 'ana@example.com',
    phone: null,
    summary: null,
    links: [],
    updatedAt: null,
  },
  positions: [
    {
      id: 'pos-a',
      company: 'Acme',
      title: 'Data Engineer',
      location: null,
      workMode: null,
      startDate: '2021-01',
      endDate: '2024-06',
      context: null,
      tools: [],
      achievements: [achievement('ach-a', 'Built the ingestion pipeline.')],
      ...provenance,
    },
  ],
  projects: [
    {
      id: 'prj-a',
      name: 'Open data CLI',
      kind: 'OPEN_SOURCE',
      role: 'Maintainer',
      url: null,
      startDate: null,
      endDate: null,
      description: 'A CLI to download open datasets.',
      tools: [{ id: 't1', name: 'Python' }],
      achievements: [achievement('ach-b', 'Reached 2k stars.')],
      ...provenance,
    },
  ],
  education: [
    {
      id: 'edu-a',
      institution: 'UBA',
      title: 'Licenciatura en Ciencias de la Computación',
      kind: 'DEGREE',
      field: null,
      startDate: '2014-03',
      endDate: '2020-12',
      description: null,
      ...provenance,
    },
  ],
  certifications: [
    {
      id: 'cert-a',
      name: 'AWS Certified Data Engineer',
      issuer: 'Amazon',
      issueDate: '2023-05',
      expirationDate: null,
      credentialId: null,
      url: null,
      ...provenance,
    },
  ],
  languages: [{ id: 'lang-a', language: 'English', level: 'B2', notes: null, ...provenance }],
} as unknown as Profile;

describe('describeProfile', () => {
  it('numbers every element and maps each reference back to its id', () => {
    const { text, refs } = describeProfile(profile);
    expect(text).toContain('[W1] Data Engineer at Acme (2021-01 – 2024-06).');
    expect(text).toContain('  [A1] Built the ingestion pipeline.');
    expect(text).toContain(
      '[P1] Open data CLI (open source project, Maintainer, no dates). A CLI to download open datasets. Tools: Python.',
    );
    expect(text).toContain('  [A2] Reached 2k stars.');
    expect(text).toContain('[E1] Licenciatura en Ciencias de la Computación at UBA, degree');
    expect(text).toContain('[C1] AWS Certified Data Engineer (Amazon), 2023-05.');
    expect(text).toContain('[L1] English: B2.');
    expect(Object.fromEntries(refs)).toEqual({
      W1: { kind: 'POSITION', id: 'pos-a' },
      A1: { kind: 'ACHIEVEMENT', id: 'ach-a' },
      P1: { kind: 'PROJECT', id: 'prj-a' },
      A2: { kind: 'ACHIEVEMENT', id: 'ach-b' },
      E1: { kind: 'EDUCATION', id: 'edu-a' },
      C1: { kind: 'CERTIFICATION', id: 'cert-a' },
      L1: { kind: 'LANGUAGE', id: 'lang-a' },
    });
  });

  it('leaves out personal data the match does not need', () => {
    const { text } = describeProfile(profile);
    expect(text).toContain('Headline: Data Engineer');
    expect(text).not.toContain('Pérez');
    expect(text).not.toContain('ana@example.com');
  });
});
