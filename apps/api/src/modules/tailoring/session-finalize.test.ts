import {
  ApiErrorResponseSchema,
  JobAnalysisStateSchema,
  JobPostingSchema,
  ResumeVersionListSchema,
  TailoredResumesViewSchema,
  type TailoringSessionView,
  TailoringSessionViewSchema,
  type Tool,
} from '@careerly/contracts';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../platform/database/database.service.js';
import { createTempDir, HAS_TYPST } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';
import { ResumeVersionsService } from '../documents/index.js';
import { TailoredResumeRepository } from './application/tailoring.ports.js';

/*
 * Finalizing a tailoring session (roadmap 7.1, RF-TAIL-14, RNF-10, RN-13): one immutable CV per language with
 * its PDF, the template's data and a copy of the template, that nothing done to the profile afterwards changes.
 * A CV over the page budget needs the user's confirmation (RN-04).
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
  summary:
    language === 'es' ? 'Ingeniera backend con APIs públicas.' : 'Backend engineer of public APIs.',
  summarySources: ['W1', 'A1'],
  experiences: [
    {
      experience: 'W1',
      bullets: [
        {
          text:
            language === 'es'
              ? 'Diseñé la API REST pública que usan 40 partners'
              : 'Designed the public REST API used by 40 partners',
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

/** A fake Gemini that answers each call with the next reply of the list. */
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

