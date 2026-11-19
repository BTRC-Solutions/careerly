import {
  ProfileSchema,
  RevertProfileChangesResultSchema,
  SearchToolsResponseSchema,
  SessionProfileChangesSchema,
} from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';
import { ProfileChangesService } from '../profile/index.js';
import { TailoringSessionRepository } from './application/tailoring.ports.js';

/*
 * Undoing what a tailoring session changed in the master profile (roadmap 5.7, RF-TAIL-06), all at once and one
 * by one, through the HTTP API. The session's writes go through the profile module's service, as gap answers will.
 */

const SESSION = 'session-1';

describe('profile changes of a tailoring session over HTTP (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer;
  let changes: ProfileChangesService;

  async function call(method: string, path: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : undefined };
  }

  const getProfile = async () => ProfileSchema.parse((await call('GET', '/profile')).body);
  const listChanges = async (session = SESSION) =>
    SessionProfileChangesSchema.parse(
      (await call('GET', `/tailoring-sessions/${session}/profile-changes`)).body,
    ).changes;
  const revert = async (body: unknown = {}) => {
    const response = await call(
      'POST',
      `/tailoring-sessions/${SESSION}/revert-profile-changes`,
      body,
    );
    expect(response.status).toBe(200);
    return RevertProfileChangesResultSchema.parse(response.body);
  };

  async function toolId(query: string) {
    const { items } = SearchToolsResponseSchema.parse(
      (await call('GET', `/tools?query=${query}`)).body,
    );
    return items[0]!.id;
  }

  async function saveSession(id: string) {
    const now = new Date().toISOString();
    await server.app.get(TailoringSessionRepository).save({
      id,
      jobPostingId: 'posting-1',
      languages: ['es'],
      pageBudget: 1,
      templateId: 'classic',
      status: 'AWAITING_ANSWERS',
      failedStep: null,
      match: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** A manual position with Go; the session adds Kafka to it, an achievement under it and a project. */
  async function seed() {
    const [go, kafka] = [await toolId('go'), await toolId('kafka')];
    const { body } = await call('POST', '/profile/positions', {
      company: 'Acme',
      title: 'Backend Engineer',
      startDate: '2020-01',
      toolIds: [go],
    });
    const positionId = (body as { id: string }).id;
    const before = await getProfile();

    const achievement = await changes.createAchievement(
      SESSION,
      { kind: 'position', id: positionId },
      { text: 'Ran the Kafka consumers of the ledger', metrics: null, toolIds: [kafka] },
    );
    await changes.updatePosition(SESSION, positionId, { toolIds: [go, kafka] });
    const project = await changes.createProject(SESSION, {
      name: 'Event sourcing demo',
      kind: 'PERSONAL',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      toolIds: [kafka],
    });
    return { before, positionId, achievementId: achievement.id, projectId: project.id };
  }

  beforeEach(async () => {
    temp = createTempDir();
    server = await startTestServer(testConfig(temp.dir));
    changes = server.app.get(ProfileChangesService);
    await saveSession(SESSION);
  });
  afterEach(async () => {
    await server.close();
    temp.cleanup();
  });

  it('lists the changes and undoes them all, leaving the profile as it was', async () => {
    const { before, positionId, achievementId, projectId } = await seed();

    expect(await listChanges()).toEqual([
      expect.objectContaining({ entity: 'ACHIEVEMENT', entityId: achievementId, kind: 'CREATE' }),
      expect.objectContaining({ entity: 'POSITION', entityId: positionId, kind: 'UPDATE' }),
      expect.objectContaining({ entity: 'PROJECT', entityId: projectId, kind: 'CREATE' }),
    ]);

    const result = await revert();
    expect(result.keptFields).toEqual([]);
    expect(result.changes.every((change) => change.revertedAt !== null)).toBe(true);
    expect(await getProfile()).toEqual(before);

    // Nothing left to undo: a second call changes nothing.
    expect((await revert()).changes).toEqual(result.changes);
  });

  it('undoes one change and leaves the rest', async () => {
    const { positionId, projectId } = await seed();
    const update = (await listChanges()).find((change) => change.kind === 'UPDATE')!;

    const result = await revert({ changeIds: [update.id] });
    expect(result.changes.filter((change) => change.revertedAt !== null)).toEqual([
      expect.objectContaining({ id: update.id }),
    ]);

    const profile = await getProfile();
    const position = profile.positions.find((p) => p.id === positionId)!;
    expect(position.tools.map((tool) => tool.name)).toEqual(['Go']);
    expect(position.achievements).toHaveLength(1);
    expect(profile.projects.map((project) => project.id)).toEqual([projectId]);
  });

  it('keeps what the user edited after the session', async () => {
    const { positionId } = await seed();
    const kafka = await toolId('kafka');
    await call('PATCH', `/profile/positions/${positionId}`, { toolIds: [kafka] });

    const { keptFields } = await revert();
    expect(keptFields).toEqual([{ entity: 'POSITION', entityId: positionId, fields: ['toolIds'] }]);
    const position = (await getProfile()).positions.find((p) => p.id === positionId)!;
    expect(position.tools.map((tool) => tool.name)).toEqual(['Apache Kafka']);
  });

  it('rejects unknown sessions and changes from another session', async () => {
    await seed();
    await saveSession('session-2');
    const other = await changes.createProject('session-2', {
      name: 'Other',
      kind: 'PERSONAL',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      toolIds: [],
    });
    const otherChange = (await listChanges('session-2'))[0]!;
    expect(otherChange.entityId).toBe(other.id);

    expect((await call('GET', '/tailoring-sessions/nope/profile-changes')).status).toBe(404);
    expect((await call('POST', '/tailoring-sessions/nope/revert-profile-changes', {})).status).toBe(
      404,
    );
    const foreign = await call('POST', `/tailoring-sessions/${SESSION}/revert-profile-changes`, {
      changeIds: [otherChange.id],
    });
    expect(foreign.status).toBe(404);
    expect(
      (
        await call('POST', `/tailoring-sessions/${SESSION}/revert-profile-changes`, {
          changeIds: [],
        })
      ).status,
    ).toBe(400);

    // Nothing was undone.
    expect((await listChanges()).every((change) => change.revertedAt === null)).toBe(true);
    expect((await getProfile()).projects.map((project) => project.name)).toContain('Other');
  });
});
