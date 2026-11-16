import type { AiModelOption, AiModelsResponse, ModelTier } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../shared/api/client';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Field, Select } from '../../../shared/ui/form';
import { InlineError } from '../../../shared/ui/InlineError';
import { formatPrice, modelOptionsFor, useAiModels, useChooseAiModel } from '../api/useAiModels';

const TIERS: ModelTier[] = ['small', 'large'];

/** Error codes with their own message; anything else is a generic failure. */
const KNOWN_ERRORS = new Set([
  'AI_NOT_CONFIGURED',
  'AI_KEY_REJECTED',
  'AI_RATE_LIMITED',
  'AI_UNAVAILABLE',
  'AI_MODEL_UNAVAILABLE',
]);

function errorCode(error: Error): string {
  return error instanceof ApiError && KNOWN_ERRORS.has(error.code) ? error.code : 'AI_FAILED';
}

/**
 * AI models per tier (RF-CONF-09): small for extracting and scoring, large for writing. A model
 * is tried with a minimal call before it is saved, and applies to the next AI calls at once.
 */
export function AiModelsCard() {
  const { t } = useTranslation();
  const models = useAiModels();

  return (
    <Card>
      <h2 className="text-section-title text-indigo-navy">{t('settings.aiModels.title')}</h2>
      <p className="mt-1 text-sm text-steel-text">{t('settings.aiModels.description')}</p>

      {models.isPending && (
        <p role="status" className="mt-4 text-sm text-steel-text">
          {t('settings.aiModels.loading')}
        </p>
      )}
      {models.isError && (
        <div className="mt-4">
          <InlineError>{t(`settings.aiModels.errors.${errorCode(models.error)}`)}</InlineError>
          <Button variant="secondary" className="mt-3" onClick={() => void models.refetch()}>
            {t('settings.aiModels.retry')}
          </Button>
        </div>
      )}
      {models.data && (
        <div className="mt-4 flex flex-col gap-6">
          {TIERS.map((tier) => (
            <TierChoice key={tier} tier={tier} models={models.data} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** Value of the "use the defaults" option (model ids are never empty). */
const DEFAULTS = '';

function TierChoice({ tier, models }: { tier: ModelTier; models: AiModelsResponse }) {
  const { t } = useTranslation();
  const choose = useChooseAiModel();
  const { selected, defaults } = models.tiers[tier] ?? { selected: null, defaults: [] };
  const saved = selected ?? DEFAULTS;
  const [draft, setDraft] = useState(saved);
  const [message, setMessage] = useState<string>();
  const options = modelOptionsFor(tier, models);
  const selectedUnavailable = models.models.some(
    (model) => model.id === selected && !model.available,
  );

  function optionLabel(model: AiModelOption) {
    const notes = [
      model.recommendedFor.includes(tier) && t('settings.aiModels.recommended'),
      formatPrice(model)
        ? t('settings.aiModels.price', { price: formatPrice(model) })
        : t('settings.aiModels.unknownModel'),
      !model.available && t('settings.aiModels.unavailable'),
    ].filter(Boolean);
    return `${model.id} — ${notes.join(' · ')}`;
  }

  async function save() {
    setMessage(undefined);
    const model = draft === DEFAULTS ? null : draft;
    await choose.mutateAsync({ tier, model });
    setMessage(
      model
        ? t('settings.aiModels.saved', { model })
        : t('settings.aiModels.savedDefaults', { model: defaults[0] }),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={t(`settings.aiModels.tiers.${tier}.label`)}
        hint={t(`settings.aiModels.tiers.${tier}.hint`)}
      >
        {(control) => (
          <Select
            {...control}
            value={draft}
            disabled={choose.isPending}
            onChange={(event) => {
              setDraft(event.target.value);
              setMessage(undefined);
              choose.reset();
            }}
          >
            <option value={DEFAULTS}>
              {t('settings.aiModels.defaultOption', { model: defaults[0] ?? '' })}
            </option>
            {options.map((model) => (
              <option key={model.id} value={model.id}>
                {optionLabel(model)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {selectedUnavailable && draft === saved && (
        <InlineError>{t('settings.aiModels.selectedUnavailable', { model: selected })}</InlineError>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={draft === saved || choose.isPending}
          onClick={() => void save().catch(() => {})}
        >
          {choose.isPending
            ? t('settings.aiModels.testing')
            : draft === DEFAULTS
              ? t('settings.aiModels.useDefaults')
              : t('settings.aiModels.testAndSave')}
        </Button>
        <p role="status" className="text-sm text-slate-ink">
          {message}
        </p>
      </div>
      {choose.isError && (
        <InlineError>
          {t(`settings.aiModels.errors.${errorCode(choose.error)}`, { model: draft })}
        </InlineError>
      )}
    </div>
  );
}
