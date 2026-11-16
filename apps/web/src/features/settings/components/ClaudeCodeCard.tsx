import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/form';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import { useClaudeCode, useSetClaudeCode } from '../api/useClaudeCode';

/**
 * Claude with the user's subscription through Claude Code (RF-CONF-14, ADR-24). Optional and
 * experimental: it uses the plan's limits and is for personal use only.
 */
export function ClaudeCodeCard() {
  const { t } = useTranslation();
  const status = useClaudeCode();
  const setEnabled = useSetClaudeCode();

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h2 className="text-section-title text-indigo-navy">{t('settings.claudeCode.title')}</h2>
        <Tag>{t('settings.claudeCode.experimental')}</Tag>
      </div>
      <p className="mt-1 text-sm text-steel-text">{t('settings.claudeCode.description')}</p>

      {status.isPending && (
        <p role="status" className="mt-4 text-sm text-steel-text">
          {t('settings.claudeCode.checking')}
        </p>
      )}
      {status.isError && (
        <InlineError className="mt-4">
          {t('settings.claudeCode.loadError', { message: status.error.message })}
        </InlineError>
      )}

      {status.data && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-control border border-silver-lining bg-cloud-canvas px-4 py-3 text-sm text-slate-ink">
            {status.data.ready ? (
              <p>
                {t('settings.claudeCode.ready', {
                  version: status.data.version ?? '?',
                  authMethod: status.data.authMethod ?? '?',
                })}
              </p>
            ) : (
              <p>
                {t(`settings.claudeCode.problems.${status.data.problem ?? 'CHECK_FAILED'}`, {
                  version: status.data.version ?? '?',
                })}
              </p>
            )}
            {status.data.problem === 'NOT_LOGGED_IN' && (
              <code className="mt-2 block w-fit rounded-control bg-pure-white px-2 py-1 font-mono text-xs">
                claude auth login
              </code>
            )}
          </div>

          <Checkbox
            label={t('settings.claudeCode.use')}
            checked={status.data.enabled}
            disabled={setEnabled.isPending || (!status.data.ready && !status.data.enabled)}
            onChange={(event) => setEnabled.mutate(event.target.checked)}
          />
          {status.data.enabled && (
            <p className="text-sm text-steel-text">{t('settings.claudeCode.enabledNote')}</p>
          )}
          <p className="text-sm text-steel-text">{t('settings.claudeCode.safety')}</p>

          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={status.isFetching}
              onClick={() => void status.refetch()}
            >
              {status.isFetching
                ? t('settings.claudeCode.checking')
                : t('settings.claudeCode.recheck')}
            </Button>
          </div>
        </div>
      )}
      {setEnabled.isError && (
        <InlineError className="mt-3">
          {t('common.saveError', { message: setEnabled.error.message })}
        </InlineError>
      )}
    </Card>
  );
}
