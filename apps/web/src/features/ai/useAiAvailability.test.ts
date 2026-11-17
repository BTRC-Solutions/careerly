import { describe, expect, it } from 'vitest';
import { unavailableReason } from './useAiAvailability';

describe('unavailableReason', () => {
  const ready = { configured: true, provider: 'gemini' as const, keyRejected: false };

  it('is available online with a working key', () => {
    expect(unavailableReason(true, ready)).toBeNull();
  });

  it('puts the missing connection first', () => {
    expect(unavailableReason(false, ready)).toBe('OFFLINE');
    expect(unavailableReason(false, undefined)).toBe('OFFLINE');
  });

  it('explains a missing or rejected key', () => {
    expect(unavailableReason(true, { configured: false, provider: null, keyRejected: false })).toBe(
      'NOT_CONFIGURED',
    );
    expect(unavailableReason(true, { ...ready, keyRejected: true })).toBe('KEY_REJECTED');
  });

  it('lets the API decide while the status is unknown', () => {
    expect(unavailableReason(true, undefined)).toBeNull();
  });
});
