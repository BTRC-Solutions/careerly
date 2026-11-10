import {
  CreateToolResponseSchema,
  SearchToolsResponseSchema,
  ToolSchema,
} from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

describe('tools API (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer | undefined;

  async function start() {
    server = await startTestServer(testConfig(temp.dir));
  }
  async function stop() {
    await server?.close();
    server = undefined;
  }

  function call(method: 'GET' | 'POST', path: string, body?: unknown) {
    return fetch(`http://127.0.0.1:${server!.port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function search(query: string, limit?: number) {
    const params = new URLSearchParams({ query });
    if (limit) params.set('limit', String(limit));
    const response = await call('GET', `/tools?${params}`);
    expect(response.status).toBe(200);
    return SearchToolsResponseSchema.parse(await response.json()).items;
  }

  beforeEach(async () => {
    temp = createTempDir();
    await start();
  });
  afterEach(async () => {
    await stop();
    temp.cleanup();
  });

  it('GET /tools?query=postgres returns PostgreSQL first (roadmap 2.1)', async () => {
    const [first] = await search('postgres');
    expect(first).toMatchObject({ id: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' });
    expect(first?.isCustom).toBe(false);
    expect(first?.aliases).toContain('Postgres');
  });

  it.each([
    ['k8s', 'Kubernetes'],
    ['node js', 'Node.js'],
    ['NODEJS', 'Node.js'],
    ['golang', 'Go'],
    ['c#', 'C#'],
    ['c++', 'C++'],
    ['c', 'C'],
    ['react', 'React'],
    ['ts', 'TypeScript'],
  ])('resolves "%s" to %s as the best match', async (query, expected) => {
    const [first] = await search(query);
    expect(first?.name).toBe(expected);
  });

  it('ranks exact matches before prefixes and substrings', async () => {
    const names = (await search('react')).map((tool) => tool.name);
    expect(names[0]).toBe('React');
    expect(names).toContain('React Native');
    expect(names.indexOf('React Native')).toBeGreaterThan(0);
  });

  it('respects the limit and lists alphabetically without a query', async () => {
    expect(await search('a', 3)).toHaveLength(3);

    const response = await call('GET', '/tools?limit=5');
    const items = SearchToolsResponseSchema.parse(await response.json()).items;
    const names = items.map((tool) => tool.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    );
  });

  it('returns nothing for a query made only of separators', async () => {
    expect(await search(' .- ')).toEqual([]);
  });

  it('rejects an invalid limit', async () => {
    const response = await call('GET', '/tools?limit=500');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('GET /tools/:id returns a tool or 404', async () => {
    const found = await call('GET', '/tools/kubernetes');
    expect(ToolSchema.parse(await found.json()).name).toBe('Kubernetes');

    const missing = await call('GET', '/tools/does-not-exist');
    expect(missing.status).toBe(404);
  });

  it('POST /tools creates a user tool that persists across restarts', async () => {
    const response = await call('POST', '/tools', { name: '  Acme   Builder ', category: 'TOOL' });
    expect(response.status).toBe(201);
    const { tool, created } = CreateToolResponseSchema.parse(await response.json());
    expect(created).toBe(true);
    expect(tool).toMatchObject({ name: 'Acme Builder', category: 'TOOL', isCustom: true });

    await stop();
    await start();

    const [first] = await search('acme-builder');
    expect(first?.id).toBe(tool.id);
  });

  it('POST /tools returns the existing tool instead of a duplicate', async () => {
    const response = await call('POST', '/tools', { name: 'postgres' });
    expect(response.status).toBe(200);
    const { tool, created } = CreateToolResponseSchema.parse(await response.json());
    expect(created).toBe(false);
    expect(tool.id).toBe('postgresql');
  });

  it.each([
    ['a name without letters or digits', { name: '...' }],
    ['an empty name', { name: '   ' }],
    ['an unknown category', { name: 'Thing', category: 'MAGIC' }],
    ['unknown keys', { name: 'Thing', isCustom: false }],
  ])('POST /tools rejects %s', async (_case, body) => {
    const response = await call('POST', '/tools', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});
