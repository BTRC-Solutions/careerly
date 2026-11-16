import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  BackupSchema,
  ListBackupsResponseSchema,
  RestoreBackupResponseSchema,
} from '@careerly/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const PDF_BYTES = Buffer.from('%PDF-1.7\n% fake snapshot\n\u0000ÿ binary tail');

describe('backups and data deletion (integration)', () => {
  let temps: ReturnType<typeof createTempDir>[];
  let servers: RunningServer[];

  async function install() {
    const temp = createTempDir();
    temps.push(temp);
    const config = testConfig(temp.dir);
    const server = await startTestServer(config);
    servers.push(server);

    async function call(method: Method, url: string, body?: unknown) {
      const response = await fetch(`http://127.0.0.1:${server.port}${url}`, {
        method,
        headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? (JSON.parse(text) as unknown) : undefined };
    }

    /** Everything a user would see: preferences, the whole profile and their own tools. */
    async function snapshot() {
      const [settings, profile, tools] = await Promise.all([
        call('GET', '/settings'),
        call('GET', '/profile'),
        call('GET', '/tools?query=Careerly%20Internal%20Tool'),
      ]);
      return {
        preferences: (settings.body as { preferences: unknown }).preferences,
        profile: profile.body,
        tools: tools.body,
      };
    }

    return { config, call, snapshot };
  }

  async function fillWithData(app: Awaited<ReturnType<typeof install>>) {
    expect((await app.call('PATCH', '/settings', { uiLanguage: 'en' })).status).toBe(200);
    expect(
      (
        await app.call('PATCH', '/profile/personal-info', {
          firstNames: 'Ada',
          lastNames: 'Lovelace',
        })
      ).status,
    ).toBe(200);
    const tool = await app.call('POST', '/tools', { name: 'Careerly Internal Tool' });
    expect(tool.status).toBe(201);
    const position = await app.call('POST', '/profile/positions', {
      company: 'Acme',
      title: 'Backend Engineer',
      startDate: '2020-01',
    });
    expect(position.status).toBe(201);
    const positionId = (position.body as { id: string }).id;
    const achievement = await app.call('POST', `/profile/positions/${positionId}/achievements`, {
      text: 'Cut p95 latency by 40%',
      toolIds: [(tool.body as { tool: { id: string } }).tool.id],
    });
    expect(achievement.status).toBe(201);

    const pdf = path.join(app.config.filesDir, 'snapshots', 'resume-1.pdf');
    fs.mkdirSync(path.dirname(pdf), { recursive: true });
    fs.writeFileSync(pdf, PDF_BYTES);
  }

  async function createBackup(app: Awaited<ReturnType<typeof install>>) {
    const response = await app.call('POST', '/backups');
    expect(response.status).toBe(201);
    return BackupSchema.parse(response.body);
  }

  beforeEach(() => {
    temps = [];
    servers = [];
  });

  afterEach(async () => {
    for (const server of servers) await server.close();
    for (const temp of temps) temp.cleanup();
  });

  it('restoring a backup on a clean install leaves everything the same', async () => {
    const original = await install();
    await fillWithData(original);
    const before = await original.snapshot();

    const backup = await createBackup(original);
    expect(backup).toMatchObject({ fileCount: 1, appVersion: '0.0.0-dev' });
    expect(backup.fileName).toMatch(/^careerly-.+\.careerly-backup$/);
    expect(backup.path.startsWith(path.join(original.config.backupsDir, 'manual'))).toBe(true);

    const listed = ListBackupsResponseSchema.parse((await original.call('GET', '/backups')).body);
    expect(listed.backups).toEqual([backup]);

    // A different machine: a fresh install that receives the backup file.
    const fresh = await install();
    const copied = path.join(
      fresh.config.dataDir,
      '..',
      `${path.basename(fresh.config.dataDir)}-incoming.careerly-backup`,
    );
    fs.copyFileSync(backup.path, copied);
    temps.push({ dir: copied, cleanup: () => fs.rmSync(copied, { force: true }) });

    const restored = await fresh.call('POST', '/backups/restore', { path: copied });
    expect(restored.status).toBe(200);
    expect(RestoreBackupResponseSchema.parse(restored.body).restored).toEqual({
      createdAt: backup.createdAt,
      appVersion: backup.appVersion,
      fileCount: 1,
    });

    expect(await fresh.snapshot()).toEqual(before);
    expect(fs.readFileSync(path.join(fresh.config.filesDir, 'snapshots', 'resume-1.pdf'))).toEqual(
      PDF_BYTES,
    );
    // The restored database keeps working: writes, the shipped tool catalog and health.
    expect((await fresh.call('PATCH', '/settings', { uiLanguage: 'es' })).status).toBe(200);
    expect(JSON.stringify((await fresh.call('GET', '/tools?query=postgres')).body)).toContain(
      'PostgreSQL',
    );
    expect((await fresh.call('GET', '/health')).status).toBe(200);
    // The previous (empty) database is kept as a safety copy.
    expect(
      fs.readdirSync(fresh.config.backupsDir).filter((name) => name.endsWith('-pre-restore.db')),
    ).toHaveLength(1);
  });

  it('the backup is a single self-contained file without WAL companions or internal tables left behind', async () => {
    const app = await install();
    await fillWithData(app);
    const backup = await createBackup(app);

    const siblings = fs.readdirSync(path.dirname(backup.path));
    expect(siblings).toEqual([backup.fileName]);

    await app.call('POST', '/backups/restore', { path: backup.path });
    const db = new DatabaseSync(app.config.databaseFile, { readOnly: true });
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '__careerly_backup%'`,
      )
      .all();
    db.close();
    expect(tables).toEqual([]);
  });

  describe('rejected restores change nothing', () => {
    async function expectRejected(
      app: Awaited<ReturnType<typeof install>>,
      file: string,
      status: number,
      message: RegExp,
    ) {
      const before = await app.snapshot();
      const response = await app.call('POST', '/backups/restore', { path: file });
      expect(response.status).toBe(status);
      expect((response.body as { error: { message: string } }).error.message).toMatch(message);
      expect(await app.snapshot()).toEqual(before);
    }

    it('a missing file', async () => {
      const app = await install();
      await fillWithData(app);
      await expectRejected(
        app,
        path.join(app.config.dataDir, 'nope.careerly-backup'),
        404,
        /does not exist/,
      );
    });

    it('a file that is not a backup (text or a plain SQLite database)', async () => {
      const app = await install();
      await fillWithData(app);
      const text = path.join(app.config.dataDir, 'notes.careerly-backup');
      fs.writeFileSync(text, 'hello');
      await expectRejected(app, text, 400, /not a Careerly backup/);
      await expectRejected(app, app.config.databaseFile, 400, /not a Careerly backup/);
    });

    it('a backup created by a newer version of the app', async () => {
      const app = await install();
      await fillWithData(app);
      const backup = await createBackup(app);
      const db = new DatabaseSync(backup.path);
      db.prepare('INSERT INTO __careerly_migrations (tag, applied_at) VALUES (?, ?)').run(
        '9999_from_the_future',
        new Date().toISOString(),
      );
      db.close();
      await expectRejected(app, backup.path, 400, /newer version/);
    });

    it('a backup with a file path that escapes the files folder', async () => {
      const app = await install();
      await fillWithData(app);
      const backup = await createBackup(app);
      const db = new DatabaseSync(backup.path);
      db.prepare('INSERT INTO __careerly_backup_files (path, content) VALUES (?, ?)').run(
        '../../evil.txt',
        Buffer.from('x'),
      );
      db.close();
      await expectRejected(app, backup.path, 400, /invalid file path/);
    });

    it('a backup whose migrations fail: the previous data and files are put back', async () => {
      const app = await install();
      await fillWithData(app);
      const backup = await createBackup(app);
      // Forget the last migration, so restoring re-applies it on a schema that already has it.
      const db = new DatabaseSync(backup.path);
      db.prepare(
        'DELETE FROM __careerly_migrations WHERE tag = (SELECT MAX(tag) FROM __careerly_migrations)',
      ).run();
      db.close();
      fs.writeFileSync(path.join(app.config.filesDir, 'snapshots', 'resume-2.pdf'), PDF_BYTES);

      await expectRejected(app, backup.path, 400, /could not be upgraded/);
      expect(fs.readdirSync(path.join(app.config.filesDir, 'snapshots')).sort()).toEqual([
        'resume-1.pdf',
        'resume-2.pdf',
      ]);
      expect((await app.call('PATCH', '/settings', { uiLanguage: 'es' })).status).toBe(200);
    });

    it('a relative path', async () => {
      const app = await install();
      const response = await app.call('POST', '/backups/restore', {
        path: 'backup.careerly-backup',
      });
      expect(response.status).toBe(400);
    });
  });

  it('DELETE /data requires the explicit confirmation', async () => {
    const app = await install();
    await fillWithData(app);
    const before = await app.snapshot();

    for (const body of [undefined, {}, { confirmation: 'yes' }]) {
      expect((await app.call('DELETE', '/data', body)).status).toBe(400);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it('DELETE /data removes the database contents, generated files and backups', async () => {
    const app = await install();
    await fillWithData(app);
    await createBackup(app);

    const response = await app.call('DELETE', '/data', { confirmation: 'DELETE_ALL_DATA' });
    expect(response.status).toBe(204);

    const after = await app.snapshot();
    expect(after.preferences).toEqual({ uiLanguage: null });
    expect(after.tools).toEqual((await (await install()).snapshot()).tools);
    expect((after.profile as { positions: unknown[] }).positions).toEqual([]);
    expect(fs.existsSync(app.config.filesDir)).toBe(false);
    expect(fs.existsSync(app.config.backupsDir)).toBe(false);
    expect(
      ListBackupsResponseSchema.parse((await app.call('GET', '/backups')).body).backups,
    ).toEqual([]);
    // The app keeps working on the new, empty database, with the shipped tool catalog.
    expect(JSON.stringify((await app.call('GET', '/tools?query=postgres')).body)).toContain(
      'PostgreSQL',
    );
    expect((await app.call('PATCH', '/settings', { uiLanguage: 'es' })).status).toBe(200);
  });
});
