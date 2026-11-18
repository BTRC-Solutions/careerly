import {
  JobAnalysisStateSchema,
  JobPostingSchema,
  TailoredResumeSchema,
  TailoredResumesViewSchema,
  type Tool,
  type TailoringSessionView,
  TailoringSessionViewSchema,
} from '@careerly/contracts';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempDir, HAS_TYPST } from '../../test-support/temp-dir.js';
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

/** What the writer answers for a language: a valid bullet, an invented source and an unknown experience. */
const writing = (language: 'es' | 'en') => ({
  summary:
    language === 'es' ? 'Ingeniero backend con APIs públicas.' : 'Backend engineer of public APIs.',
  summarySources: ['W1', 'A1', 'Z9'],
  experiences: [
    {
      experience: '[W1] Backend Engineer at Acme',
      bullets: [
        {
          text:
            language === 'es'
              ? 'Diseñé la API REST pública que usan 40 partners'
              : 'Designed the public REST API used by 40 partners',
          sources: ['[A1] Designed the public REST API'],
        },
        { text: 'Led a team of 30 engineers', sources: ['A99'] },
      ],
    },
    { experience: 'P7', bullets: [{ text: 'Invented project', sources: ['A1'] }] },
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

  const generated = (id: string) => () =>
    view(id).then(
      (current): TailoringSessionView | false =>
        current.session.status !== 'GENERATING' &&
        current.job?.status !== 'RUNNING' &&
        current.job?.status !== 'PENDING' &&
        current,
    );
  const resumesOf = async (id: string) =>
    TailoredResumesViewSchema.parse(await json('GET', `/tailoring-sessions/${id}/resumes`)).resumes;

  /** A session whose only requirement (Node.js) the profile covers: no gaps, it can generate right away. */
  async function matchedWithoutGaps(languages: ('es' | 'en')[]) {
    await createProfile();
    await api('PATCH', '/profile/personal-info', { firstNames: 'Ana', lastNames: 'García' });
    const posting = await analyzedPosting();
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id, languages }),
    );
    const matched = await waitFor(settled(session.id));
    expect(matched.session.status).toBe('MATCHED');
    return session.id;
  }

  const NODE_ONLY = { ...JD_ANALYSIS, requirements: JD_ANALYSIS.requirements.slice(0, 1) };

  // Generating fits the CV to its pages by rendering it with Typst (CI always has it).
  it.runIf(HAS_TYPST)(
    'writes one CV per language with sources from the profile (RF-TAIL-10, RF-TAIL-11)',
    async () => {
      await start([ok(NODE_ONLY), ok(writing('es')), ok(writing('en'))]);
      const id = await matchedWithoutGaps(['es', 'en']);
      const profile = await json<{ positions: { id: string; achievements: { id: string }[] }[] }>(
        'GET',
        '/profile',
      );
      const position = profile.positions[0]!;
      const achievement = position.achievements[0]!;

      // Nothing to read yet.
      expect(await resumesOf(id)).toEqual([]);
      expect((await api('GET', `/tailoring-sessions/${id}/resumes/es/preview`)).status).toBe(404);

      const response = await api('POST', `/tailoring-sessions/${id}/generate`);
      expect(response.status).toBe(200);
      const started = TailoringSessionViewSchema.parse(await response.json());
      expect(started.session.status).toBe('GENERATING');
      expect(started.job?.type).toBe('tailoring-generate');

      const done = await waitFor(generated(id));
      expect(done.session.status).toBe('REVIEW');
      expect(done.job).toMatchObject({ type: 'tailoring-generate', status: 'SUCCEEDED' });

      const resumes = await resumesOf(id);
      expect(resumes.map((r) => [r.language, r.promptVersion])).toEqual([
        ['es', 'resume-writing.v2'],
        ['en', 'resume-writing.v2'],
      ]);
      const [es, en] = resumes;
      // The invented source, the unknown experience and the summary's unknown reference are dropped.
      expect(es!.data.summary).toEqual({
        text: 'Ingeniero backend con APIs públicas.',
        sourceIds: [position.id, achievement.id],
      });
      expect(es!.data.experiences).toEqual([
        {
          kind: 'POSITION',
          sourceId: position.id,
          bullets: [
            {
              id: expect.any(String),
              text: 'Diseñé la API REST pública que usan 40 partners',
              sourceIds: [achievement.id],
              score: null,
              editedByUser: false,
              inclusion: 'AUTO',
            },
          ],
        },
      ]);
      expect(en!.data.experiences[0]!.bullets.map((b) => b.text)).toEqual([
        'Designed the public REST API used by 40 partners',
      ]);
      // Skills: the tool the job description asks for first (Node.js), then Docker.
      const [node, docker] = [await tool('Node.js'), await tool('Docker')];
      expect(es!.data.toolIds).toEqual([node.id, docker.id]);

      // One call per language, the profile first and the job description as untrusted data.
      expect(gemini!.calls).toHaveLength(3);
      const [, toSpanish, toEnglish] = gemini!.calls;
      expect(toSpanish).toMatch(/^Master profile of the candidate:/);
      expect(toSpanish).toMatch(/\[A1\] Designed the public REST API/);
      expect(toSpanish).toMatch(
        /<untrusted source="job-description-analysis">[\s\S]*- \[COVERED\] \(TOOL, REQUIRED\) Node\.js/,
      );
      expect(toSpanish).toMatch(/Output language: Spanish\./);
      expect(toEnglish).toMatch(/Output language: English\./);
      // Neither the profile nor what was written is logged.
      expect(logs.output()).not.toContain('Designed the public REST API');
      expect(logs.output()).not.toContain('Diseñé');

      // Fitted to one page: everything fits, nothing left out.
      expect(es!.data.fit).toMatchObject({ pageCount: 1, pageBudget: 1, fits: true, log: [] });
      const pdf = await api('GET', `/tailoring-sessions/${id}/resumes/en/preview`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      const document = await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()));
      expect(document.getPageCount()).toBe(1);
      expect((await api('GET', `/tailoring-sessions/${id}/resumes/fr/preview`)).status).toBe(400);
    },
  );

  // Generating fits the CV to its pages by rendering it with Typst (CI always has it).
  it.runIf(HAS_TYPST)(
    'rewrites once what breaks the truthfulness guard and drops what still does (RN-02)',
    async () => {
      const invented = {
        summary: 'Backend engineer.',
        summarySources: ['W1'],
        experiences: [
          {
            experience: 'W1',
            bullets: [
              // Kubernetes is in the catalog but not in the profile; 12 is in no source.
              { text: 'Designed the public REST API on Kubernetes', sources: ['A1'] },
              { text: 'Led 12 engineers building the API', sources: ['A1'] },
              { text: 'Designed the public REST API used by 40 partners', sources: ['A1'] },
            ],
          },
        ],
      };
      const rewrites = {
        rewrites: [
          { item: '[B1]', text: 'Designed the public REST API in Node.js', sources: ['A1'] },
          { item: 'B2', text: 'Led 10 engineers building the API', sources: ['A1'] },
        ],
      };
      await start([ok(NODE_ONLY), ok(invented), ok(rewrites)]);
      const id = await matchedWithoutGaps(['en']);

      await api('POST', `/tailoring-sessions/${id}/generate`);
      const done = await waitFor(generated(id));
      expect(done.session.status).toBe('REVIEW');

      const [resume] = await resumesOf(id);
      expect(resume!.data.experiences[0]!.bullets.map((b) => b.text)).toEqual([
        'Designed the public REST API in Node.js',
        'Designed the public REST API used by 40 partners',
      ]);
      expect(resume!.data.guard).toEqual({
        rewritten: 1,
        dropped: [
          {
            kind: 'BULLET',
            experienceId: expect.any(String),
            text: 'Led 10 engineers building the API',
            reasons: ['NUMBER_NOT_IN_SOURCES'],
          },
        ],
      });

      // Only the texts with issues went back, as untrusted data, with what broke the rules.
      expect(gemini!.calls).toHaveLength(3);
      const rewriteCall = gemini!.calls[2]!;
      expect(rewriteCall).toMatch(/^Master profile of the candidate:/);
      expect(rewriteCall).toMatch(
        /<untrusted source="cv-texts">\n\[B1\] A bullet of \[W1\], citing \[A1\]\n {2}Text: Designed the public REST API on Kubernetes\n {2}Problems: it mentions Kubernetes, which its sources do not show\./,
      );
      expect(rewriteCall).toMatch(
        /Problems: it has the number\(s\) 12, which its sources do not have\./,
      );
      expect(rewriteCall.split('<untrusted source="cv-texts">')[1]).not.toMatch(/40 partners/);
      expect(logs.output()).not.toContain('Kubernetes');
    },
  );

  // Generating fits the CV to its pages by rendering it with Typst (CI always has it).
  it.runIf(HAS_TYPST)(
    'fails the generation when the key is rejected, and writes again on retry',
    async () => {
      const replies = [ok(NODE_ONLY)];
      await start(replies);
      const id = await matchedWithoutGaps(['en']);

      await api('POST', `/tailoring-sessions/${id}/generate`);
      const failed = await waitFor(generated(id));
      expect(failed.session).toMatchObject({ status: 'FAILED', failedStep: 'GENERATING' });
      expect(failed.job).toMatchObject({ type: 'tailoring-generate', lastError: 'KEY_REJECTED' });
      expect(await resumesOf(id)).toEqual([]);

      replies.push(ok(writing('en')));
      expect((await api('POST', `/tailoring-sessions/${id}/retry`)).status).toBe(200);
      const done = await waitFor(generated(id));
      expect(done.session).toMatchObject({ status: 'REVIEW', failedStep: null });
      expect((await resumesOf(id)).map((r) => r.language)).toEqual(['en']);
    },
  );

  it.runIf(HAS_TYPST)(
    'fits a long CV to the page budget, leaving out the least relevant bullets (RN-04)',
    async () => {
      const replies = [ok(NODE_ONLY)];
      await start(replies);
      await api('PATCH', '/profile/personal-info', { firstNames: 'Ana', lastNames: 'García' });
      const node = await tool('Node.js');
      // Four recent positions with one achievement each; the writer gives each six long bullets.
      for (const [index, year] of [2022, 2019, 2017, 2016].entries()) {
        const position = await json<{ id: string }>('POST', '/profile/positions', {
          company: `Company ${index + 1}`,
          title: 'Backend Engineer',
          startDate: `${year}-01`,
          endDate: index === 0 ? null : `${year + 2}-12`,
          toolIds: [node.id],
        });
        await api('POST', `/profile/positions/${position.id}/achievements`, {
          text: 'Designed and maintained the services that handle payments, reviews and onboarding.',
          toolIds: [node.id],
        });
      }
      const long = (n: number) =>
        `Bullet ${'abcdefghij'[n]}: designed and maintained the services that handle payments, reviews and ` +
        'onboarding for the whole company, working with product, design and support on every release ' +
        'and keeping the services documented, monitored and easy to change for the next team.';
      const writingLong = {
        summary: 'Backend engineer.',
        summarySources: ['W1'],
        experiences: [1, 2, 3, 4].map((w) => ({
          experience: `W${w}`,
          bullets: [0, 1, 2, 3, 4, 5].map((n) => ({ text: long(n), sources: [`A${w}`] })),
        })),
      };
      replies.push(ok(writingLong));
      const posting = await analyzedPosting();
      const { session } = TailoringSessionViewSchema.parse(
        await json('POST', '/tailoring-sessions', {
          jobPostingId: posting.id,
          languages: ['en'],
          pageBudget: 1,
        }),
      );
      await waitFor(settled(session.id));
      await api('POST', `/tailoring-sessions/${session.id}/generate`);
      const done = await waitFor(generated(session.id));
      expect(done.session.status).toBe('REVIEW');

      const [resume] = await resumesOf(session.id);
      const fit = resume!.data.fit!;
      expect(fit).toMatchObject({ pageCount: 1, pageBudget: 1, fits: true });
      // Every position is kept, the current one with the most bullets; the trimmed ones are logged.
      expect(fit.selection.positions).toHaveLength(4);
      const kept = fit.selection.positions.map((p) => p.bulletIds.length);
      expect(kept[0]).toBeGreaterThanOrEqual(Math.max(...kept.slice(1)));
      expect(kept.every((count) => count >= 1)).toBe(true);
      expect(fit.log.some((entry) => entry.reason === 'OVER_BUDGET')).toBe(true);
      expect(fit.log.some((entry) => entry.reason === 'SECTION_LIMIT')).toBe(true);
      // The first bullet of each position (the most relevant) stays.
      const firstIds = resume!.data.experiences.map((e) => e.bullets[0]!.id);
      expect(fit.selection.positions.flatMap((p) => p.bulletIds)).toEqual(
        expect.arrayContaining(firstIds),
      );

      const pdf = await api('GET', `/tailoring-sessions/${session.id}/resumes/en/preview`);
      const document = await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()));
      expect(document.getPageCount()).toBe(1);
    },
  );

  it.runIf(HAS_TYPST)(
    'edits a CV under review and fits it again quickly (RF-TAIL-12, RNF-08)',
    async () => {
      const twoBullets = {
        ...writing('en'),
        experiences: [
          {
            experience: 'W1',
            bullets: [
              { text: 'Designed the public REST API used by 40 partners', sources: ['A1'] },
              { text: 'Documented the public REST API for partners', sources: ['A1'] },
            ],
          },
        ],
      };
      await start([ok(NODE_ONLY), ok(twoBullets)]);
      const id = await matchedWithoutGaps(['en']);
      await api('POST', `/tailoring-sessions/${id}/generate`);
      await waitFor(generated(id));
      const [generatedResume] = await resumesOf(id);
      const [first, second] = generatedResume!.data.experiences[0]!.bullets;
      const patch = (body: unknown) => api('PATCH', `/tailoring-sessions/${id}/resumes/en`, body);

      // Editing a bullet and getting the new preview takes less than 2 s.
      const started = Date.now();
      const edited = await patch({
        op: 'EDIT_BULLET',
        bulletId: second!.id,
        text: 'Wrote the docs',
      });
      const preview = await api('GET', `/tailoring-sessions/${id}/resumes/en/preview`);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(edited.status).toBe(200);
      expect(preview.status).toBe(200);
      const afterEdit = TailoredResumeSchema.parse(await edited.json());
      expect(afterEdit.data.experiences[0]!.bullets[1]).toMatchObject({
        text: 'Wrote the docs',
        editedByUser: true,
        sourceIds: second!.sourceIds,
      });
      expect(afterEdit.data.fit).toMatchObject({ pageCount: 1, fits: true });

      // Moving and excluding change what the CV shows; the change is stored.
      const moved = TailoredResumeSchema.parse(
        await (await patch({ op: 'MOVE_BULLET', bulletId: second!.id, toIndex: 0 })).json(),
      );
      expect(moved.data.fit!.selection.positions[0]!.bulletIds).toEqual([second!.id, first!.id]);
      const excluded = TailoredResumeSchema.parse(
        await (
          await patch({ op: 'SET_INCLUSION', bulletId: first!.id, inclusion: 'EXCLUDED' })
        ).json(),
      );
      expect(excluded.data.fit!.selection.positions[0]!.bulletIds).toEqual([second!.id]);
      expect((await resumesOf(id))[0]).toEqual(excluded);

      expect((await patch({ op: 'EDIT_BULLET', bulletId: 'nope', text: 'x' })).status).toBe(404);
      expect((await patch({ op: 'EDIT_BULLET', bulletId: first!.id, text: ' ' })).status).toBe(400);
      expect((await patch({ op: 'RENAME' })).status).toBe(400);
      expect(
        (
          await api('PATCH', `/tailoring-sessions/${id}/resumes/es`, {
            op: 'EDIT_SUMMARY',
            text: '',
          })
        ).status,
      ).toBe(404);
    },
  );

  it.runIf(HAS_TYPST)(
    'regenerates one section with indications, keeping the user’s edits elsewhere (RF-TAIL-13)',
    async () => {
      const first = {
        ...writing('en'),
        experiences: [
          {
            experience: 'W1',
            bullets: [
              { text: 'Designed the public REST API used by 40 partners', sources: ['A1'] },
              { text: 'Documented the public REST API for partners', sources: ['A1'] },
            ],
          },
        ],
      };
      const again = {
        summary: '',
        summarySources: [],
        experiences: [
          { experience: 'W1', bullets: [{ text: 'Wrote the partner guides', sources: ['A1'] }] },
        ],
      };
      const summaryOnly = {
        summary: 'Engineer who documents what partners use.',
        summarySources: ['W1'],
        experiences: [],
      };
      const replies = [ok(NODE_ONLY), ok(first)];
      await start(replies);
      const id = await matchedWithoutGaps(['en']);
      await api('POST', `/tailoring-sessions/${id}/generate`);
      await waitFor(generated(id));
      const [generatedResume] = await resumesOf(id);
      const [, documented] = generatedResume!.data.experiences[0]!.bullets;
      const patch = (body: unknown) => api('PATCH', `/tailoring-sessions/${id}/resumes/en`, body);
      await patch({ op: 'EDIT_BULLET', bulletId: documented!.id, text: 'Documented the API' });
      await patch({ op: 'EDIT_SUMMARY', text: 'My own summary.' });
      const regenerate = (body: unknown) =>
        api('POST', `/tailoring-sessions/${id}/regenerate`, body);

      // One experience again, with indications: the edited summary and the edited bullet stay.
      replies.push(ok(again));
      const response = await regenerate({
        scope: { kind: 'EXPERIENCE', experienceId: generatedResume!.data.experiences[0]!.sourceId },
        instructions: '  More focus on documentation  ',
      });
      expect(response.status).toBe(200);
      expect(TailoringSessionViewSchema.parse(await response.json()).session).toMatchObject({
        status: 'GENERATING',
        regeneration: { instructions: 'More focus on documentation', languages: ['en'] },
      });
      const done = await waitFor(generated(id));
      expect(done.session).toMatchObject({ status: 'REVIEW', regeneration: null });

      let [resume] = await resumesOf(id);
      expect(resume!.data.summary!.text).toBe('My own summary.');
      expect(resume!.data.experiences[0]!.bullets.map((b) => [b.text, b.editedByUser])).toEqual([
        ['Documented the API', true],
        ['Wrote the partner guides', false],
      ]);
      expect(resume!.data.fit).toMatchObject({ fits: true });
      const call = gemini!.calls.at(-1)!;
      expect(call).toMatch(/Write only the bullets of \[W1\]\./);
      expect(call).toMatch(
        /Indications from the candidate for this version:\nMore focus on documentation$/,
      );
      expect(logs.output()).not.toContain('More focus on documentation');

      // Only the summary: the bullets stay as they are.
      replies.push(ok(summaryOnly));
      expect((await regenerate({ scope: { kind: 'SUMMARY' } })).status).toBe(200);
      await waitFor(generated(id));
      [resume] = await resumesOf(id);
      expect(resume!.data.summary!.text).toBe('Engineer who documents what partners use.');
      expect(resume!.data.experiences[0]!.bullets.map((b) => b.text)).toEqual([
        'Documented the API',
        'Wrote the partner guides',
      ]);
      expect(gemini!.calls.at(-1)).toMatch(/Write only the summary\./);

      expect(
        (await regenerate({ scope: { kind: 'EXPERIENCE', experienceId: 'nope' } })).status,
      ).toBe(400);
      expect((await regenerate({ scope: { kind: 'ALL' }, languages: ['es'] })).status).toBe(400);
      expect((await regenerate({ scope: { kind: 'EVERYTHING' } })).status).toBe(400);
    },
  );

  it('does not generate while there are gaps to answer', async () => {
    await start([ok(JD_ANALYSIS), ok(EVIDENCE_ANSWER)]);
    await createProfile();
    const posting = await analyzedPosting();
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
    );
    await waitFor(settled(session.id));
    expect((await api('POST', `/tailoring-sessions/${session.id}/generate`)).status).toBe(409);
    expect((await api('POST', '/tailoring-sessions/nope/generate')).status).toBe(404);
    // Only CVs under review can be edited.
    expect(
      (
        await api('PATCH', `/tailoring-sessions/${session.id}/resumes/en`, {
          op: 'EDIT_SUMMARY',
          text: '',
        })
      ).status,
    ).toBe(409);

    // Through the questions (skipping them all, until they can be answered), it can.
    const asking = await api('POST', `/tailoring-sessions/${session.id}/gaps`);
    expect(asking.status).toBe(200);
    expect(TailoringSessionViewSchema.parse(await asking.json()).session.status).toBe(
      'AWAITING_ANSWERS',
    );
    expect((await api('POST', `/tailoring-sessions/${session.id}/gaps`)).status).toBe(409);
    expect((await api('POST', `/tailoring-sessions/${session.id}/generate`)).status).toBe(200);
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
});
