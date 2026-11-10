import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './app-config.js';

const options = { defaultMigrationsDir: '/app/drizzle', cwd: '/work' };
const validEnv = {
  CAREERLY_DATA_DIR: 'data',
  CAREERLY_API_TOKEN: 'a-token-with-enough-length',
};

describe('loadConfig', () => {
  it('derives every path from the data folder', () => {
    const config = loadConfig(validEnv, options);
    const dataDir = path.resolve('/work', 'data');
    expect(config.dataDir).toBe(dataDir);
    expect(config.databaseFile).toBe(path.join(dataDir, 'careerly.db'));
    expect(config.backupsDir).toBe(path.join(dataDir, 'backups'));
    expect(config.logsDir).toBe(path.join(dataDir, 'logs'));
  });

  it('listens on loopback, on any free port by default', () => {
    const config = loadConfig(validEnv, options);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(0);
  });

  it('parses the allowed origins list', () => {
    const config = loadConfig(
      { ...validEnv, CAREERLY_ALLOWED_ORIGINS: 'app://careerly, http://localhost:5173,' },
      options,
    );
    expect(config.allowedOrigins).toEqual(['app://careerly', 'http://localhost:5173']);
  });

  it('rejects a missing data folder and a short token', () => {
    expect(() => loadConfig({ CAREERLY_API_TOKEN: 'short' }, options)).toThrow(ConfigError);
  });
});
