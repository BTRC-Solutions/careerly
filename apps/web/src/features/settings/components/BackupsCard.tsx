import type { Backup } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDesktopActions } from '../../../shared/desktop';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { InlineError } from '../../../shared/ui/InlineError';
import { useBackups, useDeleteAllData, useExportBackup, useRestoreBackup } from '../api/useBackups';

/** What the restore confirmation applies to: a file picked with the dialog or a listed backup. */
type RestoreTarget = { kind: 'file' } | { kind: 'listed'; backup: Backup };

/**
 * Backups, restore and deletion of all local data (RF-CONF-04, RF-CONF-05). Restoring and deleting
 * replace or remove everything, so both ask for explicit confirmation.
 */
export function BackupsCard() {
  const { t, i18n } = useTranslation();
  const isDesktop = getDesktopActions().data !== undefined;
  const backups = useBackups();
  const exportBackup = useExportBackup();
  const restore = useRestoreBackup();
  const deleteAll = useDeleteAllData();
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string>();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  async function runExport() {
    setMessage(undefined);
    const result = await exportBackup.mutateAsync();
    if (result.status === 'saved') setMessage(t('settings.backups.saved', { path: result.path }));
    if (result.status === 'created')
      setMessage(t('settings.backups.created', { path: result.path }));
  }

  async function runRestore(target: RestoreTarget) {
    setMessage(undefined);
    const result = await restore.mutateAsync(
      target.kind === 'listed' ? target.backup.path : undefined,
    );
    if (result.status === 'restored') {
      setMessage(
        t('settings.backups.restored', {
          date: formatDate(result.restored.createdAt),
          version: result.restored.appVersion,
        }),
      );
    }
  }

  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('settings.backups.title')}</h2>
      <p className="mt-1 text-sm text-steel-text">{t('settings.backups.description')}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={exportBackup.isPending} onClick={() => void runExport().catch(() => {})}>
          {exportBackup.isPending ? t('settings.backups.exporting') : t('settings.backups.export')}
        </Button>
        {isDesktop && (
          <Button variant="secondary" onClick={() => setRestoreTarget({ kind: 'file' })}>
            {t('settings.backups.restoreFromFile')}
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-steel-text">{t('settings.backups.personalDataWarning')}</p>

      <p role="status" className="mt-3 text-sm break-all text-slate-ink">
        {message}
      </p>
      {(exportBackup.isError || restore.isError) && (
        <InlineError className="mt-2">
          {t('settings.backups.actionError', {
            message: (exportBackup.error ?? restore.error)?.message,
          })}
        </InlineError>
      )}

      <h3 className="mt-6 text-sm font-medium text-indigo-navy">
        {t('settings.backups.listTitle')}
      </h3>
      {backups.isError && <InlineError className="mt-2">{backups.error.message}</InlineError>}
      {backups.data?.backups.length === 0 && (
        <p className="mt-1 text-sm text-steel-text">{t('settings.backups.listEmpty')}</p>
      )}
      {backups.data && backups.data.backups.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-silver-lining rounded-control border border-silver-lining">
          {backups.data.backups.map((backup) => (
            <li key={backup.path} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-ink">{formatDate(backup.createdAt)}</p>
                <p className="text-sm text-steel-text">
                  {t('settings.backups.details', {
                    version: backup.appVersion,
                    size: (backup.sizeBytes / 1024 / 1024).toFixed(1),
                    files: backup.fileCount,
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRestoreTarget({ kind: 'listed', backup })}
              >
                {t('settings.backups.restore')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-silver-lining pt-4">
        <h3 className="text-sm font-medium text-indigo-navy">
          {t('settings.backups.deleteTitle')}
        </h3>
        <p className="mt-1 text-sm text-steel-text">{t('settings.backups.deleteDescription')}</p>
        <Button variant="secondary" className="mt-3" onClick={() => setConfirmingDelete(true)}>
          {t('settings.backups.delete')}
        </Button>
      </div>

      <ConfirmDialog
        open={restoreTarget !== undefined}
        onOpenChange={(open) => !open && setRestoreTarget(undefined)}
        title={t('settings.backups.restoreTitle')}
        description={t('settings.backups.restoreDescription')}
        confirmLabel={
          restoreTarget?.kind === 'file'
            ? t('settings.backups.chooseFile')
            : t('settings.backups.restore')
        }
        onConfirm={() => runRestore(restoreTarget!)}
      />
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t('settings.backups.deleteConfirmTitle')}
        description={t('settings.backups.deleteConfirmDescription')}
        confirmLabel={t('settings.backups.deleteConfirm')}
        onConfirm={() => deleteAll.mutateAsync()}
      />
    </Card>
  );
}
