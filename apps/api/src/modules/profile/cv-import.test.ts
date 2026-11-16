import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import {
  ConfirmCvImportResponseSchema,
  CvImportDraftSchema,
  ProfileSchema,
} from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../platform/database/database.service.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  capturingLogger,
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

const CONTROL_TOKEN = 'control-token-for-the-tests';
const KEY = 'AIzaSyFakeGeminiKey_0123456789';
const DOCX = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../test-support/fixtures/cv-sample.docx'),
);
const PDF = Buffer.from('%PDF-1.7\n% fake CV for the tests\n%%EOF');

/** What the fake model "reads" from the CV. */
const EXTRACTION = {
  personalInfo: {
    firstNames: 'Lucía',
    lastNames: 'Fernández Gómez',
    headline: 'Backend Developer',
    location: 'Rosario, Argentina',
    email: 'lucia@example.com',
    phone: null,
    summary: null,
    links: [{ kind: 'GITHUB', url: 'https://github.com/lucia', label: null }],
  },
  positions: [
    {
      company: 'Acme Payments',
      title: 'Backend Developer',
      location: null,
      workMode: null,
      startDate: '2021-03',
      endDate: null,
      context: null,
      tools: ['Go', 'postgres'],
      achievements: [
        {
          text: 'Built the settlement service in Go and PostgreSQL, processing 2M transactions per day.',
          metrics: '2M transactions per day',
          tools: ['Go', 'PostgreSQL'],
        },
        {
          text: 'Cut p95 latency by 40% with Redis caching.',
          metrics: '-40% p95',
          tools: ['Redis'],
        },
      ],
    },
  ],
  projects: [
    {
      name: 'ledger-cli',
      kind: 'OPEN_SOURCE',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      tools: ['MadeUpInternalTool'],
      achievements: [],
    },
  ],
  education: [
    {
      institution: 'Universidad Nacional de Rosario',
      title: 'Ingeniería en Sistemas',
      kind: 'DEGREE',
      field: null,
      startDate: '2014-01',
      endDate: '2020-01',
      description: null,
    },
  ],
  certifications: [],
  languages: [
    { language: 'Spanish', level: 'NATIVE', notes: null },
    { language: 'English', level: 'C1', notes: null },
  ],
};

interface GeminiCall {
  parts: { text?: string; inlineData?: { mimeType: string } }[];
}

