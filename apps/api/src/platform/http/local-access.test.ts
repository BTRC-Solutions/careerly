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
});
