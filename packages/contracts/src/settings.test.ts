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
  it('accepts an empty body and a trimmed candidate key with its provider', () => {
    expect(VerifyAiKeyRequestSchema.parse({})).toEqual({});
    expect(
      VerifyAiKeyRequestSchema.parse({ provider: 'gemini', apiKey: '  AIzaSy-abc  ' }),
    ).toEqual({
      provider: 'gemini',
      apiKey: 'AIzaSy-abc',
    });
  });

  it('requires the provider of a candidate key and rejects unknown providers', () => {
    expect(VerifyAiKeyRequestSchema.safeParse({ apiKey: 'AIzaSy-abc' }).success).toBe(false);
    expect(
      VerifyAiKeyRequestSchema.safeParse({ provider: 'openai', apiKey: 'sk-abc-0123' }).success,
    ).toBe(false);
  });

  it('rejects blank keys, keys with spaces and unknown fields', () => {
    expect(VerifyAiKeyRequestSchema.safeParse({ provider: 'gemini', apiKey: '   ' }).success).toBe(
      false,
    );
    expect(
      VerifyAiKeyRequestSchema.safeParse({ provider: 'gemini', apiKey: 'sk ant 0123456' }).success,
    ).toBe(false);
    expect(VerifyAiKeyRequestSchema.safeParse({ key: 'sk-ant-abc' }).success).toBe(false);
  });

  it('never includes the submitted key in its error messages', () => {
    const result = VerifyAiKeyRequestSchema.safeParse({
      provider: 'anthropic',
      apiKey: 'sk-ant-secret value',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues.map((issue) => issue.message))).not.toContain(
      'secret',
    );
  });
});
