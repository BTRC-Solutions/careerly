// @vitest-environment jsdom
import type { GapQuestion, GapKind, RequirementKind } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import i18n from '../../../shared/i18n';
import { gapQuestionText } from './gap-question-text';

const question = (kind: RequirementKind, gap: GapKind, changes: Partial<GapQuestion> = {}) =>
  ({
    requirementId: 'r1',
    label: 'Liderar equipos',
    kind,
    importance: 'REQUIRED',
    tool: null,
    gap,
    relatedEvidence: [],
    answer: null,
    answeredAt: null,
    ...changes,
  }) satisfies GapQuestion;

describe('gapQuestionText', () => {
  it('words every kind of requirement and gap in both languages, without placeholders left', async () => {
    for (const language of ['es', 'en']) {
      await i18n.changeLanguage(language);
      for (const kind of ['TOOL', 'SKILL', 'LANGUAGE', 'OTHER'] as const) {
        for (const gap of ['MISSING', 'PARTIAL'] as const) {
          const text = gapQuestionText(question(kind, gap), i18n.t);
          expect(text.question).toContain('Liderar equipos');
          expect(text.question).not.toMatch(/tailoring\.|\{\{/);
          if (gap === 'PARTIAL') expect(text.hint).toMatch(/\S/);
          else expect(text.hint).toBeNull();
        }
      }
    }
  });

  it('names the catalog tool instead of how the job description wrote it', async () => {
    await i18n.changeLanguage('es');
    const text = gapQuestionText(
      question('TOOL', 'MISSING', { label: 'Postgres', tool: { id: 't', name: 'PostgreSQL' } }),
      i18n.t,
    );
    expect(text.question).toBe('¿Usaste PostgreSQL?');
  });
});
