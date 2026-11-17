import { ApiError } from '../../../shared/api/client';

/** What the upload screen shows for a failed upload: a translated reason and, if any, Typst's own output. */
export interface UploadFailure {
  /** i18n key under `templates.upload.errors`. */
  reason: 'invalid' | 'timeout' | 'rendererUnavailable' | 'file' | 'unknown';
  /** Typst's diagnostics, for the template's author (it is their own file). */
  diagnostics: string | null;
}

/**
 * The API sends a compile error as "<summary>\n\n<Typst diagnostics>" (roadmap 4.12); the summary is
 * replaced by a translated text and the diagnostics are shown as they are.
 */
export function toUploadFailure(error: unknown): UploadFailure {
  if (!(error instanceof ApiError)) return { reason: 'unknown', diagnostics: null };
  switch (error.code) {
    case 'TEMPLATE_INVALID': {
      const separator = error.message.indexOf('\n\n');
      const diagnostics = separator >= 0 ? error.message.slice(separator + 2).trim() : '';
      return { reason: 'invalid', diagnostics: diagnostics || null };
    }
    case 'TEMPLATE_TIMEOUT':
      return { reason: 'timeout', diagnostics: null };
    case 'RENDERER_UNAVAILABLE':
      return { reason: 'rendererUnavailable', diagnostics: null };
    case 'VALIDATION_FAILED':
      return { reason: 'file', diagnostics: null };
    default:
      return { reason: 'unknown', diagnostics: null };
  }
}