// Finalizing renders the CVs with Typst (CI always has it).
describe.runIf(HAS_TYPST)('finalizing a tailoring session (integration)', () => {
  let temp: ReturnType<typeof createTempDir> | undefined;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>> | undefined;
  let server: RunningServer | undefined;

  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
    server = temp = gemini = undefined;
  });

  async function start(replies: Reply[]) {
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
  const view = async (id: string) =>
    TailoringSessionViewSchema.parse(await json('GET', `/tailoring-sessions/${id}`));
  const versionsOf = async (id: string) =>
    ResumeVersionListSchema.parse(await json('GET', `/tailoring-sessions/${id}/resume-versions`))
      .versions;
  const pdfOf = async (versionId: string) => {
    const response = await api('GET', `/resume-versions/${versionId}/pdf`);
    expect(response.status).toBe(200);
    return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  };

  /** A profile whose achievement covers Node.js, a job description asking only for it, and the CVs. */
  async function sessionInReview(languages: ('es' | 'en')[]) {
    const { items } = await json<{ items: Tool[] }>('GET', '/tools?query=Node.js');
    const position = await json<{ id: string }>('POST', '/profile/positions', {
      company: 'Acme',
      title: 'Backend Engineer',
      startDate: '2019-03',
      toolIds: [],
    });
    const achievement = await json<{ id: string }>(
      'POST',
      `/profile/positions/${position.id}/achievements`,
      { text: 'Designed the public REST API used by 40 partners.', toolIds: [items[0]!.id] },
    );
    await api('PATCH', '/profile/personal-info', { firstNames: 'Ana', lastNames: 'García' });

    const posting = JobPostingSchema.parse(
      await json('POST', '/job-postings', {
        text: 'Senior Backend Engineer. Node.js…',
        title: 'Senior Backend Engineer',
        company: 'Globex: Cloud/Data',
      }),
    );
    await api('POST', `/job-postings/${posting.id}/analyze`);
    await waitFor(async () => {
      const state = JobAnalysisStateSchema.parse(
        await json('GET', `/job-postings/${posting.id}/analysis`),
      );
      return state.job?.status === 'SUCCEEDED';
    });

    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id, languages }),
    );
    await waitFor(async () => (await view(session.id)).session.status === 'MATCHED');
    expect((await api('POST', `/tailoring-sessions/${session.id}/generate`)).status).toBe(200);
    const done = await waitFor(async () => {
      const current = await view(session.id);
      return current.session.status !== 'GENERATING' && current.job?.status === 'SUCCEEDED'
        ? current
        : false;
    });
    expect(done.session.status).toBe('REVIEW');
    return { id: session.id, position, achievement };
  }

  it('freezes every CV, and editing the profile afterwards changes neither them nor their PDFs', async () => {
    await start([ok(JD_ANALYSIS), ok(NO_SCORES), ok(writing('es')), ok(writing('en'))]);
    const { id, position, achievement } = await sessionInReview(['es', 'en']);
    expect(await versionsOf(id)).toEqual([]);

    const response = await api('POST', `/tailoring-sessions/${id}/finalize`, {});
    expect(response.status).toBe(200);
    const finalized: TailoringSessionView = TailoringSessionViewSchema.parse(await response.json());
    expect(finalized.session.status).toBe('FINALIZED');

    // One version per language, in the session's order.
    const versions = await versionsOf(id);
    expect(versions).toEqual([
      expect.objectContaining({
        sessionId: id,
        language: 'es',
        templateId: 'classic',
        templateName: 'Clásica',
        templateVersion: 1,
        pageCount: 1,
        pageBudget: 1,
        // Characters a file name cannot have become spaces.
        fileName: 'Ana García - Senior Backend Engineer - Globex Cloud Data (ES).pdf',
      }),
      expect.objectContaining({
        language: 'en',
        fileName: 'Ana García - Senior Backend Engineer - Globex Cloud Data (EN).pdf',
      }),
    ]);
    const [es, en] = versions;

    // The PDF, what the template received and a copy of the template, in the version's folder.
    const folder = path.join(temp!.dir, 'files', 'snapshots', es!.id);
    expect(fs.readdirSync(folder).sort()).toEqual(['cv.pdf', 'data.json', 'template.typ']);
    const before = await pdfOf(es!.id);
    expect(before.headers.get('content-type')).toBe('application/pdf');
    expect(before.headers.get('content-disposition')).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent(es!.fileName)}`,
    );
    expect(before.bytes.equals(fs.readFileSync(path.join(folder, 'cv.pdf')))).toBe(true);
    expect((await PDFDocument.load(before.bytes)).getPageCount()).toBe(1);
    const stored = await server!.app.get(ResumeVersionsService).find(es!.id);
    expect(stored.data.document).toMatchObject({
      language: 'es',
      basics: { name: 'Ana García' },
      experience: [
        {
          company: 'Acme',
          bullets: ['Diseñé la API REST pública que usan 40 partners'],
        },
      ],
      labels: { present: expect.any(String) },
    });
    // The sources of every bullet are kept (RF-TAIL-11).
    expect(stored.data.sources.experiences[0]!.bullets[0]).toMatchObject({
      sourceIds: [achievement.id],
      editedByUser: false,
    });

    // The profile changes and its position goes away (RN-13).
    await api('PATCH', '/profile/personal-info', { firstNames: 'María', lastNames: 'López' });
    await api('PATCH', `/profile/achievements/${achievement.id}`, {
      text: 'Something else entirely.',
    });
    expect((await api('DELETE', `/profile/positions/${position.id}`)).status).toBe(204);

    expect(await versionsOf(id)).toEqual(versions);
    expect((await pdfOf(es!.id)).bytes.equals(before.bytes)).toBe(true);
    expect(await server!.app.get(ResumeVersionsService).find(es!.id)).toEqual(stored);
    expect((await pdfOf(en!.id)).bytes.length).toBeGreaterThan(0);

    // Freezing again returns the same versions instead of new ones.
    expect(await server!.app.get(ResumeVersionsService).finalize(id, 'classic', [])).toEqual(
      versions,
    );
    // The session no longer changes, and the database refuses to change a version.
    expect((await api('POST', `/tailoring-sessions/${id}/finalize`, {})).status).toBe(409);
    expect(
      (
        await api('PATCH', `/tailoring-sessions/${id}/resumes/es`, {
          op: 'EDIT_SUMMARY',
          text: 'Nuevo resumen.',
        })
      ).status,
    ).toBe(409);
    const db = server!.app.get(DatabaseService).connection;
    expect(() => db.prepare('UPDATE resume_versions SET page_count = 2').run()).toThrow(
      /immutable/,
    );
    expect((await api('GET', '/resume-versions/unknown/pdf')).status).toBe(404);
  });

  it('asks for confirmation before finalizing a CV over the page budget (RN-04)', async () => {
    await start([ok(JD_ANALYSIS), ok(NO_SCORES), ok(writing('en'))]);
    const { id } = await sessionInReview(['en']);

    // Even the shortest CV did not fit (forced here: a real one needs a lot of content).
    const resumes = server!.app.get(TailoredResumeRepository);
    const [resume] = TailoredResumesViewSchema.parse(
      await json('GET', `/tailoring-sessions/${id}/resumes`),
    ).resumes;
    await resumes.save({
      ...resume!,
      data: { ...resume!.data, fit: { ...resume!.data.fit!, fits: false } },
    });

    const refused = await api('POST', `/tailoring-sessions/${id}/finalize`, {});
    expect(refused.status).toBe(409);
    expect(ApiErrorResponseSchema.parse(await refused.json()).error.code).toBe(
      'RESUME_OVER_BUDGET',
    );
    expect((await view(id)).session.status).toBe('REVIEW');
    expect(await versionsOf(id)).toEqual([]);

    const confirmed = await api('POST', `/tailoring-sessions/${id}/finalize`, {
      confirmOverBudget: true,
    });
    expect(confirmed.status).toBe(200);
    expect(await versionsOf(id)).toHaveLength(1);
  });

  it('finalizes only a session under review', async () => {
    await start([ok(JD_ANALYSIS)]);
    const posting = JobPostingSchema.parse(
      await json('POST', '/job-postings', { text: 'Backend Engineer. Node.js…' }),
    );
    await api('POST', `/job-postings/${posting.id}/analyze`);
    await waitFor(async () => {
      const state = JobAnalysisStateSchema.parse(
        await json('GET', `/job-postings/${posting.id}/analysis`),
      );
      return state.job?.status === 'SUCCEEDED';
    });
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
    );
    await waitFor(async () => (await view(session.id)).session.status === 'MATCHED');

    expect((await api('POST', `/tailoring-sessions/${session.id}/finalize`, {})).status).toBe(409);
    expect(await versionsOf(session.id)).toEqual([]);
    expect((await api('POST', '/tailoring-sessions/unknown/finalize', {})).status).toBe(404);
  });
});
