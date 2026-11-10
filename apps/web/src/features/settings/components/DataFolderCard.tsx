import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDesktopActions } from '../../../shared/desktop';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';

type Feedback = 'copied' | 'copyFailed' | 'openFailed' | undefined;

export function DataFolderCard({ dataDir }: { dataDir: string }) {
  const { t } = useTranslation();
  const { openDataFolder } = getDesktopActions();
  const [feedback, setFeedback] = useState<Feedback>();

  async function copy() {
    try {
      await navigator.clipboard.writeText(dataDir);
      setFeedback('copied');
    } catch {
      setFeedback('copyFailed');
    }
  }

  async function open() {
    if (!openDataFolder) return;
    try {
      await openDataFolder();
      setFeedback(undefined);
    } catch {
      setFeedback('openFailed');
    }
  }

  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('settings.data.title')}</h2>
      <p className="mt-1 text-sm text-steel-text">{t('settings.data.description')}</p>

      <p className="mt-4 rounded-control border border-silver-lining bg-cloud-canvas px-4 py-3 font-mono text-[13px] break-all text-charcoal">
        {dataDir}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {openDataFolder && <Button onClick={() => void open()}>{t('settings.data.open')}</Button>}
        <Button variant="secondary" onClick={() => void copy()}>
          {t('settings.data.copy')}
        </Button>
        <p role="status" className="text-sm text-steel-text">
          {feedback && t(`settings.data.${feedback}`)}
        </p>
      </div>
    </Card>
  );
}
