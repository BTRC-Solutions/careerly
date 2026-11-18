/**
 * Evals of the CV writing (roadmap 6.3, ARCHITECTURE §15.1): for each job description of
 * `apps/api/evals/jd-analysis/`, analyzes it, matches it and writes the tailored CV in Spanish and English from
 * the same profile, as the app does (gaps are skipped until they can be answered). It prints every bullet with
 * the achievements it cites, to judge by eye whether the wording is faithful, and saves both PDFs. It also
 * checks what can be checked without judgment: every bullet has sources and they all exist in the profile.
 * It also shows what the truthfulness guard (roadmap 6.4) had to fix: texts rewritten once and texts dropped,
 * with their reasons. The CVs never keep an invented tool or number; those counts measure the prompt.
 *
 *   npm run evals:resume -- --provider gemini [--model <id>] [--only <text>] [--profile-db <careerly.db>]
 *
 * `--model` chooses the large tier's model. The profile, the key and `--profile-db` work as in `evals:match`.
 * Each run writes a JSON report and the PDFs to `.data/evals/`. It exits with 1 if a CV cannot be written or
 * any source does not exist.
 *
 * Calls cost tokens on the user's key: two small-model calls and two to four large-model calls per job
 * description (one more per language when the guard asks for a rewrite).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  ProfileSchema,
  TailoredResumesViewSchema,
  TailoringSessionViewSchema,
} from '@careerly/contracts';
import { PDFDocument } from 'pdf-lib';
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

const LANGUAGES = ['es', 'en'];

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
const { call, request, close } = await startEvalApi({
  ...credentials,
  profileDb: args['profile-db'],
});
const runDir = path.join(
  args.out,
  `resume-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}`,
);

try {
  if (args.model) await call('PUT', '/settings/ai-models', { tier: 'large', model: args.model });
  if (!args['profile-db']) {
    await createProfile(call, JSON.parse(fs.readFileSync(args.profile, 'utf8')));
  }

  const profile = ProfileSchema.parse(await call('GET', '/profile'));
  const elements = profileElements(profile);
  console.log(
    `Profile: ${profile.positions.length} position(s), ${profile.projects.length} project(s).`,
  );
  console.log(`Writing ${cases.length} CV pair(s) (es + en) with ${args.provider}…\n`);

  const started = Date.now();
  const results = [];
  for (const evalCase of cases) results.push(await run(evalCase, elements));
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  for (const result of results) printResult(result, elements);
  const written = results.filter((result) => result.resumes);
  const bullets = written.flatMap((r) =>
    r.resumes.flatMap((resume) => resume.data.experiences.flatMap((e) => e.bullets)),
  );
  const invalid = written.reduce((sum, r) => sum + r.invalidSources.length, 0);
  const guards = written.flatMap((r) => r.resumes.map((resume) => resume.data.guard));
  const rewritten = guards.reduce((sum, g) => sum + g.rewritten, 0);
  const dropped = guards.flatMap((g) => g.dropped);
  const byReason = Object.entries(
    Object.groupBy(
      dropped.flatMap((d) => d.reasons),
      (reason) => reason,
    ),
  )
    .map(([reason, list]) => `${list.length} ${reason}`)
    .join(', ');
  console.log(
    `\nTotal (${results.length} case(s), ${seconds}s): ${written.length} written, ` +
      `${bullets.length} bullet(s), ${invalid} invalid source(s). PDFs in ${path.relative(repoRoot, runDir)}`,
  );
  // What the model invented before the guard: the CVs keep none of it, but it is the measure of the prompt.
  console.log(
    `Guard: ${rewritten} text(s) rewritten, ${dropped.length} dropped${byReason ? ` (${byReason})` : ''}.`,
  );

  writeReport(args.out, 'resume', {
    provider: args.provider,
    model: written[0]?.resumes[0]?.model ?? null,
    promptVersion: written[0]?.resumes[0]?.promptVersion ?? null,
    profile: args['profile-db'] ? 'database' : path.relative(repoRoot, args.profile),
    results,
  });

  process.exitCode = results.some((r) => r.error) || invalid > 0 ? 1 : 0;
} finally {
  await close();
}

/** Waits until the session leaves `status` and its job is done. */
async function waitWhile(id, status) {
  for (;;) {
    const current = TailoringSessionViewSchema.parse(
      await call('GET', `/tailoring-sessions/${id}`),
    );
    const busy = current.job?.status === 'PENDING' || current.job?.status === 'RUNNING';
    if (current.session.status !== status && !busy) return current;
    await sleep(500);
  }
}

