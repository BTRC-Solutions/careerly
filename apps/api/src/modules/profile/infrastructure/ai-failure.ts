import {
  type AiError,
  AiKeyRejectedError,
  AiModelUnavailableError,
  AiNotConfiguredError,
  AiProviderNotSupportedError,
  AiRateLimitedError,
  AiUnavailableError,
} from '../../ai/index.js';
import type { CvImportFailure } from '../application/cv-import.ports.js';

/** The reason an AI call failed, as the profile module's errors report it (and the API maps to HTTP). */
export function aiFailure(error: AiError): Exclude<CvImportFailure, 'UNREADABLE_FILE'> {
  if (error instanceof AiNotConfiguredError || error instanceof AiProviderNotSupportedError) {
    return 'AI_NOT_CONFIGURED';
  }
  if (error instanceof AiKeyRejectedError) return 'AI_KEY_REJECTED';
  if (error instanceof AiRateLimitedError) return 'AI_RATE_LIMITED';
  if (error instanceof AiUnavailableError || error instanceof AiModelUnavailableError) {
    return 'AI_UNAVAILABLE';
  }
  return 'AI_FAILED';
}
