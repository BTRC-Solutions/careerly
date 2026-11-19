import {
  JobAnalysisStateSchema,
  JobPostingSchema,
  TailoringSessionListSchema,
  TailoringSessionViewSchema,
} from '@careerly/contracts';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

/*
 * Resuming tailoring sessions (roadmap 6.8, RF-TAIL-15): closing the app in the middle of a step and opening it
 * again leaves the session where it was, and the step that was running goes on by itself. Also listing the
 * open sessions to find them again, and abandoning one.
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
  requirements: [{ label: 'Designing REST APIs', kind: 'SKILL', importance: 'REQUIRED' }],
};
const EVIDENCE_ANSWER = {
  matches: [{ requirement: 'R1', status: 'COVERED', evidence: ['A1'] }],
};

/** `null` holds the call without answering, like a provider that is still thinking when the app closes. */
type Reply = { status: number; body: unknown } | null;

const ok = (answer: unknown): Reply => ({
  status: 200,
  body: {
    candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200 },
  },
});

function startFakeGemini(replies: Reply[]) {
  const held: http.ServerResponse[] = [];
  const server = http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      const reply = replies.shift();
      if (reply === null) {
        held.push(response);
        return;
      }
      const { status, body } = reply ?? { status: 503, body: { error: { code: 503 } } };
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    });
  });
  return new Promise<{
    url: string;
    held: http.ServerResponse[];
    close(): Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        held,
        close: () => {
          for (const response of held) response.destroy();
          server.closeAllConnections();
          return new Promise((done) => server.close(() => done()));
        },
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

describe('resuming tailoring sessions (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>> | undefined;
  let server: RunningServer | undefined;

  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
    server = temp = gemini = undefined;
  });

  /** Opens the app on the same data folder; the key comes from the desktop shell on every start. */
  async function open() {
    server = await startTestServer(
      testConfig(temp!.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_GEMINI_BASE_URL: gemini!.url,
        // A resumed job can run before the key arrives and is retried (2 attempts are left): the delay leaves
        // the key time to come even on a slow machine, as the default 2 s does in the app.
        CAREERLY_JOB_RETRY_BASE_MS: '500',
      }),
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
  const view = async (id: string) =>
    TailoringSessionViewSchema.parse(await json('GET', `/tailoring-sessions/${id}`));
  const list = async (query: string) =>
    TailoringSessionListSchema.parse(await json('GET', `/tailoring-sessions?${query}`)).sessions;

  async function analyzedPosting() {
    const position = await json<{ id: string }>('POST', '/profile/positions', {
      company: 'Acme',
      title: 'Backend Engineer',
      startDate: '2019-03',
    });
    await api('POST', `/profile/positions/${position.id}/achievements`, {
      text: 'Designed the public REST API used by 40 partners.',
    });
    const posting = JobPostingSchema.parse(
      await json('POST', '/job-postings', { text: 'Senior Backend Engineer. REST APIs.' }),
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

  it('closing the app while matching and opening it again finishes the match', async () => {
    const replies: Reply[] = [ok(JD_ANALYSIS), null];
    temp = createTempDir();
    gemini = await startFakeGemini(replies);
    await open();
    const posting = await analyzedPosting();
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
    );
    // The provider got the match call and has not answered when the app closes.
    await waitFor(async () => gemini!.held.length === 1);
    expect((await view(session.id)).session.status).toBe('ANALYZING');
    const closing = server!.close();
    setTimeout(() => gemini!.held.forEach((response) => response.destroy()), 50);
    await closing;

    replies.push(ok(EVIDENCE_ANSWER));
    await open();

    // The session is still there, open, and its match goes on by itself.
    expect((await list('open=true')).map((s) => [s.id, s.jobPostingId])).toEqual([
      [session.id, posting.id],
    ]);
    const done = await waitFor(async () => {
      const current = await view(session.id);
      return current.session.status === 'MATCHED' && current;
    });
    expect(done.session.match!.requirements.map((r) => [r.label, r.status])).toEqual([
      ['Designing REST APIs', 'COVERED'],
    ]);
  });

  it('lists the open sessions, newest first, and an abandoned one is no longer open', async () => {
    temp = createTempDir();
    gemini = await startFakeGemini([ok({ ...JD_ANALYSIS, requirements: [] })]);
    await open();
    const posting = await analyzedPosting();
    const startSession = async () => {
      const { session } = TailoringSessionViewSchema.parse(
        await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
      );
      await waitFor(async () => (await view(session.id)).session.status === 'MATCHED');
      return session.id;
    };
    const first = await startSession();
    const second = await startSession();

    expect((await list('open=true')).map((s) => s.id)).toEqual([second, first]);

    const abandoned = await api('POST', `/tailoring-sessions/${first}/abandon`);
    expect(abandoned.status).toBe(200);
    expect((await view(first)).session.status).toBe('ABANDONED');
    expect((await list('open=true')).map((s) => s.id)).toEqual([second]);
    // Still stored: listing a posting's sessions shows it.
    expect((await list(`jobPostingId=${posting.id}`)).map((s) => [s.id, s.status])).toEqual([
      [first, 'ABANDONED'],
      [second, 'MATCHED'],
    ]);

    expect((await api('POST', `/tailoring-sessions/${first}/abandon`)).status).toBe(409);
    expect((await api('POST', '/tailoring-sessions/nope/abandon')).status).toBe(404);
    expect((await api('GET', '/tailoring-sessions?open=maybe')).status).toBe(400);
  });
});
