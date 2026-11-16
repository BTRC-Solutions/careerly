import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './app-config.js';

const options = {
  defaultMigrationsDir: '/app/drizzle',
  defaultTemplatesDir: '/app/templates',
  cwd: '/work',
};
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
    expect(config.typstPackagesDir).toBe(path.join(dataDir, 'cache', 'typst-packages'));
  });

  it('renders with the given Typst and templates, else the defaults', () => {
    expect(loadConfig(validEnv, options)).toMatchObject({
      templatesDir: path.resolve('/app/templates'),
      typstBinary: 'typst',
      renderTimeoutMs: 10_000,
    });
    expect(
      loadConfig(
        {
          ...validEnv,
          CAREERLY_TEMPLATES_DIR: '/res/templates',
          CAREERLY_TYPST_BIN: '/res/typst/typst.exe',
          CAREERLY_RENDER_TIMEOUT_MS: '500',
        },
        { ...options, defaultTypstBinary: '/vendor/typst' },
      ),
    ).toMatchObject({
      templatesDir: path.resolve('/res/templates'),
      typstBinary: '/res/typst/typst.exe',
      renderTimeoutMs: 500,
    });
    expect(
      loadConfig(validEnv, { ...options, defaultTypstBinary: '/vendor/typst' }).typstBinary,
    ).toBe('/vendor/typst');
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
