/**
 * Manual page-fit tryout (roadmap 3.6): renders the master profile as CVs of 1 and 2 pages with hand-set
 * scores, to validate the template and the page fitter before the AI pipeline exists.
 *
 *   npm run fit:tryout -- [--data .data] [--lang es|en] [--out .data/fit-tryout]
 *
 * It reads the profile through the real API, started on a copy of the database, so the data folder is never
 * modified. The first run writes <out>/scores.json: one entry per achievement with a default score (by the
 * order the bullets have in the profile) and one per project (`relevant`). Edit it and run again. Each run
 * writes cv-1p.pdf and cv-2p.pdf, with fit-1p.json and fit-2p.json holding the fit log.
 */
import 'reflect-metadata';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ProfileSchema, ResumeDocumentSchema } from '@careerly/contracts';

const apiDir = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(apiDir, '..', '..');
const dist = (file) =>
  import(new URL(`file:///${path.join(apiDir, 'dist', file).replaceAll('\\', '/')}`).href);

const { values: args } = parseArgs({
  options: {
    data: { type: 'string', default: path.join(repoRoot, '.data') },
    lang: { type: 'string', default: 'es' },
    out: { type: 'string', default: path.join(repoRoot, '.data', 'fit-tryout') },
  },
});
if (!['es', 'en'].includes(args.lang)) throw new Error('--lang must be es or en');
if (!fs.existsSync(path.join(apiDir, 'dist', 'main.js'))) {
  throw new Error('Build first: npm run build -w @careerly/contracts -w @careerly/api');
}

