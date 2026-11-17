/**
 * Evals of the requirement match (roadmap 5.2, ARCHITECTURE §15.1): analyzes the job descriptions of
 * `apps/api/evals/jd-analysis/`, starts a tailoring session for each one and prints the match against a
 * profile, to judge by eye whether it is reasonable. It also checks what can be checked without judgment:
 * every piece of evidence must point to an element that exists in the profile.
 *
 *   npm run evals:match -- --provider gemini [--model <id>] [--only <text>] [--profile-db <careerly.db>]
 *
 * The profile is `apps/api/evals/match/profile.json` unless `--profile-db` names a Careerly database (e.g. the
 * app's own, to try it with the real profile): it is copied with SQLite's backup into a temporary folder, so the
 * original is never written, and the copy's AI preferences are dropped. The API key comes from
 * CAREERLY_EVAL_API_KEY (CAREERLY_EVAL_LOG=warn shows the API's logs). Each run writes a JSON report to
 * `.data/evals/`. It exits with 1 if a match fails or any evidence points to something that does not exist.
 *
 * Calls cost tokens on the user's key: two small-model calls per job description.
 */
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import {
  JobAnalysisStateSchema,
  JobPostingSchema,
  ProfileSchema,
  TailoringSessionViewSchema,
} from '@careerly/contracts';
import { pino } from 'pino';

const apiDir = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(apiDir, '..', '..');
const dist = (file) =>
  import(new URL(`file:///${path.join(apiDir, 'dist', file).replaceAll('\\', '/')}`).href);

const { values: args } = parseArgs({
  options: {
    provider: { type: 'string', default: 'gemini' },
    model: { type: 'string' },
    only: { type: 'string' },
    cases: { type: 'string', default: path.join(apiDir, 'evals', 'jd-analysis') },
    profile: { type: 'string', default: path.join(apiDir, 'evals', 'match', 'profile.json') },
    'profile-db': { type: 'string' },
    out: { type: 'string', default: path.join(repoRoot, '.data', 'evals') },
  },
});
const apiKey = process.env.CAREERLY_EVAL_API_KEY;
if (!apiKey) throw new Error('Set CAREERLY_EVAL_API_KEY to the API key of the provider.');
if (!['gemini', 'anthropic'].includes(args.provider)) {
  throw new Error('--provider must be gemini or anthropic');
}
if (!fs.existsSync(path.join(apiDir, 'dist', 'main.js'))) {
  throw new Error('Build first: npm run build -w @careerly/contracts -w @careerly/api');
}

const { loadConfig } = await dist('platform/config/app-config.js');
const { startServer } = await dist('server.js');

const cases = fs
  .readdirSync(args.cases)
  .filter((file) => file.endsWith('.json') && (!args.only || file.includes(args.only)))
  .sort()
  .map((file) => ({
    id: path.basename(file, '.json'),
    ...JSON.parse(fs.readFileSync(path.join(args.cases, file), 'utf8')),
  }));
if (cases.length === 0) throw new Error('No eval cases found.');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careerly-evals-'));
if (args['profile-db']) {
  const source = new DatabaseSync(args['profile-db'], { readOnly: true });
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
    },
  ),
  pino({ level: process.env.CAREERLY_EVAL_LOG ?? 'silent' }),
);

