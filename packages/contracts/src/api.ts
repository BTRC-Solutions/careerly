import { z } from 'zod';

/** Error codes returned by the local API. */
export const ApiErrorCode = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'INTERNAL_ERROR',
  /** No AI key configured (or the provider has no adapter yet): set one up in Settings. */
  'AI_NOT_CONFIGURED',
  /** The AI provider rejected the key. */
  'AI_KEY_REJECTED',
  /** The AI provider's rate limit or quota was reached; try again later. */
  'AI_RATE_LIMITED',
  /** Offline, timeout or provider outage. */
  'AI_UNAVAILABLE',
  /** The chosen AI model does not exist (anymore) or is overloaded; another model may work. */
  'AI_MODEL_UNAVAILABLE',
  /** The AI answered something unusable (invalid structure or blocked content). */
  'AI_FAILED',
  /** The AI answer added facts that are not in the user's text (RN-01), so it was discarded. */
  'AI_UNFAITHFUL',
  /** A CV template does not compile (its Typst diagnostics are in the message). */
  'TEMPLATE_INVALID',
  /** A CV template took longer than the render timeout. */
  'TEMPLATE_TIMEOUT',
  /** The Typst CLI that renders the CVs was not found. */
  'RENDERER_UNAVAILABLE',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Shape of every error response from the local API. */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
