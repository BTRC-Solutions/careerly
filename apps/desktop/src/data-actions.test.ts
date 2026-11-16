import { describe, expect, it } from 'vitest';
import { DataActions, type DataActionsDeps } from './data-actions.js';

const BACKUP = {
  path: 'C:\\Users\\me\\AppData\\Roaming\\Careerly\\backups\\manual\\careerly-x.careerly-backup',
  fileName: 'careerly-x.careerly-backup',
  sizeBytes: 1024,
  createdAt: '2026-11-16T18:00:00.000Z',
  appVersion: '0.0.1',
  fileCount: 2,
};

interface Call {
  method: string;
  path: string;
  body: unknown;
  auth: string;
}

function setup(
  responses: { status: number; body?: unknown }[],
  overrides: Partial<DataActionsDeps> = {},
) {
  const calls: Call[] = [];
  const events: string[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      path: url.replace('http://api', ''),
      body: init.body ? JSON.parse(init.body as string) : undefined,
      auth: (init.headers as Record<string, string>).Authorization!,
    });
    events.push(`api ${String(init.method)} ${url.replace('http://api', '')}`);
    const next = responses.shift() ?? { status: 204 };
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
    });
  }) as unknown as typeof fetch;

  const actions = new DataActions({
    apiBaseUrl: 'http://api',
    apiToken: 'ui-token',
    chooseSavePath: async (name) => `D:\\Backups\\${name}`,
    chooseBackupFile: async () => 'D:\\Backups\\old.careerly-backup',
    copyFile: async (from, to) => {
      events.push(`copy ${from} -> ${to}`);
    },
    clearAiKeys: async () => {
      events.push('clear keys');
    },
    fetch: fetchImpl,
    ...overrides,
  });
  return { actions, calls, events };
}

describe('DataActions', () => {
  it('exports: creates the backup through the API and copies that file where the user chose', async () => {
    const { actions, calls, events } = setup([{ status: 201, body: BACKUP }]);
    expect(await actions.exportBackup()).toEqual({
      status: 'saved',
      path: 'D:\\Backups\\careerly-x.careerly-backup',
    });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/backups', auth: 'Bearer ui-token' });
    expect(events.at(-1)).toBe(`copy ${BACKUP.path} -> D:\\Backups\\careerly-x.careerly-backup`);
  });

  it('exports: cancelling the dialog copies nothing', async () => {
    const { actions, events } = setup([{ status: 201, body: BACKUP }], {
      chooseSavePath: async () => undefined,
    });
    expect(await actions.exportBackup()).toEqual({ status: 'cancelled' });
    expect(events.some((event) => event.startsWith('copy'))).toBe(false);
  });

  it('restores the chosen file and reports what was restored', async () => {
    const restored = { createdAt: BACKUP.createdAt, appVersion: '0.0.1', fileCount: 2 };
    const { actions, calls } = setup([{ status: 200, body: { restored } }]);
    expect(await actions.restoreFromFile()).toEqual({ status: 'restored', restored });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/backups/restore',
      body: { path: 'D:\\Backups\\old.careerly-backup' },
    });
  });

  it('restore: cancelling the dialog calls nothing', async () => {
    const { actions, calls } = setup([], { chooseBackupFile: async () => undefined });
    expect(await actions.restoreFromFile()).toEqual({ status: 'cancelled' });
    expect(calls).toEqual([]);
  });

  it('restore: shows the API message when the backup is rejected', async () => {
    const { actions } = setup([
      {
        status: 400,
        body: {
          error: { code: 'VALIDATION_FAILED', message: 'The file is not a Careerly backup.' },
        },
      },
    ]);
    await expect(actions.restoreFromFile()).rejects.toThrow('The file is not a Careerly backup.');
  });

  it('deletes all data with the explicit confirmation, then the AI keys', async () => {
    const { actions, calls, events } = setup([{ status: 204 }]);
    await actions.deleteAllData();
    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      path: '/data',
      body: { confirmation: 'DELETE_ALL_DATA' },
    });
    expect(events).toEqual(['api DELETE /data', 'clear keys']);
  });

  it('keeps the AI keys if deleting the data fails', async () => {
    const { actions, events } = setup([
      { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error.' } } },
    ]);
    await expect(actions.deleteAllData()).rejects.toThrow('Unexpected error.');
    expect(events).not.toContain('clear keys');
  });
});
