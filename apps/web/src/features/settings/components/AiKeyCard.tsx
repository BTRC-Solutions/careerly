import {
  AiApiKeySchema,
  type AiKeysStatus,
  type AiKeyStatus,
  type AiProvider,
} from '@careerly/contracts';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '../../../shared/lib/useOnline';
import { getDesktopActions } from '../../../shared/desktop';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Field, Input, Select } from '../../../shared/ui/form';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import {
  afterVerification,
  useAiKeysStatus,
  useRemoveAiKey,
  useSaveAiKey,
  useSetActiveAiProvider,
  useVerifyAiKey,
} from '../api/useAiKeys';

interface ProviderInfo {
  id: AiProvider;
  name: string;
  /** Where to create a key. */
  keyUrl: string;
  /** `false` until its adapter exists (ADR-23: Gemini first, Claude next). */
  available: boolean;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    available: true,
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    available: true,
  },
];

const providerName = (id: AiProvider | null) =>
  PROVIDERS.find((provider) => provider.id === id)?.name ?? '';

/**
 * AI provider and API key (RF-CONF-01, RF-CONF-02, ADR-23). Keys are verified by the backend
 * and saved encrypted by Electron's main process; this card can never read a saved key back.
 */
export function AiKeyCard({
  backendStatus,
}: {
  /** What the backend holds right now (`GET /settings`), used when not running in Electron. */
  backendStatus: { configured: boolean; provider: AiProvider | null };
}) {
  const { t } = useTranslation();
  const isDesktop = getDesktopActions().aiKeys !== undefined;

  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('settings.ai.title')}</h2>
      <p className="mt-1 text-sm text-steel-text">{t('settings.ai.description')}</p>

      {isDesktop ? (
        <DesktopAiKeys />
      ) : (
        <div className="mt-4 rounded-control border border-silver-lining bg-cloud-canvas px-4 py-3 text-sm text-slate-ink">
          <p>{t('settings.ai.desktopOnly')}</p>
          <p className="mt-1 text-steel-text">
            {backendStatus.configured
              ? t('settings.ai.backendHasKey', { provider: providerName(backendStatus.provider) })
              : t('settings.ai.backendHasNoKey')}
          </p>
        </div>
      )}
    </Card>
  );
}

