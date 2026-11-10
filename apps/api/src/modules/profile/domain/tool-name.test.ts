import { describe, expect, it } from 'vitest';
import { cleanToolDisplayName, normalizeToolName } from './tool-name.js';

describe('normalizeToolName', () => {
  it.each([
    ['PostgreSQL', 'postgresql'],
    ['Node.js', 'nodejs'],
    ['node js', 'nodejs'],
    ['NODE-JS', 'nodejs'],
    ['CI/CD', 'cicd'],
    ['Objective-C', 'objectivec'],
    ['  Vue.js  ', 'vuejs'],
    ['Señal', 'senal'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeToolName(input)).toBe(expected);
  });

  it('keeps # and + so C, C# and C++ stay different', () => {
    const keys = ['C', 'C#', 'C++', 'F#'].map(normalizeToolName);
    expect(keys).toEqual(['c', 'c#', 'c++', 'f#']);
    expect(new Set(keys).size).toBe(4);
  });

  it('returns an empty key when only separators are left', () => {
    expect(normalizeToolName(' .-/ ')).toBe('');
  });
});

describe('cleanToolDisplayName', () => {
  it('trims and collapses whitespace but keeps the casing', () => {
    expect(cleanToolDisplayName('  React   Native ')).toBe('React Native');
  });
});
