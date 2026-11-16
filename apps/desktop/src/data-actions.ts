import {
  BackupSchema,
  DELETE_ALL_DATA_CONFIRMATION,
  RestoreBackupResponseSchema,
  type RestoreBackupResponse,
} from '@careerly/contracts';

/** Native side of backups and data deletion (RF-CONF-04, RF-CONF-05). No `electron` import: testable. */
export interface DataActionsDeps {
  apiBaseUrl: string;
  apiToken: string;
  /** Native "Save as…" dialog; `undefined` when cancelled. */
  chooseSavePath: (defaultFileName: string) => Promise<string | undefined>;
  /** Native "Open…" dialog for `.careerly-backup` files; `undefined` when cancelled. */
  chooseBackupFile: () => Promise<string | undefined>;
  copyFile: (from: string, to: string) => Promise<void>;
  /** Deletes every saved AI key (`secrets.bin`) and tells the backend there is none. */
  clearAiKeys: () => Promise<void>;
  fetch?: typeof fetch;
}

export type ExportResult = { status: 'saved'; path: string } | { status: 'cancelled' };
export type RestoreResult =
  { status: 'restored'; restored: RestoreBackupResponse['restored'] } | { status: 'cancelled' };

export class DataActions {
  private readonly fetch: typeof fetch;

  constructor(private readonly deps: DataActionsDeps) {
    this.fetch = deps.fetch ?? fetch;
  }

  /**
   * Creates a backup in the data folder and copies it where the user chooses. The renderer never
   * passes paths: main asks the API for the file and only copies that one.
   */
  async exportBackup(): Promise<ExportResult> {
    const backup = BackupSchema.parse(await this.call('POST', '/backups'));
    const target = await this.deps.chooseSavePath(backup.fileName);
    if (!target) return { status: 'cancelled' };
    await this.deps.copyFile(backup.path, target);
    return { status: 'saved', path: target };
  }

  /** Lets the user pick an archive and restores it (the API validates it before changing anything). */
  async restoreFromFile(): Promise<RestoreResult> {
    const file = await this.deps.chooseBackupFile();
    if (!file) return { status: 'cancelled' };
    const response = RestoreBackupResponseSchema.parse(
      await this.call('POST', '/backups/restore', { path: file }),
    );
    return { status: 'restored', restored: response.restored };
  }

  /**
   * Deletes all local data: database, files and backups (API), then the AI keys (`secrets.bin`).
   * The keys go last so a failed deletion does not leave the user without them for nothing.
   */
  async deleteAllData(): Promise<void> {
    await this.call('DELETE', '/data', { confirmation: DELETE_ALL_DATA_CONFIRMATION });
    await this.deps.clearAiKeys();
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this.fetch(`${this.deps.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.deps.apiToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const message = (json as { error?: { message?: unknown } } | undefined)?.error?.message;
      throw new Error(
        typeof message === 'string' ? message : `Request failed (${response.status}).`,
      );
    }
    return json;
  }
}
