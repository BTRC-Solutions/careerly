import {
  type Application,
  ApplicationListSchema,
  ApplicationSchema,
  JobAnalysisStateSchema,
  type JobPosting,
  JobPostingSchema,
  ResumeVersionListSchema,
  TailoringSessionViewSchema,
  type Tool,
} from '@careerly/contracts';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir, HAS_TYPST } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

/*
 * Job applications (roadmap 7.3, RF-APP-01, RF-APP-02, RF-APP-08), end to end: one per job description, created
 * saved or already sent with the finalized CVs of that job description, whose PDF is exactly the finalized one.
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
  requirements: [{ label: 'Node.js', kind: 'TOOL', importance: 'REQUIRED' }],
};
const NO_SCORES = { scores: [] };
const writing = (language: 'es' | 'en') => ({
  summary: language === 'es' ? 'Ingeniera backend.' : 'Backend engineer.',
  summarySources: ['W1'],
  experiences: [
    {
      experience: 'W1',
      bullets: [
        {
          text: language === 'es' ? 'Diseñé la API REST pública' : 'Designed the public REST API',
          sources: ['A1'],
        },
      ],
    },
  ],
});

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

function startFakeGemini(replies: Reply[]) {
  const server = http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      const reply = replies.shift() ?? { status: 503, body: { error: { code: 503 } } };
      response.writeHead(reply.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  return new Promise<{ url: string; close(): Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
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

/** Today in the local time zone (YYYY-MM-DD), as the API fills it in. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

describe('job applications (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>> | undefined;
  let server: RunningServer | undefined;

  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
    server = temp = gemini = undefined;
  });

  async function start(replies: Reply[] = []) {
    temp = createTempDir();
    gemini = await startFakeGemini(replies);
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_GEMINI_BASE_URL: gemini.url,
        CAREERLY_JOB_RETRY_BASE_MS: '20',
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
  const posting = async (title: string): Promise<JobPosting> =>
    JobPostingSchema.parse(
      await json('POST', '/job-postings', { text: `${title}. Node.js…`, title, company: 'Acme' }),
    );
  const create = async (body: unknown): Promise<Application> => {
    const response = await api('POST', '/applications', body);
    expect(response.status).toBe(201);
    return ApplicationSchema.parse(await response.json());
  };

  /** A job description with a finalized session that has a CV in each language. */
  async function finalizedPosting() {
    const { items } = await json<{ items: Tool[] }>('GET', '/tools?query=Node.js');
    const position = await json<{ id: string }>('POST', '/profile/positions', {
      company: 'Initech',
      title: 'Backend Engineer',
      startDate: '2019-03',
      toolIds: [],
    });
    await api('POST', `/profile/positions/${position.id}/achievements`, {
      text: 'Designed the public REST API.',
      toolIds: [items[0]!.id],
    });
    await api('PATCH', '/profile/personal-info', { firstNames: 'Ana', lastNames: 'García' });
    const jd = await posting('Senior Backend Engineer');
    await api('POST', `/job-postings/${jd.id}/analyze`);
    await waitFor(async () => {
      const state = JobAnalysisStateSchema.parse(
        await json('GET', `/job-postings/${jd.id}/analysis`),
      );
      return state.job?.status === 'SUCCEEDED';
    });
    const view = async (id: string) =>
      TailoringSessionViewSchema.parse(await json('GET', `/tailoring-sessions/${id}`));
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: jd.id, languages: ['es', 'en'] }),
    );
    await waitFor(async () => (await view(session.id)).session.status === 'MATCHED');
    await api('POST', `/tailoring-sessions/${session.id}/generate`);
    await waitFor(async () => (await view(session.id)).session.status === 'REVIEW');
    expect((await api('POST', `/tailoring-sessions/${session.id}/finalize`, {})).status).toBe(200);
    const { versions } = ResumeVersionListSchema.parse(
      await json('GET', `/tailoring-sessions/${session.id}/resume-versions`),
    );
    return { jd, sessionId: session.id, versions };
  }

  it('keeps one application per job description, saved until it is sent', async () => {
    await start();
    const jd = await posting('Data Engineer');

    const saved = await create({ jobPostingId: jd.id });
    expect(saved).toMatchObject({
      jobPostingId: jd.id,
      status: 'SAVED',
      appliedAt: null,
      sentWithoutCareerlyCv: false,
      sentResumes: [],
    });
    // One per job description.
    expect((await api('POST', '/applications', { jobPostingId: jd.id })).status).toBe(409);
    expect((await api('POST', '/applications', { jobPostingId: 'unknown' })).status).toBe(404);

    // Listed with its job, and found by its job description.
    const all = ApplicationListSchema.parse(await json('GET', '/applications')).applications;
    expect(all).toEqual([
      expect.objectContaining({ id: saved.id, title: 'Data Engineer', company: 'Acme' }),
    ]);
    const other = await posting('Other');
    expect(
      ApplicationListSchema.parse(await json('GET', `/applications?jobPostingId=${other.id}`))
        .applications,
    ).toEqual([]);

    // Sending needs a CV or the confirmation that it went without one.
    expect(
      (await api('POST', `/applications/${saved.id}/sent-resumes`, { resumeVersionIds: [] }))
        .status,
    ).toBe(400);
    const sent = ApplicationSchema.parse(
      await json('POST', `/applications/${saved.id}/sent-resumes`, {
        resumeVersionIds: [],
        sentWithoutCareerlyCv: true,
        sentAt: '2026-11-10',
      }),
    );
    expect(sent).toMatchObject({
      status: 'APPLIED',
      appliedAt: '2026-11-10',
      sentWithoutCareerlyCv: true,
    });
    expect(ApplicationSchema.parse(await json('GET', `/applications/${saved.id}`))).toEqual(sent);

    // The job description cannot be deleted while it has an application.
    const blocked = await api('DELETE', `/job-postings/${jd.id}`);
    expect(blocked.status).toBe(409);
    expect((await api('GET', `/job-postings/${jd.id}`)).status).toBe(200);
    expect((await api('DELETE', `/applications/${saved.id}`)).status).toBe(204);
    expect((await api('GET', `/applications/${saved.id}`)).status).toBe(404);
    expect((await api('DELETE', `/job-postings/${jd.id}`)).status).toBe(204);
  });

  it.runIf(HAS_TYPST)(
    'sends finalized CVs of its job description and serves exactly their PDF (RF-APP-08)',
    async () => {
      await start([ok(JD_ANALYSIS), ok(NO_SCORES), ok(writing('es')), ok(writing('en'))]);
      const { jd, sessionId, versions } = await finalizedPosting();
      const [es, en] = versions;

      const sendable = ResumeVersionListSchema.parse(
        await json('GET', `/applications/sendable-resumes?jobPostingId=${jd.id}`),
      );
      expect(sendable.versions.map((v) => v.language)).toEqual(['es', 'en']);

      // Created already sent, with the Spanish CV.
      const created = await create({
        jobPostingId: jd.id,
        sent: { resumeVersionIds: [es!.id], sentAt: '2026-11-18' },
      });
      expect(created).toMatchObject({
        status: 'APPLIED',
        appliedAt: '2026-11-18',
        sentWithoutCareerlyCv: false,
        sentResumes: [
          {
            resumeVersionId: es!.id,
            sessionId,
            language: 'es',
            fileName: es!.fileName,
            sentAt: '2026-11-18',
          },
        ],
      });

      // The English one goes later: it is added with today's date, and the application keeps its own.
      const later = ApplicationSchema.parse(
        await json('POST', `/applications/${created.id}/sent-resumes`, {
          resumeVersionIds: [en!.id, es!.id],
        }),
      );
      expect(later.status).toBe('APPLIED');
      expect(later.appliedAt).toBe('2026-11-18');
      expect(later.sentResumes.map((s) => [s.language, s.sentAt])).toEqual([
        ['es', '2026-11-18'],
        ['en', today()],
      ]);

      // From the application, exactly the PDF that was finalized.
      for (const sent of later.sentResumes) {
        const response = await api('GET', `/resume-versions/${sent.resumeVersionId}/pdf`);
        const file = path.join(temp!.dir, 'files', 'snapshots', sent.resumeVersionId, 'cv.pdf');
        expect(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(file))).toBe(true);
      }

      // Only finalized CVs of its own job description.
      expect(
        (
          await api('POST', `/applications/${created.id}/sent-resumes`, {
            resumeVersionIds: ['not-a-version'],
          })
        ).status,
      ).toBe(400);
      const other = await posting('Other job');
      const otherApplication = await create({ jobPostingId: other.id });
      expect(
        (
          await api('POST', `/applications/${otherApplication.id}/sent-resumes`, {
            resumeVersionIds: [es!.id],
          })
        ).status,
      ).toBe(400);
    },
  );
});
