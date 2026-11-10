import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useSettings } from '../api/useSettings';
import { DataFolderCard } from '../components/DataFolderCard';
import { LanguageSettingsCard } from '../components/LanguageSettingsCard';

export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettings();

  return (
    <div className="flex max-w-[45rem] flex-col gap-8">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

      {settings.isPending && (
        <p role="status" className="text-sm text-steel-text">
          {t('settings.loading')}
        </p>
      )}

      {settings.isError && (
        <Card>
          <InlineError>{t('settings.loadError', { message: settings.error.message })}</InlineError>
          <Button variant="secondary" className="mt-4" onClick={() => void settings.refetch()}>
            {t('settings.retry')}
          </Button>
        </Card>
      )}

      {settings.data && (
        <>
          <LanguageSettingsCard value={settings.data.preferences.uiLanguage} />
          <DataFolderCard dataDir={settings.data.dataDir} />
        </>
      )}
    </div>
  );
}