const { fitToPages } = await dist('modules/tailoring/domain/page-fitter.js');
const { toTemplateData } = await dist('modules/documents/domain/resume-labels.js');
const { TypstResumeRenderer } = await dist(
  'modules/documents/infrastructure/typst-resume-renderer.js',
);
const { findVendoredTypst } = await dist('platform/config/typst-binary.js');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'careerly-fit-'));
try {
  const profile = await readProfile(args.data, work);
  fs.mkdirSync(args.out, { recursive: true });
  const scores = loadScores(profile, path.join(args.out, 'scores.json'));

  const templatesDir = path.join(apiDir, 'templates');
  const renderer = new TypstResumeRenderer({
    typstBinary: findVendoredTypst(repoRoot) ?? 'typst',
    templatesDir,
    renderTimeoutMs: 10_000,
    typstPackagesDir: path.join(work, 'typst-packages'),
  });
  const template = {
    id: 'classic',
    name: 'Classic',
    version: 1,
    dir: path.join(templatesDir, 'classic'),
  };
  const render = (selection) =>
    renderer.render(template, toTemplateData(toDocument(profile, selection, args.lang)));

  const candidates = {
    positions: profile.positions.map((position) => ({
      id: position.id,
      startDate: position.startDate,
      endDate: position.endDate,
      bullets: position.achievements.map((a) => ({ id: a.id, score: scores.bullets[a.id] })),
    })),
    projects: profile.projects.map((project) => ({
      id: project.id,
      relevant: scores.projects[project.id],
      bullets: project.achievements.map((a) => ({ id: a.id, score: scores.bullets[a.id] })),
    })),
  };
  const today = new Date().toISOString().slice(0, 7);

  for (const pageBudget of [1, 2]) {
    let renders = 0;
    const started = Date.now();
    const result = await fitToPages(
      candidates,
      async (selection) => {
        renders += 1;
        return (await render(selection)).pageCount;
      },
      { pageBudget, today },
    );
    const output = await render(result.selection);
    fs.writeFileSync(path.join(args.out, `cv-${pageBudget}p.pdf`), output.pdf);
    fs.writeFileSync(
      path.join(args.out, `fit-${pageBudget}p.json`),
      `${JSON.stringify({ fits: result.fits, pageCount: result.pageCount, log: describeLog(profile, result.log) }, null, 2)}\n`,
    );
    console.log(
      `${pageBudget} page(s): ${result.pageCount} page(s), fits=${result.fits}, ${renders} renders in ` +
        `${Date.now() - started} ms, ${result.log.length} log entries`,
    );
  }
  console.log(`Written to ${args.out}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

/** Starts the built API on a copy of the database and reads the profile. */
async function readProfile(dataDir, work) {
  const copy = path.join(work, 'data');
  fs.mkdirSync(copy);
  for (const file of ['careerly.db', 'careerly.db-wal', 'careerly.db-shm']) {
    if (fs.existsSync(path.join(dataDir, file)))
      fs.copyFileSync(path.join(dataDir, file), path.join(copy, file));
  }
  const port = await freePort();
  const token = randomBytes(24).toString('base64url');
  const api = spawn(process.execPath, [path.join(apiDir, 'dist', 'main.js')], {
    env: {
      ...process.env,
      CAREERLY_DATA_DIR: copy,
      CAREERLY_API_TOKEN: token,
      CAREERLY_API_PORT: String(port),
    },
    stdio: 'ignore',
  });
  try {
    const url = `http://127.0.0.1:${port}`;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetch(`${url}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`GET /profile: HTTP ${response.status}`);
        return ProfileSchema.parse(await response.json());
      } catch (error) {
        if (attempt >= 50) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  } finally {
    api.kill();
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Reads <out>/scores.json, adding entries (with defaults) for anything new in the profile. */
function loadScores(profile, file) {
  const saved = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { bullets: [], projects: [] };
  const savedBullets = new Map(saved.bullets.map((entry) => [entry.id, entry.score]));
  const savedProjects = new Map(saved.projects.map((entry) => [entry.id, entry.relevant]));
  const owners = [
    ...profile.positions.map((p) => ({
      label: `${p.title} @ ${p.company}`,
      achievements: p.achievements,
    })),
    ...profile.projects.map((p) => ({ label: `Project: ${p.name}`, achievements: p.achievements })),
  ];
  const scores = {
    bullets: owners.flatMap((owner) =>
      owner.achievements.map((achievement, index) => ({
        id: achievement.id,
        owner: owner.label,
        text: achievement.text.slice(0, 90),
        score:
          savedBullets.get(achievement.id) ?? Math.max(0.1, Number((1 - index * 0.1).toFixed(2))),
      })),
    ),
    projects: profile.projects.map((project) => ({
      id: project.id,
      name: project.name,
      relevant: savedProjects.get(project.id) ?? true,
    })),
  };
  fs.writeFileSync(file, `${JSON.stringify(scores, null, 2)}\n`);
  return {
    bullets: Object.fromEntries(scores.bullets.map((entry) => [entry.id, entry.score])),
    projects: Object.fromEntries(scores.projects.map((entry) => [entry.id, entry.relevant])),
  };
}

/** The CV for a selection of the fitter: the profile's content, nothing rewritten. */
function toDocument(profile, selection, language) {
  const info = profile.personalInfo;
  const achievements = new Map(
    [...profile.positions, ...profile.projects].flatMap((owner) =>
      owner.achievements.map((a) => [a.id, a.text]),
    ),
  );
  const positions = new Map(profile.positions.map((position) => [position.id, position]));
  const projects = new Map(profile.projects.map((project) => [project.id, project]));
  const tools = [
    ...new Set(
      [...profile.positions, ...profile.projects].flatMap((owner) =>
        owner.tools.map((tool) => tool.name),
      ),
    ),
  ];
  const text = (value) => (value && value.trim() ? value.trim() : null);

  return ResumeDocumentSchema.parse({
    language,
    paper: language === 'en' ? 'us-letter' : 'a4',
    basics: {
      name: [info.firstNames, info.lastNames].filter(Boolean).join(' ') || '—',
      headline: text(info.headline),
      location: text(info.location),
      email: text(info.email),
      phone: text(info.phone),
      links: info.links.map((link) => ({ url: link.url, label: text(link.label) })),
    },
    summary: text(info.summary),
    experience: selection.positions.map(({ id, bulletIds }) => {
      const position = positions.get(id);
      return {
        company: position.company,
        title: position.title,
        location: text(position.location),
        startDate: position.startDate,
        endDate: position.endDate,
        bullets: bulletIds.map((bulletId) => achievements.get(bulletId)),
      };
    }),
    projects: selection.projects.map(({ id, bulletIds }) => {
      const project = projects.get(id);
      return {
        name: project.name,
        role: text(project.role),
        url: text(project.url),
        startDate: project.startDate,
        endDate: project.endDate,
        bullets: bulletIds.map((bulletId) => achievements.get(bulletId)),
      };
    }),
    skills: tools.length > 0 ? [{ label: null, items: tools }] : [],
    education: profile.education.map((item) => ({
      institution: item.institution,
      title: item.title,
      field: text(item.field),
      startDate: item.startDate,
      endDate: item.endDate,
    })),
    certifications: profile.certifications.map((item) => ({
      name: item.name,
      issuer: text(item.issuer),
      issueDate: item.issueDate,
    })),
    languages: profile.languages.map((item) => ({ language: item.language, level: item.level })),
  });
}

/** The fit log with names instead of ids, to read it next to the PDF. */
function describeLog(profile, log) {
  const owners = new Map([
    ...profile.positions.map((p) => [p.id, `${p.title} @ ${p.company}`]),
    ...profile.projects.map((p) => [p.id, `Project: ${p.name}`]),
  ]);
  const texts = new Map(
    [...profile.positions, ...profile.projects].flatMap((owner) =>
      owner.achievements.map((a) => [a.id, a.text]),
    ),
  );
  return log.map((entry) => ({
    action: entry.action,
    reason: entry.reason,
    owner: owners.get(entry.owner.id),
    bullet: entry.bulletId ? texts.get(entry.bulletId).slice(0, 90) : null,
  }));
}
