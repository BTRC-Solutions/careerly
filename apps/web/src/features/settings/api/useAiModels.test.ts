import type { AiModelOption, AiModelsResponse } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { formatPrice, modelOptionsFor } from './useAiModels';

const model = (id: string, overrides: Partial<AiModelOption> = {}): AiModelOption => ({
  id,
  available: true,
  inputUsdPerMTok: null,
  outputUsdPerMTok: null,
  recommendedFor: [],
  tested: false,
  ...overrides,
});

const RESPONSE: AiModelsResponse = {
  provider: 'gemini',
  tiers: {
    small: { selected: 'old-model', defaults: ['lite'] },
    large: { selected: null, defaults: ['flash'] },
  },
  models: [
    model('zeta-preview'),
    model('flash', { recommendedFor: ['large'], tested: true }),
    model('alpha'),
    model('lite', { recommendedFor: ['small'], tested: true }),
    model('old-model', { available: false }),
  ],
};

describe('modelOptionsFor', () => {
  it('puts the recommended models first, then the tested ones, then the rest', () => {
    expect(modelOptionsFor('small', RESPONSE).map((m) => m.id)).toEqual([
      'lite',
      'flash',
      'alpha',
      'old-model',
      'zeta-preview',
    ]);
    expect(modelOptionsFor('large', RESPONSE).map((m) => m.id)).toEqual([
      'flash',
      'lite',
      'alpha',
      'zeta-preview',
    ]);
  });
});

describe('formatPrice', () => {
  it('shows input and output prices per million tokens, or nothing when unknown', () => {
    expect(formatPrice(model('x', { inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5 }))).toBe(
      '$0.30 / $2.50',
    );
    expect(formatPrice(model('x'))).toBeNull();
  });
});
