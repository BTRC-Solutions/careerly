import { ProfileSchema, SearchToolsResponseSchema } from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';
import { ProfileChangesService } from './application/profile-changes.service.js';

describe('profile changes of a tailoring session (integration)', () => {
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
    return text ? (JSON.parse(text) as unknown) : undefined;
  }

  const getProfile = async () => ProfileSchema.parse(await call('GET', '/profile'));

  async function toolId(query: string) {
    const { items } = SearchToolsResponseSchema.parse(await call('GET', `/tools?query=${query}`));
    return items[0]!.id;
  }

  /** A profile with one manual position, with a tool and an achievement. */
  async function seedProfile() {
    const go = await toolId('go');
    const position = (await call('POST', '/profile/positions', {
      company: 'Acme',
      title: 'Backend Engineer',
      startDate: '2020-01',
      toolIds: [go],
    })) as { id: string };
    await call('POST', `/profile/positions/${position.id}/achievements`, {
      text: 'Built the payments API',
      toolIds: [],
    });
    return { positionId: position.id, go };
  }

  beforeEach(async () => {
    temp = createTempDir();
    server = await startTestServer(testConfig(temp.dir));
    changes = server.app.get(ProfileChangesService);
  });
  afterEach(async () => {
    await server.close();
    temp.cleanup();
  });

  it('creating from gaps and reverting leaves the profile exactly as it was', async () => {
    const { positionId, go } = await seedProfile();
    const kafka = await toolId('kafka');
    const before = await getProfile();

    const achievement = await changes.createAchievement(
      'session-1',
      { kind: 'position', id: positionId },
      { text: 'Ran the Kafka consumers of the ledger', metrics: null, toolIds: [kafka] },
    );
    await changes.updatePosition('session-1', positionId, { toolIds: [go, kafka] });
    const project = await changes.createProject('session-1', {
      name: 'Event sourcing demo',
      kind: 'PERSONAL',
      role: null,
      url: null,
      startDate: null,
      endDate: null,
      description: null,
      toolIds: [kafka],
    });

    expect(achievement).toMatchObject({ origin: 'GAP_ANSWER', originSessionId: 'session-1' });
    expect(project).toMatchObject({ origin: 'GAP_ANSWER', originSessionId: 'session-1' });
    expect(await getProfile()).not.toEqual(before);

    const plan = await changes.revert('session-1');

    expect(await getProfile()).toEqual(before);
    expect(plan.keptFields).toEqual([]);
    const log = await changes.listChanges('session-1');
    expect(log.map((change) => change.kind)).toEqual(['CREATE', 'UPDATE', 'CREATE']);
    expect(log.every((change) => change.revertedAt !== null)).toBe(true);
  });

  it('reverts one change at a time and keeps what the user edited afterwards', async () => {
    const { positionId, go } = await seedProfile();
    const kafka = await toolId('kafka');

    await changes.updatePosition('session-1', positionId, {
      title: 'Senior Backend Engineer',
      toolIds: [go, kafka],
    });
    const achievement = await changes.createAchievement(
      'session-1',
      { kind: 'position', id: positionId },
      { text: 'Ran the Kafka consumers', metrics: null, toolIds: [] },
    );
    // The user renames the position by hand after the session.
    await call('PATCH', `/profile/positions/${positionId}`, { title: 'Staff Engineer' });

    const [update, creation] = await changes.listChanges('session-1');
    await changes.revert('session-1', [creation!.id]);
    let position = (await getProfile()).positions[0]!;
    expect(position.achievements.map((a) => a.id)).not.toContain(achievement.id);
    expect(position.tools.map((tool) => tool.id).sort()).toEqual([go, kafka].sort());

    const plan = await changes.revert('session-1', [update!.id]);
    position = (await getProfile()).positions[0]!;
    expect(plan.keptFields).toEqual([
      { entity: 'position', entityId: positionId, fields: ['title'] },
    ]);
    expect(position.title).toBe('Staff Engineer');
    expect(position.tools.map((tool) => tool.id)).toEqual([go]);
  });

  it('keeps the log across restarts and leaves other sessions alone', async () => {
    const { positionId } = await seedProfile();
    const parent = { kind: 'position' as const, id: positionId };
    const draft = { metrics: null, toolIds: [] };
    await changes.createAchievement('session-1', parent, { text: 'From session 1', ...draft });
    await changes.createAchievement('session-2', parent, { text: 'From session 2', ...draft });

    await server.close();
    server = await startTestServer(testConfig(temp.dir));
    changes = server.app.get(ProfileChangesService);
    await changes.revert('session-1');

    const texts = (await getProfile()).positions[0]!.achievements.map((a) => a.text);
    expect(texts).toEqual(['Built the payments API', 'From session 2']);
  });

  it('rejects reverting a change of another session', async () => {
    const { positionId } = await seedProfile();
    await changes.createAchievement(
      'session-1',
      { kind: 'position', id: positionId },
      { text: 'From session 1', metrics: null, toolIds: [] },
    );
    const [change] = await changes.listChanges('session-1');

    await expect(changes.revert('session-2', [change!.id])).rejects.toThrow(
      'Profile change not found.',
    );
  });
});
