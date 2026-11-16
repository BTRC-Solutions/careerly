import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiCredentialsStore } from './ai-credentials.store.js';
import { AiModelChoiceStore } from './ai-model-choice.store.js';
import { LlmClient } from './llm-client.js';
import {
  AiInvalidOutputError,
  AiModelUnavailableError,
  AiNotConfiguredError,
  AiProviderNotSupportedError,
  AiRateLimitedError,
} from './llm-errors.js';
import {
  type AiGenerationEntry,
  AiGenerationRepository,
  LlmProvider,
  LlmProviderRegistry,
} from './llm.ports.js';
import type { ModelTier, ProviderRequest, ProviderResponse } from './llm.types.js';

const KEY = 'AIzaSyFakeGeminiKey_0123456789';
const PROMPT = { id: 'test.v1', system: 'System prompt for tests.' };
const Schema = z.object({ title: z.string(), years: z.number().int() });

/** Provider fake that answers from a script and remembers what it was asked. */
class FakeProvider extends LlmProvider {
  readonly id = 'gemini' as const;
  readonly requests: ProviderRequest[] = [];
  constructor(private readonly answers: (string | Error)[]) {
    super();
  }
  modelsFor(tier: ModelTier) {
    return tier === 'small' ? ['fake-small', 'fake-small-fallback'] : ['fake-large'];
  }
  estimateCostUsd(_model: string, input: number, output: number) {
    return (input + output) / 1000;
  }
  describeModel() {
    return undefined;
  }
  listModels() {
    return Promise.resolve(['fake-small', 'fake-large']);
  }
  generateJson(request: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(structuredClone({ ...request, apiKey: request.apiKey }));
    const next = this.answers.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({ text: next ?? '', inputTokens: 100, outputTokens: 20 });
  }
}

class MemoryGenerations extends AiGenerationRepository {
  readonly entries: AiGenerationEntry[] = [];
  record(entry: AiGenerationEntry) {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function setup(answers: (string | Error)[], provider: 'gemini' | 'anthropic' | null = 'gemini') {
  const credentials = new AiCredentialsStore();
  if (provider) credentials.set({ provider, apiKey: KEY });
  const fake = new FakeProvider(answers);
  const registry = new (class extends LlmProviderRegistry {
    get(id: string) {
      return id === 'gemini' ? fake : undefined;
    }
  })();
  const generations = new MemoryGenerations();
  const choices = new AiModelChoiceStore();
  const client = new LlmClient(credentials, registry, generations, choices);
  const call = () =>
    client.generateStructured({
      task: 'smoke-test',
      prompt: PROMPT,
      tier: 'small',
      input: [{ type: 'text', text: 'Extract the title.' }],
      schema: Schema,
    });
  return { client, fake, generations, choices, call };
}

describe('LlmClient', () => {
  it('returns validated data, sends the schema and records usage without content', async () => {
    const { fake, generations, call } = setup(['{"title":"Engineer","years":5}']);

    const result = await call();

    expect(result.data).toEqual({ title: 'Engineer', years: 5 });
    expect(result.usage).toMatchObject({
      provider: 'gemini',
      model: 'fake-small',
      attempts: 1,
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.12,
    });

    const sent = fake.requests[0]!;
    expect(sent.apiKey).toBe(KEY);
    expect(sent.system).toBe(PROMPT.system);
    expect(sent.jsonSchema).toMatchObject({
      type: 'object',
      properties: { title: { type: 'string' }, years: { type: 'integer' } },
    });
    expect(sent.jsonSchema).not.toHaveProperty('$schema');

    expect(generations.entries).toHaveLength(1);
    const entry = generations.entries[0]!;
    expect(entry).toMatchObject({
      task: 'smoke-test',
      provider: 'gemini',
      model: 'fake-small',
      promptVersion: 'test.v1',
      attempt: 1,
      status: 'SUCCEEDED',
      errorCode: null,
    });
    // Nothing but numbers and identifiers is stored.
    expect(JSON.stringify(entry)).not.toMatch(/Engineer|Extract the title|System prompt|AIzaSy/);
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const { call } = setup(['```json\n{"title":"A","years":1}\n```']);
    expect((await call()).data).toEqual({ title: 'A', years: 1 });
  });

  it('retries once with the validation problems and then succeeds', async () => {
    const { fake, generations, call } = setup([
      '{"title":"Engineer"}',
      '{"title":"Engineer","years":5}',
    ]);

    const result = await call();

    expect(result.data.years).toBe(5);
    expect(result.usage).toMatchObject({ attempts: 2, inputTokens: 200, outputTokens: 40 });
    expect(generations.entries.map((e) => [e.attempt, e.status])).toEqual([
      [1, 'INVALID_OUTPUT'],
      [2, 'SUCCEEDED'],
    ]);

    // The retry shows the model its answer and what was wrong.
    const retry = fake.requests[1]!;
    expect(retry.turns.map((turn) => turn.role)).toEqual(['user', 'model', 'user']);
    expect(JSON.stringify(retry.turns[2])).toContain('years');
  });

  it('gives up after two invalid answers', async () => {
    const { generations, call } = setup(['not json', '{"title":1}']);
    await expect(call()).rejects.toBeInstanceOf(AiInvalidOutputError);
    expect(generations.entries.map((e) => e.status)).toEqual(['INVALID_OUTPUT', 'INVALID_OUTPUT']);
  });

  it('records provider failures with their code and rethrows them', async () => {
    const { generations, call } = setup([new AiRateLimitedError()]);
    await expect(call()).rejects.toBeInstanceOf(AiRateLimitedError);
    expect(generations.entries[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'RATE_LIMITED',
      inputTokens: 0,
      costUsd: 0,
    });
  });

  it('falls back to the next model of the tier when one is retired or overloaded', async () => {
    const { fake, generations, call } = setup([
      new AiModelUnavailableError('fake-small', 'not found'),
      '{"title":"A","years":1}',
    ]);

    const result = await call();

    expect(result.usage.model).toBe('fake-small-fallback');
    expect(fake.requests.map((r) => r.model)).toEqual(['fake-small', 'fake-small-fallback']);
    expect(generations.entries.map((e) => [e.model, e.attempt, e.status, e.errorCode])).toEqual([
      ['fake-small', 1, 'FAILED', 'MODEL_UNAVAILABLE'],
      ['fake-small-fallback', 2, 'SUCCEEDED', null],
    ]);
  });

  it('reports the last model error when no model of the tier is available', async () => {
    const { call } = setup([
      new AiModelUnavailableError('fake-small', 'not found'),
      new AiModelUnavailableError('fake-small-fallback', 'overloaded'),
    ]);
    await expect(call()).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE',
      message: expect.stringContaining('fake-small-fallback'),
    });
  });

