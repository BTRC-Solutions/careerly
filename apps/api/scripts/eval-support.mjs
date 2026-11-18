/**
 * What the AI evals that run the whole API share (`eval-match.mjs`, `eval-resume.mjs`): an API in a temporary
 * data folder with the eval's provider and key, the fixture profile, the job description cases and the report.
 */
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { JobAnalysisStateSchema, JobPostingSchema } from '@careerly/contracts';
import { pino } from 'pino';

export const apiDir = path.resolve(import.meta.dirname, '..');
export const repoRoot = path.resolve(apiDir, '..', '..');

const dist = (file) =>
  import(new URL(`file:///${path.join(apiDir, 'dist', file).replaceAll('\\', '/')}`).href);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The API key and provider, checked before anything starts. */
export function evalCredentials(provider) {
  const apiKey = process.env.CAREERLY_EVAL_API_KEY;
  if (!apiKey) throw new Error('Set CAREERLY_EVAL_API_KEY to the API key of the provider.');
  if (!['gemini', 'anthropic'].includes(provider)) {
    throw new Error('--provider must be gemini or anthropic');
  }
  if (!fs.existsSync(path.join(apiDir, 'dist', 'main.js'))) {
    throw new Error('Build first: npm run build -w @careerly/contracts -w @careerly/api');
  }
  return { provider, apiKey };
}

/** The job description cases of `dir` whose file name contains `only`, in file order. */
export function loadCases(dir, only) {
  const cases = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json') && (!only || file.includes(only)))
    .sort()
    .map((file) => ({
      id: path.basename(file, '.json'),
      ...JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')),
    }));
  if (cases.length === 0) throw new Error('No eval cases found.');
  return cases;
}

/**
 * Starts the API on a temporary data folder with the eval's credentials. With `profileDb`, the folder starts
 * from a copy of that database made with SQLite's backup (the original is never written), without its AI
 * preferences; otherwise the caller loads a fixture with `createProfile`. `close` deletes the folder.
 */
