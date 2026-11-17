/**
 * Evals of the job description analysis (roadmap 4.7, ARCHITECTURE §15): runs the real analysis on the cases
 * in `apps/api/evals/jd-analysis/` and reports how close it is to what each case expects. Run it when a prompt
 * or a model changes, and compare the numbers.
 *
 *   npm run evals:jd -- --provider gemini [--model <id>] [--only <text>] [--fail-under 0.8]
 *
 * The API key comes from CAREERLY_EVAL_API_KEY (never a flag, so it stays out of the shell history). The API
 * runs on a temporary data folder: the app's data is never touched. Each run writes a JSON report with every
 * match, miss and extra to `.data/evals/`, which is what to read when tuning the prompt.
 *
 * Calls cost tokens on the user's key: 8 cases with the small model are a few cents.
 */
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { JobAnalysisStateSchema, JobPostingSchema } from '@careerly/contracts';
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
    out: { type: 'string', default: path.join(repoRoot, '.data', 'evals') },
    'fail-under': { type: 'string' },
  },
});
const apiKey = process.env.CAREERLY_EVAL_API_KEY;
if (!apiKey) throw new Error('Set CAREERLY_EVAL_API_KEY to the API key of the provider.');
if (!['gemini', 'anthropic'].includes(args.provider)) {
  throw new Error('--provider must be gemini or anthropic');
}
const failUnder = args['fail-under'] === undefined ? null : Number(args['fail-under']);
if (failUnder !== null && !(failUnder >= 0 && failUnder <= 1)) {
  throw new Error('--fail-under must be a ratio between 0 and 1');
}
if (!fs.existsSync(path.join(apiDir, 'dist', 'main.js'))) {
  throw new Error('Build first: npm run build -w @careerly/contracts -w @careerly/api');
}

const { loadConfig } = await dist('platform/config/app-config.js');
const { startServer } = await dist('server.js');
const { scoreAnalysis, totalScore } = await dist('modules/job-postings/domain/analysis-eval.js');

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
const apiToken = randomBytes(24).toString('hex');
const controlToken = randomBytes(24).toString('hex');
const server = await startServer(
  loadConfig(
    {
      CAREERLY_DATA_DIR: dataDir,
      CAREERLY_API_TOKEN: apiToken,
      CAREERLY_CONTROL_TOKEN: controlToken,
      // Lets the script itself be tried against a fake provider.
      ...(process.env.CAREERLY_GEMINI_BASE_URL && {
        CAREERLY_GEMINI_BASE_URL: process.env.CAREERLY_GEMINI_BASE_URL,
      }),
    },
    {
      defaultMigrationsDir: path.join(apiDir, 'drizzle'),
      defaultTemplatesDir: path.join(apiDir, 'templates'),
    },
  ),
  pino({ level: 'silent' }),
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

try {
  await call(
    'PUT',
    '/internal/ai-credentials',
    { credentials: { provider: args.provider, apiKey } },
    controlToken,
  );
  if (args.model) await call('PUT', '/settings/ai-models', { tier: 'small', model: args.model });

  console.log(`Analyzing ${cases.length} job description(s) with ${args.provider}…\n`);
  const started = Date.now();
  const results = await Promise.all(cases.map(analyze));
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  const scored = results.filter((result) => result.score);
  const totals = totalScore(scored.map((result) => result.score));
  printReport(results, totals, seconds);

  fs.mkdirSync(args.out, { recursive: true });
  const reportFile = path.join(
    args.out,
    `jd-analysis-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.json`,
  );
  const model = scored[0]?.analysis.model ?? null;
  const promptVersion = scored[0]?.analysis.promptVersion ?? null;
  fs.writeFileSync(
    reportFile,
    `${JSON.stringify({ provider: args.provider, model, promptVersion, totals, results }, null, 2)}\n`,
  );
  const shown = path.relative(repoRoot, reportFile);
  console.log(`\nReport: ${shown.startsWith('..') ? reportFile : shown}`);

  const failed = results.some((result) => result.error);
  const below = failUnder !== null && (totals.precision < failUnder || totals.recall < failUnder);
  if (below) console.log(`Precision or recall is under ${failUnder}.`);
  process.exitCode = failed || below ? 1 : 0;
} finally {
  await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

/** Creates the posting, runs its analysis as the app does (background job) and scores it. */
async function analyze(evalCase) {
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
      return { id: evalCase.id, error: state.job.lastError ?? 'FAILED' };
    }
    if (state.job?.status === 'SUCCEEDED' && state.analysis) {
      return {
        id: evalCase.id,
        analysis: state.analysis,
        score: scoreAnalysis(state.analysis, evalCase.expected),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function printReport(results, totals, seconds) {
  const percent = (ratio) => `${Math.round(ratio * 100)}%`;
  for (const result of results) {
    if (result.error) {
      console.log(`✗ ${result.id}: analysis failed (${result.error})`);
      continue;
    }
    const { score } = result;
    const single = totalScore([score]);
    console.log(
      `${score.missed.length + score.unexpected.length === 0 ? '✓' : '•'} ${result.id}: ` +
        `precision ${percent(single.precision)}, recall ${percent(single.recall)}, ` +
        `importance ${percent(single.importance)}, facts ${percent(single.facts)}`,
    );
    for (const miss of score.missed)
      console.log(`    missed:     ${miss.expected} (${miss.importance})`);
    for (const extra of score.unexpected) console.log(`    unexpected: ${extra}`);
    for (const match of score.matched.filter(
      (m) => m.expectedImportance !== m.extractedImportance,
    )) {
      console.log(
        `    importance: ${match.extracted} is ${match.extractedImportance}, expected ${match.expectedImportance}`,
      );
    }
    for (const fact of score.facts.filter((f) => !f.ok)) {
      console.log(`    fact:       ${fact.field} is ${fact.actual}, expected ${fact.expected}`);
    }
  }
  console.log(
    `\nTotal (${totals.cases} case(s), ${seconds}s): precision ${percent(totals.precision)}, ` +
      `recall ${percent(totals.recall)}, importance ${percent(totals.importance)}, ` +
      `facts ${percent(totals.facts)}`,
  );
}