  it('does not switch models for errors that would fail on every model', async () => {
    const { fake, call } = setup([new AiRateLimitedError()]);
    await expect(call()).rejects.toBeInstanceOf(AiRateLimitedError);
    expect(fake.requests).toHaveLength(1);
  });

  it('fails clearly without a key or with a provider that has no adapter yet', async () => {
    const none = setup([], null);
    await expect(none.call()).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(none.client.isAvailable()).toBe(false);

    const claude = setup([], 'anthropic');
    await expect(claude.call()).rejects.toBeInstanceOf(AiProviderNotSupportedError);
    expect(claude.client.isAvailable()).toBe(false);

    expect(setup([]).client.isAvailable()).toBe(true);
    expect(none.generations.entries).toHaveLength(0);
  });
  it("uses the user's model first and keeps the defaults as fallbacks (RF-CONF-09)", async () => {
    const { fake, choices, call } = setup([
      new AiModelUnavailableError('chosen-model', 'not found'),
      '{"title":"Engineer","years":5}',
    ]);
    choices.useSource((provider) =>
      Promise.resolve(provider === 'gemini' ? { small: 'chosen-model' } : {}),
    );

    const { usage } = await call();

    expect(fake.requests.map((request) => request.model)).toEqual(['chosen-model', 'fake-small']);
    expect(usage.model).toBe('fake-small');
  });

  it('does not repeat a chosen model that is also a default', async () => {
    const { fake, choices, call } = setup([
      new AiModelUnavailableError('fake-small-fallback', 'overloaded'),
      new AiModelUnavailableError('fake-small', 'overloaded'),
    ]);
    choices.useSource(() => Promise.resolve({ small: 'fake-small-fallback' }));

    await expect(call()).rejects.toBeInstanceOf(AiModelUnavailableError);
    expect(fake.requests.map((request) => request.model)).toEqual([
      'fake-small-fallback',
      'fake-small',
    ]);
  });

  it('uses the defaults when the choice cannot be read', async () => {
    const { fake, choices, call } = setup(['{"title":"Engineer","years":5}']);
    choices.useSource(() => Promise.reject(new Error('database is locked')));

    await call();

    expect(fake.requests[0]!.model).toBe('fake-small');
  });
});