export async function startEvalApi({ provider, apiKey, profileDb }) {
  const { loadConfig } = await dist('platform/config/app-config.js');
  const { startServer } = await dist('server.js');
  const { findVendoredTypst } = await dist('platform/config/typst-binary.js');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careerly-evals-'));
  if (profileDb) {
    const source = new DatabaseSync(profileDb, { readOnly: true });
    await backup(source, path.join(dataDir, 'careerly.db'));
    source.close();
    // The copy must not bring the app's AI preferences (Claude Code switch, chosen models): the eval uses
    // exactly the provider, key and model it is given.
    const copy = new DatabaseSync(path.join(dataDir, 'careerly.db'));
    copy.prepare("DELETE FROM settings WHERE key LIKE 'ai.%'").run();
    copy.close();
  }

  const apiToken = randomBytes(24).toString('hex');
  const controlToken = randomBytes(24).toString('hex');
  const server = await startServer(
    loadConfig(
      {
        CAREERLY_DATA_DIR: dataDir,
        CAREERLY_API_TOKEN: apiToken,
        CAREERLY_CONTROL_TOKEN: controlToken,
        ...(process.env.CAREERLY_GEMINI_BASE_URL && {
          CAREERLY_GEMINI_BASE_URL: process.env.CAREERLY_GEMINI_BASE_URL,
        }),
      },
      {
        defaultMigrationsDir: path.join(apiDir, 'drizzle'),
        defaultTemplatesDir: path.join(apiDir, 'templates'),
        // As in development: the vendored Typst (`npm run typst:fetch`), else the PATH's.
        defaultTypstBinary: process.env.TYPST_BIN ?? findVendoredTypst(repoRoot),
      },
    ),
    pino({ level: process.env.CAREERLY_EVAL_LOG ?? 'silent' }),
  );

  const request = async (method, route, body, token = apiToken) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${method} ${route} → ${response.status}: ${await response.text()}`);
    }
    return response;
  };
  const call = async (method, route, body, token) => {
    const response = await request(method, route, body, token);
    return response.status === 204 ? null : response.json();
  };
  const close = async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };

  try {
    await call(
      'PUT',
      '/internal/ai-credentials',
      { credentials: { provider, apiKey } },
      controlToken,
    );
  } catch (error) {
    await close();
    throw error;
  }
  return { call, request, close };
}

/** Loads the fixture profile through the API, creating the tools it names when the catalog lacks them. */
export async function createProfile(call, fixture) {
  const toolIds = async (names = []) => {
    const ids = [];
    for (const name of names) ids.push((await call('POST', '/tools', { name })).tool.id);
    return ids;
  };
  const addExperience = async (kind, { achievements = [], tools, ...fields }) => {
    const created = await call('POST', `/profile/${kind}`, {
      ...fields,
      toolIds: await toolIds(tools),
    });
    for (const { tools: achievementTools, ...achievement } of achievements) {
      await call('POST', `/profile/${kind}/${created.id}/achievements`, {
        ...achievement,
        toolIds: await toolIds(achievementTools),
      });
    }
  };
  if (fixture.personalInfo) await call('PATCH', '/profile/personal-info', fixture.personalInfo);
  for (const position of fixture.positions ?? []) await addExperience('positions', position);
  for (const project of fixture.projects ?? []) await addExperience('projects', project);
  for (const item of fixture.education ?? []) await call('POST', '/profile/education', item);
  for (const item of fixture.certifications ?? []) {
    await call('POST', '/profile/certifications', item);
  }
  for (const item of fixture.languages ?? []) await call('POST', '/profile/languages', item);
}

/** Every element evidence or a source can point to, as `KIND:id` → a short description for the report. */
export function profileElements(profile) {
  const elements = new Map();
  const short = (text) => (text.length > 70 ? `${text.slice(0, 67)}…` : text);
  for (const p of profile.positions) {
    elements.set(`POSITION:${p.id}`, `${p.title} at ${p.company}`);
    for (const a of p.achievements) elements.set(`ACHIEVEMENT:${a.id}`, short(a.text));
  }
  for (const p of profile.projects) {
    elements.set(`PROJECT:${p.id}`, `project ${p.name}`);
    for (const a of p.achievements) elements.set(`ACHIEVEMENT:${a.id}`, short(a.text));
  }
  for (const e of profile.education) elements.set(`EDUCATION:${e.id}`, short(e.title));
  for (const c of profile.certifications) elements.set(`CERTIFICATION:${c.id}`, short(c.name));
  for (const l of profile.languages) elements.set(`LANGUAGE:${l.id}`, `${l.language} ${l.level}`);
  return elements;
}

/** Creates and analyzes the case's job description, as the app does; returns its id or an error. */
export async function analyzedPosting(call, evalCase) {
  const posting = JobPostingSchema.parse(
    await call('POST', '/job-postings', {
      text: evalCase.text,
      title: evalCase.title ?? '',
      company: evalCase.company ?? '',
      location: evalCase.location ?? '',
    }),
  );
  await call('POST', `/job-postings/${posting.id}/analyze`);
  for (;;) {
    const state = JobAnalysisStateSchema.parse(
      await call('GET', `/job-postings/${posting.id}/analysis`),
    );
    if (state.job?.status === 'FAILED')
      return { error: `analysis: ${state.job.lastError ?? 'FAILED'}` };
    if (state.job?.status === 'SUCCEEDED') return { id: posting.id };
    await sleep(500);
  }
}

/** Writes the run's JSON report to `out` and prints where. */
export function writeReport(out, name, report) {
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(
    out,
    `${name}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.json`,
  );
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  const shown = path.relative(repoRoot, file);
  console.log(`Report: ${shown.startsWith('..') ? file : shown}`);
  return file;
}
