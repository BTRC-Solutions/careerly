import { describe, expect, it } from 'vitest';
import { UpdateSettingsRequestSchema } from './settings.js';

describe('UpdateSettingsRequestSchema', () => {
  it('accepts a supported language and null', () => {
    expect(UpdateSettingsRequestSchema.parse({ uiLanguage: 'en' })).toEqual({ uiLanguage: 'en' });
    expect(UpdateSettingsRequestSchema.parse({ uiLanguage: null })).toEqual({ uiLanguage: null });
  });

  it('rejects an unsupported language', () => {
    expect(UpdateSettingsRequestSchema.safeParse({ uiLanguage: 'fr' }).success).toBe(false);
  });

  it('rejects unknown keys and empty patches', () => {
    expect(UpdateSettingsRequestSchema.safeParse({ dataDir: 'C:/x' }).success).toBe(false);
    expect(UpdateSettingsRequestSchema.safeParse({}).success).toBe(false);
  });
});
