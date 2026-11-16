import {
  BackupSchema,
  DELETE_ALL_DATA_CONFIRMATION,
  ListBackupsResponseSchema,
  RestoreBackupResponseSchema,
} from '@careerly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet, apiPost, apiRequest } from '../../../shared/api/client';
import { getDesktopActions } from '../../../shared/desktop';

/*
 * Backups and data deletion (RF-CONF-04, RF-CONF-05). Inside Electron, exporting, restoring from a
 * file and deleting go through main (native dialogs, and the AI keys are deleted too). Restoring one
 * of the backups listed by the API works in both modes.
 */

const BACKUPS_QUERY_KEY = ['backups'] as const;

export function useBackups() {
  return useQuery({
    queryKey: BACKUPS_QUERY_KEY,
    queryFn: () => apiGet('/backups', ListBackupsResponseSchema),
  });
}

/** `saved` (copied where the user chose), `created` (left in the data folder) or `cancelled`. */
export type ExportOutcome = { status: 'saved' | 'created'; path: string } | { status: 'cancelled' };

export function useExportBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ExportOutcome> => {
      const data = getDesktopActions().data;
      if (data) return data.exportBackup();
      const backup = await apiPost('/backups', BackupSchema, undefined);
      return { status: 'created', path: backup.path };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY }),
  });
}

/**
 * Restores a listed backup (`path`) or, without one, lets the user pick a file (desktop only).
 * Everything in the interface comes from the restored data afterwards, so every query is refreshed.
 */
export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path?: string) => {
      if (path !== undefined) {
        const response = await apiPost('/backups/restore', RestoreBackupResponseSchema, { path });
        return { status: 'restored' as const, restored: response.restored };
      }
      const data = getDesktopActions().data;
      if (!data) throw new Error('Restoring from a file is only available in the desktop app.');
      return data.restoreBackup();
    },
    onSuccess: (result) => {
      // Reset (not just invalidate): nothing may render with data from before the restore.
      if (result.status === 'restored') return queryClient.resetQueries();
    },
  });
}

/** Deletes all local data. Afterwards the app starts over (the first-run wizard shows again). */
export function useDeleteAllData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const data = getDesktopActions().data;
      if (data) return data.deleteAll();
      await apiRequest('DELETE', '/data', z.unknown(), {
        confirmation: DELETE_ALL_DATA_CONFIRMATION,
      });
    },
    // Reset (not just invalidate): the first-run wizard must not be built from cached answers.
    onSuccess: () => queryClient.resetQueries(),
  });
}