function startFakeGemini(reply: { status: number; body: unknown }) {
  const calls: GeminiCall[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const body = JSON.parse(raw) as { contents: GeminiCall[] };
      calls.push(body.contents[0]!);
      response.writeHead(reply.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  return new Promise<{ url: string; calls: GeminiCall[]; close(): Promise<void> }>((resolve) => {
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

const geminiAnswer = (json: unknown) => ({
  status: 200,
  body: {
    candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 400 },
  },
});

describe('CV import (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let gemini: Awaited<ReturnType<typeof startFakeGemini>>;
  let server: RunningServer;
  let logs: ReturnType<typeof capturingLogger>;

  async function start(reply = geminiAnswer(EXTRACTION), withKey = true) {
    temp = createTempDir();
    gemini = await startFakeGemini(reply);
    logs = capturingLogger();
    server = await startTestServer(
      testConfig(temp.dir, {
        CAREERLY_CONTROL_TOKEN: CONTROL_TOKEN,
        CAREERLY_GEMINI_BASE_URL: gemini.url,
      }),
      logs.logger,
    );
    if (withKey) {
      await fetch(`http://127.0.0.1:${server.port}/internal/ai-credentials`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: { provider: 'gemini', apiKey: KEY } }),
      });
    }
  }

  function upload(file: Buffer | null, name = 'cv.pdf') {
    const form = new FormData();
    if (file) form.append('file', new Blob([new Uint8Array(file)]), name);
    return fetch(`http://127.0.0.1:${server.port}/profile/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      body: form,
    });
  }

  const api = (method: string, route: string, body?: unknown) =>
    fetch(`http://127.0.0.1:${server.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const profile = async () => ProfileSchema.parse(await (await api('GET', '/profile')).json());

  beforeEach(() => {
    temp = undefined as unknown as typeof temp;
  });
  afterEach(async () => {
    await server?.close();
    await gemini?.close();
    temp?.cleanup();
  });

  it('turns a PDF into a draft with resolved tools and saves nothing', async () => {
    await start();

    const response = await upload(PDF);
    expect(response.status).toBe(200);
    const draft = CvImportDraftSchema.parse(await response.json());

    // The PDF goes to the model as a document.
    expect(
      gemini.calls[0]!.parts.some((part) => part.inlineData?.mimeType === 'application/pdf'),
    ).toBe(true);

    expect(draft.personalInfo).toMatchObject({ firstNames: 'Lucía', lastNames: 'Fernández Gómez' });
    const position = draft.positions[0]!;
    expect(position.tools).toEqual([
      { name: 'Go', toolId: 'go', toolName: 'Go' },
      { name: 'postgres', toolId: 'postgresql', toolName: 'PostgreSQL' },
    ]);
    expect(position.achievements[1]!.tools).toEqual([
      { name: 'Redis', toolId: 'redis', toolName: 'Redis' },
    ]);
    expect(draft.projects[0]!.tools).toEqual([
      { name: 'MadeUpInternalTool', toolId: null, toolName: null },
    ]);

    const saved = await profile();
    expect(saved.positions).toEqual([]);
    expect(saved.personalInfo.firstNames).toBeNull();
  });

  it('reads a DOCX locally and sends its text marked as untrusted', async () => {
    await start();
    expect((await upload(DOCX, 'cv.docx')).status).toBe(200);

    const parts = gemini.calls[0]!.parts;
    expect(parts.some((part) => part.inlineData)).toBe(false);
    const cvText = parts.map((part) => part.text ?? '').join('\n');
    expect(cvText).toContain('<untrusted source="cv">');
    expect(cvText).toContain('Lucía Fernández Gómez');
    expect(cvText).toContain('Redis caching');
  });

  it('confirms the reviewed draft: everything is created with origin IMPORT, in CV order', async () => {
    await start();
    await api('PATCH', '/profile/personal-info', { phone: '+54 341 555-0000' });

    const response = await api('POST', '/profile/import/confirm', {
      personalInfo: {
        firstNames: 'Lucía',
        lastNames: 'Fernández Gómez',
        headline: 'Backend Developer',
      },
      positions: [
        {
          company: 'Acme Payments',
          title: 'Backend Developer',
          startDate: '2021-03',
          toolIds: ['go', 'postgresql'],
          achievements: [
            { text: 'Built the settlement service.', toolIds: ['go'] },
            { text: 'Cut p95 latency by 40%.', metrics: '-40% p95', toolIds: ['redis'] },
          ],
        },
      ],
      education: [
        {
          institution: 'Universidad Nacional de Rosario',
          title: 'Ingeniería en Sistemas',
          startDate: '2014-01',
          endDate: '2020-01',
        },
      ],
      languages: [{ language: 'English', level: 'C1' }],
    });

    expect(response.status).toBe(200);
    expect(ConfirmCvImportResponseSchema.parse(await response.json())).toEqual({
      personalInfoUpdated: true,
      positions: 1,
      achievements: 2,
      projects: 0,
      education: 1,
      certifications: 0,
      languages: 1,
    });

    const saved = await profile();
    // Personal info: imported fields replace, the rest is kept.
    expect(saved.personalInfo).toMatchObject({
      firstNames: 'Lucía',
      headline: 'Backend Developer',
      phone: '+54 341 555-0000',
    });
    const position = saved.positions[0]!;
    expect(position).toMatchObject({ company: 'Acme Payments', origin: 'IMPORT' });
    expect(position.tools.map((tool) => tool.id)).toEqual(['go', 'postgresql']);
    expect(position.achievements.map((a) => [a.text, a.origin])).toEqual([
      ['Built the settlement service.', 'IMPORT'],
      ['Cut p95 latency by 40%.', 'IMPORT'],
    ]);
    expect(saved.education[0]!.origin).toBe('IMPORT');
    expect(saved.languages[0]!.origin).toBe('IMPORT');
  });

  it('saves nothing when any part of the confirmation is invalid', async () => {
    await start();
    const position = { company: 'A', title: 'B', startDate: '2020-01' };

    const unknownTool = await api('POST', '/profile/import/confirm', {
      positions: [position, { ...position, toolIds: ['not-a-tool'] }],
    });
    expect(unknownTool.status).toBe(400);

    const badDates = await api('POST', '/profile/import/confirm', {
      positions: [position, { ...position, startDate: '2021-01', endDate: '2020-01' }],
    });
    expect(badDates.status).toBe(400);
    expect(await badDates.text()).toContain('positions.1');

    expect((await profile()).positions).toEqual([]);
  });

  it('rejects missing, unknown and oversized files', async () => {
    await start();
    expect((await upload(null)).status).toBe(400);
    expect((await upload(Buffer.from('just some text'), 'cv.txt')).status).toBe(400);
    const tooBig = await upload(Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]));
    expect(tooBig.status).toBe(413);
    expect(gemini.calls).toHaveLength(0);
  });

  it('explains AI problems with specific codes', async () => {
    await start(geminiAnswer(EXTRACTION), false);
    const notConfigured = await upload(PDF);
    expect(notConfigured.status).toBe(409);
    expect(await notConfigured.json()).toMatchObject({ error: { code: 'AI_NOT_CONFIGURED' } });
    await server.close();
    await gemini.close();
    temp.cleanup();

    await start({
      status: 400,
      body: { error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } },
    });
    const rejected = await upload(PDF);
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({ error: { code: 'AI_KEY_REJECTED' } });
  });

  it('never stores or logs the CV content', async () => {
    await start();
    await upload(DOCX, 'cv.docx');

    const usage = server.app
      .get(DatabaseService)
      .connection.prepare('SELECT * FROM ai_generations')
      .all();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ task: 'cv-import', prompt_version: 'cv-import.v1' });

    const everything = JSON.stringify(usage) + logs.output();
    for (const secret of ['Lucía', 'Acme', 'settlement', 'lucia@example.com', KEY]) {
      expect(everything).not.toContain(secret);
    }
  });
});
