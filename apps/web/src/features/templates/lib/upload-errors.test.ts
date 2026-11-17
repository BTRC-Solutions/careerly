import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/api/client';
import { toUploadFailure } from './upload-errors';

describe('toUploadFailure', () => {
  it('keeps Typst diagnostics of a template that does not compile', () => {
    const error = new ApiError(
      422,
      'TEMPLATE_INVALID',
      'The template could not be rendered.\n\nerror: unclosed delimiter\n  ┌─ template.typ:1:9',
    );
    expect(toUploadFailure(error)).toEqual({
      reason: 'invalid',
      diagnostics: 'error: unclosed delimiter\n  ┌─ template.typ:1:9',
    });
  });

  it('has no diagnostics when Typst gave none', () => {
    const error = new ApiError(422, 'TEMPLATE_INVALID', 'The template could not be rendered.');
    expect(toUploadFailure(error)).toEqual({ reason: 'invalid', diagnostics: null });
  });

  it.each([
    ['TEMPLATE_TIMEOUT', 'timeout'],
    ['RENDERER_UNAVAILABLE', 'rendererUnavailable'],
    ['VALIDATION_FAILED', 'file'],
    ['INTERNAL_ERROR', 'unknown'],
  ])('maps %s to %s', (code, reason) => {
    expect(toUploadFailure(new ApiError(400, code, 'x'))).toEqual({ reason, diagnostics: null });
  });

  it('treats anything else (e.g. offline) as unknown', () => {
    expect(toUploadFailure(new TypeError('Failed to fetch'))).toEqual({
      reason: 'unknown',
      diagnostics: null,
    });
  });
});
