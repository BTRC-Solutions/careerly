import { describe, expect, it } from 'vitest';
import { checkLocalAccess, type LocalAccessOptions } from './local-access.js';

const options: LocalAccessOptions = {
  apiToken: 'secret-token-123456',
  allowedOrigins: ['app://careerly'],
  address: { port: 4317 },
};

const validHeaders = {
  host: '127.0.0.1:4317',
  authorization: 'Bearer secret-token-123456',
};

describe('checkLocalAccess', () => {
  it('allows the app with the right token', () => {
    expect(checkLocalAccess({ ...validHeaders, origin: 'app://careerly' }, options)).toEqual({
      allowed: true,
    });
  });

  it('allows requests without Origin (non-browser clients with the token)', () => {
    expect(checkLocalAccess(validHeaders, options).allowed).toBe(true);
  });

  it('rejects a wrong or missing token with 401', () => {
    const result = checkLocalAccess({ ...validHeaders, authorization: 'Bearer nope' }, options);
    expect(result).toMatchObject({ allowed: false, status: 401 });
    expect(checkLocalAccess({ host: validHeaders.host }, options)).toMatchObject({ status: 401 });
  });

  it('rejects other websites (Origin) with 403', () => {
    const result = checkLocalAccess({ ...validHeaders, origin: 'https://evil.example' }, options);
    expect(result).toMatchObject({ allowed: false, status: 403 });
  });

  it('rejects DNS rebinding (foreign Host) with 403', () => {
    const result = checkLocalAccess({ ...validHeaders, host: 'evil.example:4317' }, options);
    expect(result).toMatchObject({ allowed: false, status: 403 });
  });

  it('rejects everything until the port is known', () => {
    const result = checkLocalAccess(validHeaders, { ...options, address: { port: undefined } });
    expect(result.allowed).toBe(false);
  });

  describe('/internal routes (Electron main only)', () => {
    const withControl = { ...options, controlToken: 'control-token-123456' };
    const control = { host: validHeaders.host, authorization: 'Bearer control-token-123456' };

    it('accept only the control token', () => {
      expect(checkLocalAccess(control, withControl, '/internal/ai-credentials').allowed).toBe(true);
      expect(checkLocalAccess(validHeaders, withControl, '/internal/ai-credentials')).toMatchObject(
        { status: 401 },
      );
    });

    it('are matched case-insensitively and with query strings', () => {
      expect(
        checkLocalAccess(validHeaders, withControl, '/Internal/AI-credentials?x=1'),
      ).toMatchObject({ status: 401 });
    });

    it('reject browser contexts and are disabled without a control token', () => {
      expect(
        checkLocalAccess({ ...control, origin: 'app://careerly' }, withControl, '/internal/x'),
      ).toMatchObject({ status: 403 });
      expect(checkLocalAccess(control, options, '/internal/x')).toMatchObject({ status: 403 });
    });

    it('do not let the control token open the regular API', () => {
      expect(checkLocalAccess(control, withControl, '/profile')).toMatchObject({ status: 401 });
    });
  });
});
