import {
  AchievementSchema,
  CertificationSchema,
  EducationSchema,
  LanguageSkillSchema,
  PersonalInfoSchema,
  PositionSchema,
  ProfileSchema,
  ProjectSchema,
} from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

describe('profile API (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer | undefined;

  async function start() {
    server = await startTestServer(testConfig(temp.dir));
  }
  async function stop() {
    await server?.close();
    server = undefined;
  }

  async function call(method: Method, path: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${server!.port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : undefined };
  }

  const getProfile = async () => ProfileSchema.parse((await call('GET', '/profile')).body);

  async function createPosition(fields: Record<string, unknown> = {}) {
    const { status, body } = await call('POST', '/profile/positions', {
      company: 'Acme',
      title: 'Backend Engineer',
      startDate: '2020-01',
      ...fields,
    });
    expect(status).toBe(201);
    return PositionSchema.parse(body);
  }

  async function addAchievement(parentPath: string, text: string, toolIds: string[] = []) {
    const { status, body } = await call('POST', `${parentPath}/achievements`, { text, toolIds });
    expect(status).toBe(201);
    return AchievementSchema.parse(body);
  }

  const expectValidationError = (response: { status: number; body: unknown }) => {
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  };

  beforeEach(async () => {
    temp = createTempDir();
    await start();
  });
  afterEach(async () => {
    await stop();
    temp.cleanup();
  });

  it('GET /profile starts empty', async () => {
    expect(await getProfile()).toEqual({
      personalInfo: {
        fullName: null,
        headline: null,
        location: null,
        email: null,
        phone: null,
        summary: null,
        links: [],
        updatedAt: null,
      },
      positions: [],
      projects: [],
      education: [],
      certifications: [],
      languages: [],
    });
  });

  describe('personal information (2.2)', () => {
    it('is edited partially and persists across restarts', async () => {
      const first = await call('PATCH', '/profile/personal-info', {
        fullName: 'Ada Lovelace',
        headline: 'Senior Backend Engineer',
        email: 'ada@example.com',
        links: [{ kind: 'GITHUB', url: 'https://github.com/ada' }],
      });
      expect(first.status).toBe(200);

      // A second PATCH only changes what it sends.
      const second = await call('PATCH', '/profile/personal-info', { location: 'Buenos Aires' });
      const info = PersonalInfoSchema.parse(second.body);
      expect(info).toMatchObject({
        fullName: 'Ada Lovelace',
        location: 'Buenos Aires',
        links: [{ kind: 'GITHUB', url: 'https://github.com/ada', label: null }],
      });
      expect(info.updatedAt).not.toBeNull();

      await stop();
      await start();
      expect((await getProfile()).personalInfo).toEqual(info);
    });

    it('clears a field with null or an empty string', async () => {
      await call('PATCH', '/profile/personal-info', { phone: '+54 11 5555-5555' });
      const cleared = await call('PATCH', '/profile/personal-info', { phone: '' });
      expect(PersonalInfoSchema.parse(cleared.body).phone).toBeNull();
    });

    it('rejects invalid emails, unsafe links and unknown keys', async () => {
      expectValidationError(await call('PATCH', '/profile/personal-info', { email: 'nope' }));
      expectValidationError(
        await call('PATCH', '/profile/personal-info', {
          links: [{ kind: 'OTHER', url: 'file:///etc/passwd' }],
        }),
      );
      expectValidationError(await call('PATCH', '/profile/personal-info', { userId: 1 }));
    });
  });

  describe('positions and achievements (2.3)', () => {
    it('creates a position with catalog tools and provenance', async () => {
      const position = await createPosition({
        workMode: 'REMOTE',
        context: 'Payments platform, team of 8',
        toolIds: ['postgresql', 'kubernetes', 'postgresql'],
      });

      expect(position).toMatchObject({
        company: 'Acme',
        workMode: 'REMOTE',
        endDate: null,
        tools: [
          { id: 'kubernetes', name: 'Kubernetes' },
          { id: 'postgresql', name: 'PostgreSQL' },
        ],
        achievements: [],
        origin: 'MANUAL',
        originSessionId: null,
      });
      expect(position.createdAt).toBe(position.updatedAt);
    });

    it('PATCH changes only the sent fields; toolIds replaces the list', async () => {
      const position = await createPosition({ toolIds: ['postgresql'] });

      const renamed = PositionSchema.parse(
        (await call('PATCH', `/profile/positions/${position.id}`, { company: 'Acme Corp' })).body,
      );
      expect(renamed.company).toBe('Acme Corp');
      expect(renamed.tools.map((tool) => tool.id)).toEqual(['postgresql']);
      expect(renamed.updatedAt >= position.updatedAt).toBe(true);

      const retooled = PositionSchema.parse(
        (await call('PATCH', `/profile/positions/${position.id}`, { toolIds: ['go'] })).body,
      );
      expect(retooled.tools.map((tool) => tool.id)).toEqual(['go']);
    });

    it('validates dates (also against stored values) and tool ids', async () => {
      expectValidationError(
        await call('POST', '/profile/positions', {
          company: 'A',
          title: 'B',
          startDate: '2021-05',
          endDate: '2021-04',
        }),
      );

      const position = await createPosition({ startDate: '2020-06' });
      expectValidationError(
        await call('PATCH', `/profile/positions/${position.id}`, { endDate: '2020-01' }),
      );
      expectValidationError(
        await call('PATCH', `/profile/positions/${position.id}`, { toolIds: ['not-a-tool'] }),
      );
      expectValidationError(await call('PATCH', `/profile/positions/${position.id}`, {}));
    });

    it('handles 25 achievements in order, reorders them and keeps them per parent', async () => {
      const position = await createPosition();
      const other = await createPosition({ company: 'Other' });
      const path = `/profile/positions/${position.id}`;

      const created = [];
      for (let i = 1; i <= 25; i++) {
        created.push(await addAchievement(path, `Achievement ${i}`, i === 1 ? ['go'] : []));
      }
      await addAchievement(`/profile/positions/${other.id}`, 'Elsewhere');

      const loaded = PositionSchema.parse((await call('GET', path)).body);
      expect(loaded.achievements.map((a) => a.text)).toEqual(created.map((a) => a.text));
      expect(loaded.achievements[0]?.tools).toEqual([{ id: 'go', name: 'Go' }]);

      const reversed = created.map((a) => a.id).reverse();
      const reorder = await call('PUT', `${path}/achievements/order`, {
        achievementIds: reversed,
      });
      expect(reorder).toEqual({ status: 200, body: { achievementIds: reversed } });

      const reloaded = PositionSchema.parse((await call('GET', path)).body);
      expect(reloaded.achievements.map((a) => a.id)).toEqual(reversed);

      // A new achievement goes to the end of the new order.
      const last = await addAchievement(path, 'Newest');
      const withNew = PositionSchema.parse((await call('GET', path)).body);
      expect(withNew.achievements.at(-1)?.id).toBe(last.id);
      expect(withNew.achievements).toHaveLength(26);
    });

    it('rejects a reorder that does not list exactly the current achievements', async () => {
      const position = await createPosition();
      const other = await createPosition({ company: 'Other' });
      const path = `/profile/positions/${position.id}`;
      const a = await addAchievement(path, 'A');
      const b = await addAchievement(path, 'B');
      const foreign = await addAchievement(`/profile/positions/${other.id}`, 'X');

      for (const achievementIds of [[a.id], [a.id, b.id, b.id], [a.id, foreign.id]]) {
        expectValidationError(await call('PUT', `${path}/achievements/order`, { achievementIds }));
      }
    });

    it('updates and deletes achievements', async () => {
      const position = await createPosition();
      const achievement = await addAchievement(`/profile/positions/${position.id}`, 'Cut latency', [
        'postgresql',
      ]);

      const updated = AchievementSchema.parse(
        (
          await call('PATCH', `/profile/achievements/${achievement.id}`, {
            metrics: '-40% p95 latency',
          })
        ).body,
      );
      expect(updated).toMatchObject({
        text: 'Cut latency',
        metrics: '-40% p95 latency',
        tools: [{ id: 'postgresql', name: 'PostgreSQL' }],
      });

      expect((await call('DELETE', `/profile/achievements/${achievement.id}`)).status).toBe(204);
      expect((await call('GET', `/profile/achievements/${achievement.id}`)).status).toBe(404);
      expect((await call('DELETE', `/profile/achievements/${achievement.id}`)).status).toBe(404);
    });

    it('deleting a position removes its achievements', async () => {
      const position = await createPosition();
      const achievement = await addAchievement(`/profile/positions/${position.id}`, 'A', ['go']);

      expect((await call('DELETE', `/profile/positions/${position.id}`)).status).toBe(204);
      expect((await call('GET', `/profile/positions/${position.id}`)).status).toBe(404);
      expect((await call('GET', `/profile/achievements/${achievement.id}`)).status).toBe(404);
    });

    it('returns 404 for unknown positions', async () => {
      expect((await call('GET', '/profile/positions/nope')).status).toBe(404);
      expect((await call('PATCH', '/profile/positions/nope', { title: 'x' })).status).toBe(404);
      expect(
        (await call('POST', '/profile/positions/nope/achievements', { text: 'x' })).status,
      ).toBe(404);
    });

    it('lists positions in reverse chronological order, current first', async () => {
      await createPosition({ company: 'Old', startDate: '2012-01', endDate: '2015-01' });
      await createPosition({ company: 'Current', startDate: '2021-01' });
      await createPosition({ company: 'Recent', startDate: '2015-02', endDate: '2020-12' });

      expect((await getProfile()).positions.map((p) => p.company)).toEqual([
        'Current',
        'Recent',
        'Old',
      ]);
    });
  });

  describe('projects (2.4)', () => {
    it('supports the same achievement flow as positions', async () => {
      const { status, body } = await call('POST', '/profile/projects', {
        name: 'careerly',
        kind: 'OPEN_SOURCE',
        url: 'https://github.com/example/careerly',
        toolIds: ['typescript'],
      });
      expect(status).toBe(201);
      const project = ProjectSchema.parse(body);
      expect(project).toMatchObject({ kind: 'OPEN_SOURCE', startDate: null, role: null });

      const path = `/profile/projects/${project.id}`;
      const first = await addAchievement(path, 'First');
      const second = await addAchievement(path, 'Second');
      await call('PUT', `${path}/achievements/order`, { achievementIds: [second.id, first.id] });

      const loaded = ProjectSchema.parse((await call('GET', path)).body);
      expect(loaded.achievements.map((a) => a.text)).toEqual(['Second', 'First']);

      const patched = ProjectSchema.parse(
        (await call('PATCH', path, { startDate: '2026-01', role: 'Author' })).body,
      );
      expect(patched).toMatchObject({ startDate: '2026-01', role: 'Author' });
      expectValidationError(await call('PATCH', path, { endDate: '2025-12' }));

      expect((await call('DELETE', path)).status).toBe(204);
      expect((await getProfile()).projects).toEqual([]);
    });

    it('rejects unknown kinds and non-http URLs', async () => {
      expectValidationError(await call('POST', '/profile/projects', { name: 'x', kind: 'HOBBY' }));
      expectValidationError(
        await call('POST', '/profile/projects', {
          name: 'x',
          kind: 'PERSONAL',
          url: 'javascript:alert(1)',
        }),
      );
    });
  });

  describe('education, certifications and languages (2.5)', () => {
    it('education CRUD with date validation', async () => {
      const created = await call('POST', '/profile/education', {
        institution: 'UBA',
        title: 'Ingeniería en Informática',
        startDate: '2008-03',
        endDate: '2014-12',
      });
      expect(created.status).toBe(201);
      const item = EducationSchema.parse(created.body);
      expect(item.kind).toBe('DEGREE');

      const patched = EducationSchema.parse(
        (await call('PATCH', `/profile/education/${item.id}`, { field: 'Software' })).body,
      );
      expect(patched).toMatchObject({ field: 'Software', title: 'Ingeniería en Informática' });
      expectValidationError(
        await call('PATCH', `/profile/education/${item.id}`, { startDate: '2015-01' }),
      );

      expect((await call('DELETE', `/profile/education/${item.id}`)).status).toBe(204);
      expect((await call('DELETE', `/profile/education/${item.id}`)).status).toBe(404);
    });

    it('certifications CRUD, sorted by issue date', async () => {
      await call('POST', '/profile/certifications', { name: 'Old cert', issueDate: '2018-01' });
      const created = await call('POST', '/profile/certifications', {
        name: 'AWS Solutions Architect',
        issuer: 'Amazon',
        issueDate: '2024-05',
        expirationDate: '2027-05',
        url: 'https://aws.amazon.com/verify/123',
      });
      const cert = CertificationSchema.parse(created.body);
      expectValidationError(
        await call('PATCH', `/profile/certifications/${cert.id}`, { expirationDate: '2020-01' }),
      );

      expect((await getProfile()).certifications.map((c) => c.name)).toEqual([
        'AWS Solutions Architect',
        'Old cert',
      ]);
    });

    it('languages CRUD, sorted by level', async () => {
      await call('POST', '/profile/languages', { language: 'Portugués', level: 'A2' });
      const english = LanguageSkillSchema.parse(
        (await call('POST', '/profile/languages', { language: 'Inglés', level: 'B2' })).body,
      );
      await call('POST', '/profile/languages', { language: 'Español', level: 'NATIVE' });

      await call('PATCH', `/profile/languages/${english.id}`, { level: 'C1', notes: 'TOEFL' });
      expect((await getProfile()).languages.map((l) => `${l.language}:${l.level}`)).toEqual([
        'Español:NATIVE',
        'Inglés:C1',
        'Portugués:A2',
      ]);

      expectValidationError(
        await call('POST', '/profile/languages', { language: 'X', level: 'D1' }),
      );
      expect((await call('PATCH', '/profile/languages/nope', { level: 'C2' })).status).toBe(404);
    });
  });
});
