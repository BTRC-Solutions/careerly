import {
  JobAnalysisStateSchema,
  JobPostingSchema,
  type Tool,
  type TailoringSessionView,
  TailoringSessionViewSchema,
} from '@careerly/contracts';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  capturingLogger,
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

/*
 * Tailoring session up to the match, end to end (roadmap 5.2, RF-TAIL-01, RF-TAIL-02): a real profile and
 * job description, catalog tools matched without AI, the rest through a fake Gemini, and the evidence checked
 * against the profile.
 */

const CONTROL_TOKEN = 'control-token-only-main-knows';
const KEY = 'AIzaSyFakeGeminiKey_0123456789';

const JD_ANALYSIS = {
  language: 'en',
  roleCategory: 'backend',
  seniority: 'senior',
  workMode: 'remote',
  country: null,
  yearsOfExperience: 5,
  keywords: ['backend'],
  requirements: [
    { label: 'Node.js', kind: 'TOOL', importance: 'REQUIRED' },
    { label: 'Postgres', kind: 'TOOL', importance: 'REQUIRED' },
    { label: 'Docker', kind: 'TOOL', importance: 'REQUIRED' },
    { label: 'FooBarDB', kind: 'TOOL', importance: 'NICE_TO_HAVE' },
    { label: 'Designing REST APIs', kind: 'SKILL', importance: 'REQUIRED' },
    { label: 'English (advanced)', kind: 'LANGUAGE', importance: 'REQUIRED' },
  ],
};

/** References as the matcher numbers them: the AI gets FooBarDB, the skill and English, in that order. */
const EVIDENCE_ANSWER = {
  matches: [
    { requirement: 'R1', status: 'MISSING', evidence: [] },
    // References followed by text (as Claude writes them) are read; an invented one is dropped.
    {
      requirement: '[R2] Designing REST APIs',
      status: 'COVERED',
      evidence: ['[A1] Designed the public REST API', 'A99'],
    },
    { requirement: '[R3]', status: 'COVERED', evidence: ['[L1]'] },
    { requirement: 'R9', status: 'COVERED', evidence: ['W1'] },
  ],
};

interface Reply {
  status: number;
  body: unknown;
}

const ok = (answer: unknown): Reply => ({
  status: 200,
  body: {
    candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200 },
  },
});
const rejectedKey: Reply = {
  status: 403,
  body: { error: { code: 403, message: 'API key not valid.', status: 'PERMISSION_DENIED' } },
};

