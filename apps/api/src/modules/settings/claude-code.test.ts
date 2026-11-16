import fs from 'node:fs';
import path from 'node:path';
import { ClaudeCodeStatusSchema } from '@careerly/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

const CONTROL_TOKEN = 'control-token-for-the-tests';
const FAKE_CLAUDE = path.resolve(import.meta.dirname, '../../test-support/fake-claude.mjs');

interface Call {
  args: string[];
  stdin: string;
  cwd: string;
  files: string[];
  anthropicEnv: string[];
}

describe('Claude Code with the subscription (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let server: RunningServer | undefined;
  let scenarioFile: string;

  async function start(scenario: Record<string, unknown>) {
    temp = createTempDir();
    scenarioFile = path.join(temp.dir, 'scenario.json');
    fs.writeFileSync(scenarioFile, JSON.stringify(scenario));
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_CLAUDE_CODE_COMMAND: JSON.stringify([process.execPath, FAKE_CLAUDE, scenarioFile]),
      }),
    );
  }

  const scenario = (changes: Record<string, unknown>) =>
    fs.writeFileSync(
      scenarioFile,
      JSON.stringify({ ...JSON.parse(fs.readFileSync(scenarioFile, 'utf8')), ...changes }),
    );
  const calls = (): Call[] =>
    fs.existsSync(`${scenarioFile}.calls.jsonl`)
      ? fs
          .readFileSync(`${scenarioFile}.calls.jsonl`, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as Call)
      : [];
  const api = (method: string, route: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${server!.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const setEnabled = async (enabled: boolean) =>
    ClaudeCodeStatusSchema.parse(
      await (await api('PUT', '/settings/claude-code', { enabled })).json(),
    );
  const smoke = async () =>
    (await (
      await fetch(`http://127.0.0.1:${server!.port}/internal/ai/smoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).json()) as { status: string; provider: string | null; model: string | null };

  afterEach(async () => {
    await server?.close();
    temp?.cleanup();
    server = temp = undefined;
  });

  it('cannot be turned on until Claude Code is signed in', async () => {
    await start({ loggedIn: false });

    const status = ClaudeCodeStatusSchema.parse(
      await (await api('GET', '/settings/claude-code')).json(),
    );
    expect(status).toEqual({
      enabled: false,
      ready: false,
      problem: 'NOT_LOGGED_IN',
      version: '9.9.9',
      authMethod: 'none',
    });
    expect(await setEnabled(true)).toMatchObject({ enabled: false, problem: 'NOT_LOGGED_IN' });

    scenario({ loggedIn: true });
    expect(await setEnabled(true)).toMatchObject({
      enabled: true,
      ready: true,
      problem: null,
      authMethod: 'claude.ai',
    });
  });

  it('answers AI calls through a locked-down Claude Code, without any API key in its environment', async () => {
    await start({ loggedIn: true, answer: { ok: true, greeting: 'hola' } });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-must-not-reach-claude-code';
    try {
      // Without the switch there is no key: AI is not configured.
      expect((await smoke()).status).toBe('NOT_CONFIGURED');

      await setEnabled(true);
      expect(await smoke()).toMatchObject({
        status: 'OK',
        provider: 'claude-code',
        model: 'claude-haiku-5-5',
      });
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }

    const [call] = calls();
    const flag = (name: string) => call!.args[call!.args.indexOf(name) + 1];
    expect(call!.args).toContain('-p');
    expect(flag('--output-format')).toBe('json');
    expect(flag('--model')).toBe('claude-haiku-5-5');
    expect(flag('--tools')).toBe('');
    expect(flag('--permission-mode')).toBe('dontAsk');
    expect(flag('--setting-sources')).toBe('');
    expect(call!.args).toEqual(
      expect.arrayContaining(['--strict-mcp-config', '--no-session-persistence']),
    );
    expect(JSON.parse(flag('--json-schema')!)).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
    expect(call!.anthropicEnv).toEqual([]);
    // The working folder is a temporary one, removed afterwards.
    expect(fs.existsSync(call!.cwd)).toBe(false);

    // Off again: back to the API key (none here).
    await setEnabled(false);
    expect((await smoke()).status).toBe('NOT_CONFIGURED');
  });

  it('reads a PDF CV only from its working folder', async () => {
    await start({
      loggedIn: true,
      answer: {
        personalInfo: {
          firstNames: 'Lucía',
          lastNames: 'Fernández',
          headline: null,
          location: null,
          email: null,
          phone: null,
          summary: null,
          links: [],
        },
        positions: [],
        projects: [],
        education: [],
        certifications: [],
        languages: [],
      },
    });
    await setEnabled(true);

    const form = new FormData();
    form.append('file', new Blob([Buffer.from('%PDF-1.7\n% fake CV\n%%EOF')]), 'cv.pdf');
    const response = await fetch(`http://127.0.0.1:${server!.port}/profile/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      body: form,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ personalInfo: { firstNames: 'Lucía' } });

    const [call] = calls();
    expect(call!.files).toEqual(['document-1.pdf']);
    expect(call!.args[call!.args.indexOf('--tools') + 1]).toBe('Read');
    expect(call!.args[call!.args.indexOf('--allowedTools') + 1]).toBe('Read(./**)');
    expect(call!.stdin).toContain('./document-1.pdf');
  });

  it('explains a plan without quota as a rate limit', async () => {
    await start({ loggedIn: true, error: 'Claude AI usage limit reached. Try again later.' });
    await setEnabled(true);
    expect((await smoke()).status).toBe('RATE_LIMITED');
  });
});
