import {
  GapQuestionsSchema,
  type Profile,
  JobAnalysisStateSchema,
  JobPostingSchema,
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

    // One question per partial or missing requirement, required ones first, without calling the AI again.
    const { questions } = GapQuestionsSchema.parse(
      await json('GET', `/tailoring-sessions/${started.session.id}/gaps`),
    );
    expect(questions.map((q) => [q.label, q.gap, q.importance, q.relatedEvidence])).toEqual([
      ['Postgres', 'MISSING', 'REQUIRED', []],
      ['Docker', 'PARTIAL', 'REQUIRED', [{ kind: 'POSITION', id: profile.position.id }]],
      ['FooBarDB', 'MISSING', 'NICE_TO_HAVE', []],
    ]);
    expect(gemini!.calls).toHaveLength(2);
    expect((await api('GET', '/tailoring-sessions/nope/gaps')).status).toBe(404);
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
    // Without a match there is nothing to ask yet.
    expect((await api('GET', `/tailoring-sessions/${session.id}/gaps`)).status).toBe(409);

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

  it('writes one CV per language with sources from the profile (RF-TAIL-10, RF-TAIL-11)', async () => {
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
      ['es', 'resume-writing.v1'],
      ['en', 'resume-writing.v1'],
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

    if (HAS_TYPST) {
      const pdf = await api('GET', `/tailoring-sessions/${id}/resumes/en/preview`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toBe('application/pdf');
      const document = await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()));
      expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
    }
    expect((await api('GET', `/tailoring-sessions/${id}/resumes/fr/preview`)).status).toBe(400);
  });

  it('fails the generation when the key is rejected, and writes again on retry', async () => {
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
  });

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

    // Through the questions (even leaving them unanswered), it can.
    expect((await api('POST', `/tailoring-sessions/${session.id}/ask-gaps`)).status).toBe(200);
    expect(
      TailoringSessionViewSchema.parse(await json('GET', `/tailoring-sessions/${session.id}`))
        .session.status,
    ).toBe('AWAITING_ANSWERS');
    expect((await api('POST', `/tailoring-sessions/${session.id}/ask-gaps`)).status).toBe(409);
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

  it('stores the gap questions when asked and their answers, in any order', async () => {
    await start([ok(JD_ANALYSIS), ok(EVIDENCE_ANSWER)]);
    const profile = await createProfile();
    const posting = await analyzedPosting();
    const { session } = TailoringSessionViewSchema.parse(
      await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
    );
    await waitFor(settled(session.id));
    const route = `/tailoring-sessions/${session.id}`;
    const gaps = async () => GapQuestionsSchema.parse(await json('GET', `${route}/gaps`)).questions;

    // Answering needs the questions to be asked first.
    expect((await api('PUT', `${route}/gaps/x`, { answer: 'NOT_USED' })).status).toBe(409);
    const asked = GapQuestionsSchema.parse(await json('POST', `${route}/ask-gaps`)).questions;
    expect(asked.map((q) => [q.label, q.answer])).toEqual([
      ['Postgres', null],
      ['Docker', null],
      ['FooBarDB', null],
    ]);
    expect((await view(session.id)).session.status).toBe('AWAITING_ANSWERS');
    const [postgres, docker, foobar] = asked;

    // In any order; an answer can change.
    const put = (requirementId: string, body: unknown) =>
      api('PUT', `${route}/gaps/${requirementId}`, body).then((r) => r.status);
    expect(await put(foobar!.requirementId, { answer: 'SKIPPED' })).toBe(200);
    expect(
      await put(postgres!.requirementId, {
        answer: 'USED_AT_WORK',
        positionIds: [profile.position.id],
        detail: 'Tuned the queries of the billing service.',
      }),
    ).toBe(200);
    expect(await put(foobar!.requirementId, { answer: 'NOT_USED' })).toBe(200);
    expect(
      await put(docker!.requirementId, {
        answer: 'USED_ELSEWHERE',
        project: { name: 'Homelab', kind: 'PERSONAL' },
        detail: 'Ran my services in containers.',
        includeInResume: false,
      }),
    ).toBe(200);

    const answered = await gaps();
    expect(answered.map((q) => q.answer?.answer)).toEqual([
      'USED_AT_WORK',
      'USED_ELSEWHERE',
      'NOT_USED',
    ]);
    expect(answered.every((q) => q.answeredAt !== null)).toBe(true);

    // Answers must point to the profile, and to a question of this session.
    expect(
      await put(postgres!.requirementId, {
        answer: 'USED_AT_WORK',
        positionIds: ['nope'],
        detail: 'x',
      }),
    ).toBe(400);
    expect(await put(postgres!.requirementId, { answer: 'USED_AT_WORK' })).toBe(400);
    expect(await put('not-a-question', { answer: 'NOT_USED' })).toBe(404);

    // A "No" is not written to the profile (RN-11): it lives only in the session.
    const profileAfter = JSON.stringify(await json('GET', '/profile'));
    expect(profileAfter).not.toContain('FooBarDB');
    expect((await gaps())[2]!.answer).toEqual({ answer: 'NOT_USED' });
  });

  it('adds affirmative answers to the profile and the match, and a "no" only to the session', async () => {
    // Two sessions on the same job description: the second one is matched without new AI answers needed.
    await start([ok(JD_ANALYSIS), ok(EVIDENCE_ANSWER), ok(EVIDENCE_ANSWER)]);
    const profile = await createProfile();
    const posting = await analyzedPosting();
    const startSession = async () => {
      const { session } = TailoringSessionViewSchema.parse(
        await json('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
      );
      await waitFor(settled(session.id));
      return session.id;
    };
    const id = await startSession();
    const asked = GapQuestionsSchema.parse(
      await json('POST', `/tailoring-sessions/${id}/ask-gaps`),
    ).questions;
    const byLabel = (label: string) => asked.find((q) => q.label === label)!;
    const answer = (label: string, body: unknown) =>
      json('PUT', `/tailoring-sessions/${id}/gaps/${byLabel(label).requirementId}`, body).then(
        (gaps) => GapQuestionsSchema.parse(gaps).questions.find((q) => q.label === label)!,
      );
    const getProfile = () => json<Profile>('GET', '/profile');
    const statusOf = async (label: string) =>
      (await view(id)).session.match!.requirements.find((r) => r.label === label)!;

    // Yes, at work: an achievement with the catalog tool, from this session.
    const postgres = await answer('Postgres', {
      answer: 'USED_AT_WORK',
      positionIds: [profile.position.id],
      detail: 'Tuned the queries of the billing service.',
    });
    expect(postgres.created).toHaveLength(1);
    const added = (await getProfile()).positions[0]!.achievements.find(
      (a) => a.id === postgres.created[0]!.id,
    )!;
    expect(added).toMatchObject({
      text: 'Tuned the queries of the billing service.',
      origin: 'GAP_ANSWER',
      originSessionId: id,
      tools: [{ name: 'PostgreSQL' }],
    });
    // The match follows (RF-GAP-05).
    expect(await statusOf('Postgres')).toMatchObject({
      status: 'COVERED',
      evidence: [{ kind: 'ACHIEVEMENT', id: added.id }],
    });

    // Yes, in a new project: the project and its achievement.
    const docker = await answer('Docker', {
      answer: 'USED_ELSEWHERE',
      project: { name: 'Homelab', kind: 'PERSONAL' },
      detail: 'Ran my services in containers.',
      includeInResume: true,
    });
    expect(docker.created.map((c) => c.kind)).toEqual(['PROJECT', 'ACHIEVEMENT']);
    expect((await getProfile()).projects.map((p) => p.name)).toEqual(['Homelab']);

    // Changing an answer to "no" undoes what it added, and the requirement is a gap again.
    const before = JSON.stringify(await getProfile());
    const changed = await answer('Docker', { answer: 'NOT_USED' });
    expect(changed.created).toEqual([]);
    expect((await getProfile()).projects).toEqual([]);
    expect(JSON.stringify(await getProfile())).not.toEqual(before);
    expect(await statusOf('Docker')).toMatchObject({
      status: 'PARTIAL',
      evidence: [{ kind: 'POSITION', id: profile.position.id }],
    });

    // A "no" creates nothing in the profile (RN-11)…
    const profileBeforeNo = await getProfile();
    await answer('FooBarDB', { answer: 'NOT_USED' });
    expect(await getProfile()).toEqual(profileBeforeNo);

    // …and the same requirement is asked again in another session (RN-12).
    const next = await startSession();
    const askedAgain = GapQuestionsSchema.parse(
      await json('POST', `/tailoring-sessions/${next}/ask-gaps`),
    ).questions;
    expect(askedAgain.map((q) => [q.label, q.answer])).toEqual([
      ['Docker', null],
      ['FooBarDB', null],
    ]);
  });
});
