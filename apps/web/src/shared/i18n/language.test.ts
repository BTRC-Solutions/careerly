import { describe, expect, it } from 'vitest';
import { resolveUiLanguage, systemLanguage } from './language';

describe('systemLanguage', () => {
  it.each([
    ['es-AR', 'es'],
    ['ES', 'es'],
    ['en-US', 'en'],
    ['pt-BR', 'en'],
    [undefined, 'en'],
  ] as const)('%s → %s', (navigatorLanguage, expected) => {
    expect(systemLanguage(navigatorLanguage)).toBe(expected);
  });
});

describe('resolveUiLanguage', () => {
  it('uses the saved preference over the system language', () => {
    expect(resolveUiLanguage('en', 'es-AR')).toBe('en');
    expect(resolveUiLanguage('es', 'en-US')).toBe('es');
  });

  it('follows the system language while there is no preference', () => {
    expect(resolveUiLanguage(null, 'es-AR')).toBe('es');
    expect(resolveUiLanguage(undefined, 'en-GB')).toBe('en');
  });
});
