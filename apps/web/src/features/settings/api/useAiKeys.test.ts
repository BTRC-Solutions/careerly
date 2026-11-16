import { describe, expect, it } from 'vitest';
import { afterVerification } from './useAiKeys';

describe('afterVerification', () => {
  it('saves only keys the provider accepted', () => {
    expect(afterVerification('VALID')).toBe('save');
    expect(afterVerification('INVALID')).toBe('rejected');
  });

  it('lets the user decide when the provider could not be reached', () => {
    expect(afterVerification('UNREACHABLE')).toBe('confirmUnverified');
  });
});
