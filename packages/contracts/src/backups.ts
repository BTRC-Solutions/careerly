import { z } from 'zod';

/** A backup archive of all local data: database + generated PDFs (RF-CONF-04). Never contains the API key. */
export const BackupSchema = z.object({
  /** Absolute path of the archive. */
  path: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  /** App version that created it. */
  appVersion: z.string(),
  /** Number of generated files (PDFs) inside. */
  fileCount: z.number().int().nonnegative(),
});
export type Backup = z.infer<typeof BackupSchema>;

/** `GET /backups` response: manual backups in the data folder, newest first. */
export const ListBackupsResponseSchema = z.object({
  backups: z.array(BackupSchema),
});
export type ListBackupsResponse = z.infer<typeof ListBackupsResponseSchema>;

/**
 * `POST /backups/restore` body. `path` is an absolute path, usually picked with the native file dialog.
 * Restoring replaces all local data; the previous database is kept as a safety copy.
 */
export const RestoreBackupRequestSchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(1)
      .refine((value) => /^([a-zA-Z]:[\\/]|[\\/])/.test(value), 'The path must be absolute.'),
  })
  .strict();
export type RestoreBackupRequest = z.infer<typeof RestoreBackupRequestSchema>;

/** `POST /backups/restore` response: what was restored. */
export const RestoreBackupResponseSchema = z.object({
  restored: z.object({
    createdAt: z.iso.datetime(),
    appVersion: z.string(),
    fileCount: z.number().int().nonnegative(),
  }),
});
export type RestoreBackupResponse = z.infer<typeof RestoreBackupResponseSchema>;

/** Text the client must send to `DELETE /data` (RF-CONF-05: explicit confirmation). */
export const DELETE_ALL_DATA_CONFIRMATION = 'DELETE_ALL_DATA';

/** `DELETE /data` body. Deletes the database, generated files and backups; the API key is handled by Electron. */
export const DeleteAllDataRequestSchema = z
  .object({ confirmation: z.literal(DELETE_ALL_DATA_CONFIRMATION) })
  .strict();
export type DeleteAllDataRequest = z.infer<typeof DeleteAllDataRequestSchema>;