function DesktopAiKeys() {
  const { t } = useTranslation();
  const status = useAiKeysStatus();

  if (status.isPending) {
    return (
      <p role="status" className="mt-4 text-sm text-steel-text">
        {t('settings.ai.loading')}
      </p>
    );
  }
  if (status.isError) {
    return (
      <InlineError className="mt-4">
        {t('settings.ai.statusError', { message: status.error.message })}
      </InlineError>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-6">
      {!status.data.secureStorageAvailable && (
        <InlineError>{t('settings.ai.noSecureStorage')}</InlineError>
      )}
      <ProviderList status={status.data} />
      {status.data.secureStorageAvailable && <AddKeyForm status={status.data} />}
    </div>
  );
}

/** Saved keys per provider: which one is active, verify it, switch or remove. */
function ProviderList({ status }: { status: AiKeysStatus }) {
  const { t } = useTranslation();
  const verify = useVerifyAiKey();
  const online = useOnline();
  const setActive = useSetActiveAiProvider();
  const remove = useRemoveAiKey();
  const [toRemove, setToRemove] = useState<ProviderInfo>();

  return (
    <div>
      <ul className="flex flex-col divide-y divide-silver-lining rounded-control border border-silver-lining">
        {PROVIDERS.map((provider) => {
          const configured = status.configured[provider.id];
          const active = status.activeProvider === provider.id;
          return (
            <li key={provider.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-ink">{provider.name}</p>
                {active && verify.data && (
                  <VerificationMessage status={verify.data.status} provider={provider.name} />
                )}
              </div>
              <Tag>
                {!provider.available
                  ? t('settings.ai.comingSoon')
                  : active
                    ? t('settings.ai.active')
                    : configured
                      ? t('settings.ai.saved')
                      : t('settings.ai.noKey')}
              </Tag>
              <div className="flex shrink-0 gap-1">
                {active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={verify.isPending || !online}
                    title={online ? undefined : t('ai.offlineHint')}
                    onClick={() => verify.mutate({})}
                  >
                    {verify.isPending ? t('settings.ai.verifying') : t('settings.ai.verify')}
                  </Button>
                )}
                {configured && !active && provider.available && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate(provider.id)}
                  >
                    {t('settings.ai.use')}
                  </Button>
                )}
                {configured && (
                  <Button variant="ghost" size="sm" onClick={() => setToRemove(provider)}>
                    {t('settings.ai.remove')}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {(verify.isError || setActive.isError) && (
        <InlineError className="mt-3">
          {t('settings.ai.actionError', {
            message: (verify.error ?? setActive.error)?.message,
          })}
        </InlineError>
      )}

      <ConfirmDialog
        open={toRemove !== undefined}
        onOpenChange={(open) => !open && setToRemove(undefined)}
        title={t('settings.ai.removeTitle', { provider: toRemove?.name })}
        description={t('settings.ai.removeDescription')}
        confirmLabel={t('settings.ai.remove')}
        onConfirm={async () => {
          await remove.mutateAsync(toRemove!.id);
          verify.reset();
        }}
      />
    </div>
  );
}

/** Paste a key, verify it with the provider and save it encrypted. */
function AddKeyForm({ status }: { status: AiKeysStatus }) {
  const { t } = useTranslation();
  const hintId = useId();
  const available = PROVIDERS.filter((provider) => provider.available);
  const [providerId, setProviderId] = useState<AiProvider>(available[0]!.id);
  const [apiKey, setApiKey] = useState('');
  const [formatError, setFormatError] = useState(false);
  const [outcome, setOutcome] = useState<
    'rejected' | 'confirmUnverified' | 'saved' | 'savedUnverified'
  >();
  const verify = useVerifyAiKey();
  const save = useSaveAiKey();
  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  const replacing = status.configured[providerId];

  async function saveKey(verified: boolean) {
    try {
      await save.mutateAsync({ provider: providerId, apiKey: apiKey.trim() });
    } catch {
      return; // Shown below through `save.error`.
    }
    setApiKey(''); // Never keep the key around once it is saved.
    setOutcome(verified ? 'saved' : 'savedUnverified');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setOutcome(undefined);
    const parsed = AiApiKeySchema.safeParse(apiKey);
    setFormatError(!parsed.success);
    if (!parsed.success) return;

    let result;
    try {
      result = await verify.mutateAsync({ provider: providerId, apiKey: parsed.data });
    } catch {
      return; // Shown below through `verify.error`.
    }
    const next = afterVerification(result.status);
    if (next === 'save') await saveKey(true);
    else setOutcome(next);
  }

  const busy = verify.isPending || save.isPending;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-indigo-navy">
        {replacing ? t('settings.ai.replaceTitle') : t('settings.ai.addTitle')}
      </h3>
      <div className="grid grid-cols-[14rem_1fr] gap-4">
        <Field label={t('settings.ai.provider')}>
          {(control) => (
            <Select
              {...control}
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value as AiProvider);
                setOutcome(undefined);
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.available ? p.name : t('settings.ai.comingSoonOption', { provider: p.name })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('settings.ai.apiKey')}
          error={formatError ? t('settings.ai.invalidFormat') : undefined}
        >
          {(control) => (
            <Input
              {...control}
              aria-describedby={[control['aria-describedby'], hintId].filter(Boolean).join(' ')}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setFormatError(false);
                setOutcome(undefined);
              }}
              placeholder={t('settings.ai.apiKeyPlaceholder')}
            />
          )}
        </Field>
      </div>

      <div id={hintId} className="flex flex-col gap-1 text-sm text-steel-text">
        <p>
          {t('settings.ai.getKey')}{' '}
          <a
            href={provider.keyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-indigo-navy underline underline-offset-2"
          >
            {t('settings.ai.getKeyLink', { provider: provider.name })}
          </a>
        </p>
        {providerId === 'gemini' && <p>{t('settings.ai.geminiPrivacy')}</p>}
      </div>

      {outcome === 'rejected' && (
        <InlineError>{t('settings.ai.rejected', { provider: provider.name })}</InlineError>
      )}
      {outcome === 'confirmUnverified' && (
        <div className="flex flex-col gap-3">
          <InlineError>{t('settings.ai.unreachable', { provider: provider.name })}</InlineError>
          <div>
            <Button variant="secondary" disabled={busy} onClick={() => void saveKey(false)}>
              {t('settings.ai.saveUnverified')}
            </Button>
          </div>
        </div>
      )}
      {(verify.isError || save.isError) && (
        <InlineError>
          {t('settings.ai.actionError', { message: (verify.error ?? save.error)?.message })}
        </InlineError>
      )}

      <div className="flex items-center justify-end gap-3">
        <p role="status" className="mr-auto text-sm text-steel-text">
          {outcome === 'saved' && t('settings.ai.savedVerified', { provider: provider.name })}
          {outcome === 'savedUnverified' &&
            t('settings.ai.savedUnverified', { provider: provider.name })}
        </p>
        <Button type="submit" disabled={busy || apiKey.trim() === ''}>
          {verify.isPending
            ? t('settings.ai.verifying')
            : save.isPending
              ? t('common.saving')
              : t('settings.ai.verifyAndSave')}
        </Button>
      </div>
    </form>
  );
}

/** Result of verifying the active saved key. */
function VerificationMessage({ status, provider }: { status: AiKeyStatus; provider: string }) {
  const { t } = useTranslation();
  const text = {
    VALID: t('settings.ai.storedValid'),
    INVALID: t('settings.ai.storedInvalid', { provider }),
    UNREACHABLE: t('settings.ai.storedUnreachable', { provider }),
    NOT_CONFIGURED: t('settings.ai.storedMissing'),
  }[status];
  return status === 'VALID' ? (
    <p role="status" className="mt-0.5 flex items-center gap-2 text-sm text-slate-ink">
      <span aria-hidden="true" className="size-2 rounded-full bg-seafoam-600" />
      {text}
    </p>
  ) : (
    <InlineError className="mt-0.5">{text}</InlineError>
  );
}
