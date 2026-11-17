import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { AiUsageCard } from '../../ai/components/AiUsageCard';
import { PrivacyCard } from '../../telemetry/components/PrivacyCard';
import { useClaudeCode } from '../api/useClaudeCode';
import { useSettings } from '../api/useSettings';
import { AboutCard } from '../components/AboutCard';
import { AiKeyCard } from '../components/AiKeyCard';
import { AiModelsCard } from '../components/AiModelsCard';
import { ClaudeCodeCard } from '../components/ClaudeCodeCard';
import { BackupsCard } from '../components/BackupsCard';
import { DataFolderCard } from '../components/DataFolderCard';
import { LanguageSettingsCard } from '../components/LanguageSettingsCard';

export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const claudeCode = useClaudeCode();

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
          <AiKeyCard backendStatus={settings.data.aiKey} />
          <ClaudeCodeCard />
          {(settings.data.aiKey.configured || claudeCode.data?.enabled) && <AiModelsCard />}
          <AiUsageCard />
          <DataFolderCard dataDir={settings.data.dataDir} />
          <BackupsCard />
          <PrivacyCard />
          <AboutCard appVersion={settings.data.appVersion} />
        </>
      )}
    </div>
  );
}
