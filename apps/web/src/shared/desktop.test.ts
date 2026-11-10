import { describe, expect, it } from 'vitest';
import { resolveApiConnection } from './desktop';

describe('resolveApiConnection', () => {
  it('prefers the Electron bridge', () => {
    const connection = resolveApiConnection(
      { apiBaseUrl: 'http://127.0.0.1:5000', apiToken: 'electron-token' },
      { VITE_API_URL: 'http://127.0.0.1:4317', VITE_API_TOKEN: 'dev-token' },
    );
    expect(connection).toEqual({
      baseUrl: 'http://127.0.0.1:5000',
      token: 'electron-token',
      isDesktop: true,
    });
  });

  it('falls back to the Vite env in the browser', () => {
    const connection = resolveApiConnection(undefined, {
      VITE_API_URL: 'http://127.0.0.1:4317',
      VITE_API_TOKEN: 'dev-token',
    });
    expect(connection.isDesktop).toBe(false);
  });

  it('fails clearly when there is no connection info', () => {
    expect(() => resolveApiConnection(undefined, {})).toThrow(/No API connection/);
  });
});
