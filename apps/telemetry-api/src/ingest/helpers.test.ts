import { describe, expect, it } from 'vitest';
import { newInstallation } from '../test-support/test-app.js';
import { isValidProof, isValidSignature, leadingZeroBits } from './crypto.js';
import { addDays, isDayInWindow, secondsToNextUtcDay } from './days.js';
import { IpLimits } from './ip-limits.js';

describe('signature and proof of work (ADR-26)', () => {
  it('accepts only the signature of the exact bytes with the installation key', () => {
    const installation = newInstallation();
    const body = Buffer.from('{"a":1}');
    const signature = installation.sign('{"a":1}');
    expect(isValidSignature(body, signature, installation.publicKey)).toBe(true);
    expect(isValidSignature(Buffer.from('{"a":2}'), signature, installation.publicKey)).toBe(false);
    expect(isValidSignature(body, signature, newInstallation().publicKey)).toBe(false);
    expect(isValidSignature(body, undefined, installation.publicKey)).toBe(false);
    expect(isValidSignature(body, 'not base64!', 'not a key')).toBe(false);
  });

  it('counts the leading zero bits of a hash', () => {
    expect(leadingZeroBits(Buffer.from([0xff]))).toBe(0);
    expect(leadingZeroBits(Buffer.from([0x00, 0x10]))).toBe(11);
    expect(leadingZeroBits(Buffer.from([0x00, 0x00]))).toBe(16);
    expect(isValidProof('anything', 0)).toBe(true);
  });
});

describe('days', () => {
  const now = new Date('2026-11-20T23:30:00.000Z');

  it('accepts 30 days back up to the next UTC day', () => {
    expect(isDayInWindow('2026-10-21', now)).toBe(true);
    expect(isDayInWindow('2026-10-20', now)).toBe(false);
    expect(isDayInWindow('2026-11-21', now)).toBe(true);
    expect(isDayInWindow('2026-11-22', now)).toBe(false);
  });

  it('moves across months and counts down to the next UTC midnight', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(secondsToNextUtcDay(now)).toBe(30 * 60);
  });
});

describe('IpLimits', () => {
  it('forgets everything when the UTC day changes', () => {
    let now = new Date('2026-11-20T10:00:00.000Z');
    const limits = new IpLimits({ requestsPerHourPerIp: 1, newInstallsPerHour: 10 }, () => now);
    expect(limits.hit('1.1.1.1').ok).toBe(true);
    expect(limits.hit('1.1.1.1')).toEqual({ ok: false, retryAfterSeconds: 3600 });
    limits.registered('1.1.1.1');
    expect(limits.mayRegister('1.1.1.1')).toBe(false);

    now = new Date('2026-11-21T00:00:01.000Z');
    expect(limits.mayRegister('1.1.1.1')).toBe(true);
    expect(limits.hit('1.1.1.1').ok).toBe(true);
  });
});
