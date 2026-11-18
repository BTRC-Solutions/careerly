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
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ProfileSchema, TailoringSessionViewSchema } from '@careerly/contracts';
import {
  analyzedPosting,
  apiDir,
  createProfile,
  evalCredentials,
  loadCases,
  profileElements,
  repoRoot,
  sleep,
  startEvalApi,
  writeReport,
} from './eval-support.mjs';

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
const credentials = evalCredentials(args.provider);
const cases = loadCases(args.cases, args.only);
const { call, close } = await startEvalApi({ ...credentials, profileDb: args['profile-db'] });

try {
  if (args.model) await call('PUT', '/settings/ai-models', { tier: 'small', model: args.model });
  if (!args['profile-db']) {
    await createProfile(call, JSON.parse(fs.readFileSync(args.profile, 'utf8')));
  }

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

  writeReport(args.out, 'match', {
    provider: args.provider,
    model: matched.find((r) => r.match.model)?.match.model ?? null,
    promptVersion: matched.find((r) => r.match.promptVersion)?.match.promptVersion ?? null,
    profile: args['profile-db'] ? 'database' : path.relative(repoRoot, args.profile),
    results,
  });

  process.exitCode = results.some((r) => r.error) || invalid > 0 ? 1 : 0;
} finally {
  await close();
}

/** Analyzes the job description, starts a session and waits for its match, as the app does. */
async function run(evalCase, elements) {
  const posting = await analyzedPosting(call, evalCase);
  if (posting.error) return { id: evalCase.id, error: posting.error };

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
