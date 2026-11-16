import { describe, expect, it } from 'vitest';
import { UpdateSettingsRequestSchema, VerifyAiKeyRequestSchema } from './settings.js';

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

describe('VerifyAiKeyRequestSchema', () => {
  it('accepts an empty body and a trimmed key', () => {
    expect(VerifyAiKeyRequestSchema.parse({})).toEqual({});
    expect(VerifyAiKeyRequestSchema.parse({ apiKey: '  sk-ant-abc  ' })).toEqual({
      apiKey: 'sk-ant-abc',
    });
  });

  it('rejects blank keys, keys with spaces and unknown fields', () => {
    expect(VerifyAiKeyRequestSchema.safeParse({ apiKey: '   ' }).success).toBe(false);
    expect(VerifyAiKeyRequestSchema.safeParse({ apiKey: 'sk ant' }).success).toBe(false);
    expect(VerifyAiKeyRequestSchema.safeParse({ key: 'sk-ant-abc' }).success).toBe(false);
  });

  it('never includes the submitted key in its error messages', () => {
    const result = VerifyAiKeyRequestSchema.safeParse({ apiKey: 'sk-ant-secret value' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues.map((issue) => issue.message))).not.toContain(
      'secret',
    );
  });
});