const call = async (method, route, body, token = apiToken) => {
  const response = await fetch(`http://127.0.0.1:${server.port}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${route} → ${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await call(
    'PUT',
    '/internal/ai-credentials',
    { credentials: { provider: args.provider, apiKey } },
    controlToken,
  );
  if (args.model) await call('PUT', '/settings/ai-models', { tier: 'small', model: args.model });
  if (!args['profile-db']) await createProfile(JSON.parse(fs.readFileSync(args.profile, 'utf8')));

  const profile = ProfileSchema.parse(await call('GET', '/profile'));
  const elements = profileElements(profile);
  console.log(
    `Profile: ${profile.positions.length} position(s), ${profile.projects.length} project(s), ` +
      `${elements.size} element(s) evidence can point to.`,
  );
  console.log(`Matching ${cases.length} job description(s) with ${args.provider}…\n`);

  const started = Date.now();
  // One at a time: the queue runs two jobs at once anyway, and the output stays in order.
  const results = [];
  for (const evalCase of cases) results.push(await run(evalCase, elements));
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  for (const result of results) printResult(result, elements);
  const matched = results.filter((result) => result.match);
  const invalid = matched.reduce((sum, result) => sum + result.invalidEvidence.length, 0);
  const statuses = matched.flatMap((result) => result.match.requirements.map((r) => r.status));
  const count = (status) => statuses.filter((s) => s === status).length;
  console.log(
    `\nTotal (${results.length} case(s), ${seconds}s): ${count('COVERED')} covered, ` +
      `${count('PARTIAL')} partial, ${count('MISSING')} missing; ${invalid} invalid evidence.`,
  );

  fs.mkdirSync(args.out, { recursive: true });
  const reportFile = path.join(
    args.out,
    `match-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.json`,
  );
  fs.writeFileSync(
    reportFile,
    `${JSON.stringify(
      {
        provider: args.provider,
        model: matched.find((r) => r.match.model)?.match.model ?? null,
        promptVersion: matched.find((r) => r.match.promptVersion)?.match.promptVersion ?? null,
        profile: args['profile-db'] ? 'database' : path.relative(repoRoot, args.profile),
        results,
      },
      null,
      2,
    )}\n`,
  );
  const shown = path.relative(repoRoot, reportFile);
  console.log(`Report: ${shown.startsWith('..') ? reportFile : shown}`);

  process.exitCode = results.some((r) => r.error) || invalid > 0 ? 1 : 0;
} finally {
  await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

/** Loads the fixture profile through the API, creating the tools it names when the catalog lacks them. */
async function createProfile(fixture) {
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
  for (const position of fixture.positions ?? []) await addExperience('positions', position);
  for (const project of fixture.projects ?? []) await addExperience('projects', project);
  for (const item of fixture.education ?? []) await call('POST', '/profile/education', item);
  for (const item of fixture.certifications ?? []) {
    await call('POST', '/profile/certifications', item);
  }
  for (const item of fixture.languages ?? []) await call('POST', '/profile/languages', item);
}

/** Every element evidence can point to, as `KIND:id` → a short description for the report. */
function profileElements(profile) {
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

/** Analyzes the job description, starts a session and waits for its match, as the app does. */
async function run(evalCase, elements) {
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
    if (state.job?.status === 'FAILED') {
      return { id: evalCase.id, error: `analysis: ${state.job.lastError ?? 'FAILED'}` };
    }
    if (state.job?.status === 'SUCCEEDED') break;
    await sleep(500);
  }

  const { session } = TailoringSessionViewSchema.parse(
    await call('POST', '/tailoring-sessions', { jobPostingId: posting.id }),
  );
  for (;;) {
    const view = TailoringSessionViewSchema.parse(
      await call('GET', `/tailoring-sessions/${session.id}`),
    );
    if (view.session.status === 'FAILED') {
      return { id: evalCase.id, error: `match: ${view.job?.lastError ?? 'FAILED'}` };
    }
    if (view.session.status === 'MATCHED') {
      const match = view.session.match;
      const invalidEvidence = match.requirements.flatMap((r) =>
        r.evidence
          .filter((e) => !elements.has(`${e.kind}:${e.id}`))
          .map((e) => ({ requirement: r.label, ...e })),
      );
      return { id: evalCase.id, match, invalidEvidence };
    }
    await sleep(500);
  }
}

function printResult(result, elements) {
  if (result.error) {
    console.log(`✗ ${result.id}: ${result.error}\n`);
    return;
  }
  const { requirements } = result.match;
  const covered = requirements.filter((r) => r.status === 'COVERED').length;
  console.log(
    `${result.invalidEvidence.length === 0 ? '✓' : '✗'} ${result.id}: ${covered}/${requirements.length} covered`,
  );
  const mark = { COVERED: '●', PARTIAL: '◐', MISSING: '○' };
  for (const r of requirements) {
    const importance = r.importance === 'REQUIRED' ? '' : ' (nice to have)';
    console.log(`  ${mark[r.status]} ${r.status.padEnd(7)} ${r.label}${importance} [${r.method}]`);
    for (const e of r.evidence) {
      const described = elements.get(`${e.kind}:${e.id}`) ?? 'DOES NOT EXIST';
      console.log(`      ← ${e.kind.toLowerCase()}: ${described}`);
    }
  }
  console.log('');
}