async function run(evalCase, elements) {
  const posting = await analyzedPosting(call, evalCase);
  if (posting.error) return { id: evalCase.id, error: posting.error };

  const { session } = TailoringSessionViewSchema.parse(
    await call('POST', '/tailoring-sessions', { jobPostingId: posting.id, languages: LANGUAGES }),
  );
  const matched = await waitWhile(session.id, 'ANALYZING');
  if (matched.session.status === 'FAILED') {
    return { id: evalCase.id, error: `match: ${matched.job?.lastError ?? 'FAILED'}` };
  }
  const gaps = matched.session.match.requirements.filter((r) => r.status !== 'COVERED').length;
  if (gaps > 0) await call('POST', `/tailoring-sessions/${session.id}/gaps`);
  await call('POST', `/tailoring-sessions/${session.id}/generate`);
  const done = await waitWhile(session.id, 'GENERATING');
  if (done.session.status !== 'REVIEW') {
    return { id: evalCase.id, error: `writing: ${done.job?.lastError ?? done.session.status}` };
  }

  const { resumes } = TailoredResumesViewSchema.parse(
    await call('GET', `/tailoring-sessions/${session.id}/resumes`),
  );
  const exists = (id) => [...elements.keys()].some((key) => key.endsWith(`:${id}`));
  const invalidSources = resumes.flatMap((resume) =>
    resume.data.experiences.flatMap((e) =>
      e.bullets.flatMap((b) =>
        (b.sourceIds.length === 0 ? [null] : b.sourceIds.filter((id) => !exists(id))).map((id) => ({
          language: resume.language,
          bullet: b.text,
          source: id,
        })),
      ),
    ),
  );

  fs.mkdirSync(runDir, { recursive: true });
  const pages = {};
  for (const language of LANGUAGES) {
    const response = await request(
      'GET',
      `/tailoring-sessions/${session.id}/resumes/${language}/preview`,
    );
    const pdf = new Uint8Array(await response.arrayBuffer());
    fs.writeFileSync(path.join(runDir, `${evalCase.id}.${language}.pdf`), pdf);
    pages[language] = (await PDFDocument.load(pdf)).getPageCount();
  }
  return { id: evalCase.id, gaps, pages, resumes, invalidSources };
}

function printResult(result, elements) {
  if (result.error) {
    console.log(`✗ ${result.id}: ${result.error}\n`);
    return;
  }
  const describe = (id) =>
    [...elements.entries()].find(([key]) => key.endsWith(`:${id}`))?.[1] ?? 'DOES NOT EXIST';
  console.log(
    `${result.invalidSources.length === 0 ? '✓' : '✗'} ${result.id} (${result.gaps} gap(s) skipped; ` +
      `pages: es ${result.pages.es}, en ${result.pages.en})`,
  );
  for (const resume of result.resumes) {
    console.log(`  [${resume.language}] ${resume.data.summary?.text ?? '(no summary)'}`);
    for (const experience of resume.data.experiences) {
      console.log(`    ${describe(experience.sourceId)}`);
      for (const bullet of experience.bullets) {
        console.log(`      • ${bullet.text}`);
        for (const id of bullet.sourceIds) console.log(`          ← ${describe(id)}`);
      }
    }
    const { guard } = resume.data;
    if (guard.rewritten > 0) console.log(`    guard: ${guard.rewritten} text(s) rewritten`);
    for (const drop of guard.dropped) {
      console.log(`    guard dropped (${drop.reasons.join(', ')}): ${drop.text}`);
    }
  }
  console.log('');
}