/** A fake Gemini that answers each call with the next reply of the list. */
function startFakeGemini(replies: Reply[]) {
  const calls: string[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const body = JSON.parse(raw) as { contents: { parts: { text?: string }[] }[] };
      calls.push(body.contents[0]!.parts.map((part) => part.text ?? '').join('\n'));
      const reply = replies.shift() ?? rejectedKey;
      response.writeHead(reply.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  return new Promise<{ url: string; calls: string[]; close(): Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function waitFor<T>(check: () => Promise<T | undefined | false>, timeoutMs = 8000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for a condition.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('tailoring session match (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>> | undefined;
  let server: RunningServer | undefined;
  let logs: ReturnType<typeof capturingLogger>;

  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
    server = undefined;
    gemini = undefined;
    temp = undefined;
  });

  async function start(replies: Reply[]) {
    temp = createTempDir();
    gemini = await startFakeGemini(replies);
    logs = capturingLogger();
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_GEMINI_BASE_URL: gemini.url,
        CAREERLY_JOB_RETRY_BASE_MS: '20',
      }),
      logs.logger,
    );
    await fetch(`http://127.0.0.1:${server.port}/internal/ai-credentials`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: { provider: 'gemini', apiKey: KEY } }),
    });
  }

  const api = (method: string, route: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${server!.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async <T>(method: string, route: string, body?: unknown) =>
    (await (await api(method, route, body)).json()) as T;

  async function tool(name: string): Promise<Tool> {
    const { items } = await json<{ items: Tool[] }>(
      'GET',
      `/tools?query=${encodeURIComponent(name)}`,
    );
    return items[0]!;
  }

  /** One position with Docker listed and an achievement with Node.js, and advanced English. */
  async function createProfile() {
    const [node, docker] = [await tool('Node.js'), await tool('Docker')];
    const position = await json<{ id: string }>('POST', '/profile/positions', {
      company: 'Acme',
      title: 'Backend Engineer',
      startDate: '2019-03',
      toolIds: [docker.id],
    });
    const achievement = await json<{ id: string }>(
      'POST',
      `/profile/positions/${position.id}/achievements`,
      { text: 'Designed the public REST API used by 40 partners.', toolIds: [node.id] },
    );
    const english = await json<{ id: string }>('POST', '/profile/languages', {
      language: 'English',
      level: 'C1',
    });
    return { position, achievement, english };
  }

  async function analyzedPosting() {
    const posting = JobPostingSchema.parse(
      await json('POST', '/job-postings', { text: 'Senior Backend Engineer. Node.js, Postgres…' }),
    );
    await api('POST', `/job-postings/${posting.id}/analyze`);
    await waitFor(async () => {
      const state = JobAnalysisStateSchema.parse(
        await json('GET', `/job-postings/${posting.id}/analysis`),
      );
      return state.job?.status === 'SUCCEEDED';
    });
    return posting;
  }

  const view = async (id: string) =>
    TailoringSessionViewSchema.parse(await json('GET', `/tailoring-sessions/${id}`));
  const settled = (id: string) => () =>
    view(id).then(
      (current): TailoringSessionView | false =>
        current.session.status !== 'ANALYZING' && current.job?.status !== 'RUNNING' && current,
    );

  it('matches tools by catalog and the rest with the AI, with evidence that exists', async () => {
    await start([ok(JD_ANALYSIS), ok(EVIDENCE_ANSWER)]);
    const profile = await createProfile();
    const posting = await analyzedPosting();

    const response = await api('POST', '/tailoring-sessions', { jobPostingId: posting.id });
    expect(response.status).toBe(201);
    const started = TailoringSessionViewSchema.parse(await response.json());
    expect(started.session).toMatchObject({
      status: 'ANALYZING',
      languages: ['en'],
      pageBudget: 1,
      templateId: 'classic',
      match: null,
    });
    expect(started.job?.type).toBe('tailoring-match');

    const done = await waitFor(settled(started.session.id));
    expect(done.session.status).toBe('MATCHED');
    expect(done.job).toMatchObject({ status: 'SUCCEEDED', attempts: 1 });
    expect(done.session.match).toMatchObject({ promptVersion: 'evidence-match.v1' });
    expect(
      done.session.match!.requirements.map((r) => [r.label, r.status, r.method, r.evidence]),
    ).toEqual([
      ['Node.js', 'COVERED', 'TOOLS', [{ kind: 'ACHIEVEMENT', id: profile.achievement.id }]],
      // The alias was resolved when the job description was analyzed.
      ['Postgres', 'MISSING', 'TOOLS', []],
      ['Docker', 'PARTIAL', 'TOOLS', [{ kind: 'POSITION', id: profile.position.id }]],
      ['FooBarDB', 'MISSING', 'AI', []],
      [
        'Designing REST APIs',
        'COVERED',
        'AI',
        [{ kind: 'ACHIEVEMENT', id: profile.achievement.id }],
      ],
      ['English (advanced)', 'COVERED', 'AI', [{ kind: 'LANGUAGE', id: profile.english.id }]],
    ]);

    // Only what the catalog cannot decide went to the AI, as untrusted data after the profile.
    const sent = gemini!.calls[1]!;
    expect(sent).toMatch(/\[W1\] Backend Engineer at Acme \(2019-03 – present\)\. Tools: Docker\./);
    expect(sent).toMatch(/\[A1\] Designed the public REST API/);
    expect(sent).toMatch(
      /<untrusted source="job-requirements">\n\[R1\] \(TOOL, NICE_TO_HAVE\) FooBarDB\n\[R2\] \(SKILL, REQUIRED\) Designing REST APIs\n\[R3\] \(LANGUAGE, REQUIRED\) English \(advanced\)\n<\/untrusted>/,
    );
    expect(sent).not.toMatch(/\) Node\.js|\) Postgres|\) Docker/);
    // Neither the profile nor the requirements are logged.
    expect(logs.output()).not.toContain('Designed the public REST API');
    expect(logs.output()).not.toContain('FooBarDB');

    // The session is stored: reading it again gives the same result.
    expect((await view(started.session.id)).session).toEqual(done.session);
  });

  it('does not call the AI when the catalog decides every requirement', async () => {
    await start([ok({ ...JD_ANALYSIS, requirements: JD_ANALYSIS.requirements.slice(0, 3) })]);
    await createProfile();
    const posting = await analyzedPosting();

    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', {
        jobPostingId: posting.id,
        languages: ['es', 'en'],
        pageBudget: 2,
      }),
    );
    const done = await waitFor(settled(session.id));
    expect(done.session).toMatchObject({
      status: 'MATCHED',
      languages: ['es', 'en'],
      pageBudget: 2,
      match: { promptVersion: null, model: null },
    });
    expect(done.session.match!.requirements.map((r) => r.status)).toEqual([
      'COVERED',
      'MISSING',
      'PARTIAL',
    ]);
    expect(gemini!.calls).toHaveLength(1);
  });

  it('fails the session when the key is rejected, and matches again on retry', async () => {
    // After the analysis, every call is rejected until a new answer is added.
    const replies = [ok(JD_ANALYSIS)];
    await start(replies);
    await createProfile();
    const posting = await analyzedPosting();
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
    );

    const failed = await waitFor(settled(session.id));
    expect(failed.session).toMatchObject({
      status: 'FAILED',
      failedStep: 'ANALYZING',
      match: null,
    });
    expect(failed.job).toMatchObject({ status: 'FAILED', attempts: 1, lastError: 'KEY_REJECTED' });

    replies.push(ok(EVIDENCE_ANSWER));
    const retry = await api('POST', `/tailoring-sessions/${session.id}/retry`);
    expect(retry.status).toBe(200);
    const done = await waitFor(settled(session.id));
    expect(done.session).toMatchObject({ status: 'MATCHED', failedStep: null });
    expect(done.session.match!.requirements).toHaveLength(6);

    // A matched session cannot be retried.
    expect((await api('POST', `/tailoring-sessions/${session.id}/retry`)).status).toBe(409);
  });

  it('needs an analyzed job description', async () => {
    await start([]);
    const posting = JobPostingSchema.parse(
      await json('POST', '/job-postings', { text: 'Backend Engineer' }),
    );
    expect((await api('POST', '/tailoring-sessions', { jobPostingId: posting.id })).status).toBe(
      409,
    );
    expect((await api('POST', '/tailoring-sessions', { jobPostingId: 'nope' })).status).toBe(404);
    expect(
      (await api('POST', '/tailoring-sessions', { jobPostingId: posting.id, languages: [] }))
        .status,
    ).toBe(400);
    expect((await api('GET', '/tailoring-sessions/nope')).status).toBe(404);
  });

  it('picks the page budget from the years of experience and changes the options later', async () => {
    await start([ok({ ...JD_ANALYSIS, requirements: JD_ANALYSIS.requirements.slice(0, 3) })]);
    // Since 2010: more than 8 years, so 2 pages by default (RF-TAIL-08).
    await json('POST', '/profile/positions', {
      company: 'Old Co',
      title: 'Developer',
      startDate: '2010-01',
      endDate: '2018-12',
    });
    const posting = await analyzedPosting();
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
    );
    expect(session).toMatchObject({ languages: ['en'], pageBudget: 2, templateId: 'classic' });
    await waitFor(settled(session.id));

    const changed = await api('PATCH', `/tailoring-sessions/${session.id}/options`, {
      languages: ['es', 'en'],
      pageBudget: 1,
    });
    expect(changed.status).toBe(200);
    expect((await view(session.id)).session).toMatchObject({
      status: 'MATCHED',
      languages: ['es', 'en'],
      pageBudget: 1,
      templateId: 'classic',
    });

    const patch = (body: unknown) =>
      api('PATCH', `/tailoring-sessions/${session.id}/options`, body).then((r) => r.status);
    expect(await patch({ templateId: 'nope' })).toBe(400);
    expect(await patch({ languages: ['es', 'es'] })).toBe(400);
    expect(await patch({})).toBe(400);
    expect((await api('PATCH', '/tailoring-sessions/nope/options', { pageBudget: 2 })).status).toBe(
      404,
    );
    expect(
      (await api('POST', '/tailoring-sessions', { jobPostingId: posting.id, templateId: 'nope' }))
        .status,
    ).toBe(400);
  });
});
