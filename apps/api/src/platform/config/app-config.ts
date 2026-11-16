import path from 'node:path';
import type { AiProvider } from '@careerly/contracts';
import { z } from 'zod';

/** DI token for the validated {@link AppConfig}. */
export const APP_CONFIG = Symbol('APP_CONFIG');

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/** Comma-separated model names (at least one). */
const modelList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^[a-z0-9.-]{1,80}$/)).min(1));

const EnvSchema = z.object({
  CAREERLY_DATA_DIR: z.string().min(1, 'CAREERLY_DATA_DIR is required'),
  CAREERLY_API_TOKEN: z.string().min(16, 'CAREERLY_API_TOKEN must have at least 16 characters'),
  CAREERLY_API_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  CAREERLY_ALLOWED_ORIGINS: z.string().default(''),
  CAREERLY_APP_VERSION: z.string().min(1).default('0.0.0-dev'),
  CAREERLY_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CAREERLY_LOG_TO_STDOUT: booleanString,
  CAREERLY_MIGRATIONS_DIR: z.string().min(1).optional(),
  /** Built-in CV templates (`apps/api/templates` from source, `resources/api/templates` installed). */
  CAREERLY_TEMPLATES_DIR: z.string().min(1).optional(),
  /** Typst CLI (ADR-14): the packaged one when installed; from source, the vendored one or the PATH's. */
  CAREERLY_TYPST_BIN: z.string().min(1).optional(),
  CAREERLY_RENDER_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  /** Optional: enables the `/internal/*` routes used by the Electron main process (ADR-23). */
  CAREERLY_CONTROL_TOKEN: z
    .string()
    .min(16, 'CAREERLY_CONTROL_TOKEN must have at least 16 characters')
    .optional(),
  /** Base URL of each AI provider (ADR-23). Only overridden by tests, which use a local fake. */
  CAREERLY_GEMINI_BASE_URL: z.url().default('https://generativelanguage.googleapis.com'),
  CAREERLY_ANTHROPIC_BASE_URL: z.url().default('https://api.anthropic.com'),
  /**
   * Gemini models per tier, comma-separated, in order of preference: later ones are fallbacks when
   * a model is retired (404) or overloaded (503). Checked against the API in November 2026: the 2.5
   * family is gone for new keys and Pro models have no free-tier quota, so the defaults are Flash
   * models. The user's choice in Settings (RF-CONF-09) goes before these, which stay as fallbacks.
   */
  CAREERLY_GEMINI_MODELS_SMALL: modelList.prefault(
    'gemini-3.5-flash-lite,gemini-flash-lite-latest',
  ),
  CAREERLY_GEMINI_MODELS_LARGE: modelList.prefault(
    'gemini-3.6-flash,gemini-flash-latest,gemini-3.5-flash-lite',
  ),
  /**
   * Claude models per tier (ADR-23), same rules: a fast, cheap model for extraction and the most
   * capable one for writing, with Sonnet as its fallback.
   */
  CAREERLY_ANTHROPIC_MODELS_SMALL: modelList.prefault('claude-haiku-5-5'),
  CAREERLY_ANTHROPIC_MODELS_LARGE: modelList.prefault('claude-opus-5-5,claude-sonnet-5-5'),
  /**
   * Command that runs Claude Code (ADR-24), as a JSON array (e.g. `["node","fake-claude.mjs"]`).
   * Only set by tests; otherwise `claude` is looked up in PATH and in ~/.local/bin.
   */
  CAREERLY_CLAUDE_CODE_COMMAND: z
    .string()
    .transform((value, context) => {
      try {
        return z.array(z.string().min(1)).min(1).parse(JSON.parse(value));
      } catch {
        context.addIssue({ code: 'custom', message: 'Expected a JSON array of strings.' });
        return z.NEVER;
      }
    })
    .optional(),
});

export interface AppConfig {
  /** Root folder for all local data (database, files, backups, logs). */
  dataDir: string;
  databaseFile: string;
  /** Generated files (CV and guide PDFs), included in backups. */
  filesDir: string;
  backupsDir: string;
  logsDir: string;
  migrationsDir: string;
  /** Built-in CV templates, one folder per template (ARCHITECTURE.md §9). */
  templatesDir: string;
  /** Typst CLI to render CVs with. */
  typstBinary: string;
  /** A render taking longer is killed (a template could loop). */
  renderTimeoutMs: number;
  /** Typst package cache, so templates never write to system folders. Not backed up. */
  typstPackagesDir: string;
  /** Per-launch secret that every request must send as `Authorization: Bearer <token>`. */
  apiToken: string;
  /**
   * Per-launch secret known only to the Electron main process. Required by `/internal/*` routes
   * (e.g. sending the AI API key); the interface token is not accepted there. Absent = routes disabled.
   */
  controlToken: string | undefined;
  /** The API always listens on the loopback interface only. */
  host: '127.0.0.1';
  /** 0 means "any free port". */
  port: number;
  /** Origins allowed to call the API from a browser context (the renderer). */
  allowedOrigins: string[];
  appVersion: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  logToStdout: boolean;
  /** Base URL of each AI provider's API (ADR-23). Only overridden by tests (a local fake provider). */
  aiBaseUrls: Record<AiProvider, string>;
  /** Gemini models for each tier, in order of preference: small (extraction, scoring), large (writing). */
  geminiModels: { small: string[]; large: string[] };
  /** Claude models for each tier, in order of preference. */
  anthropicModels: { small: string[]; large: string[] };
  /** Command that runs Claude Code; `null` to look for `claude` (ADR-24). */
  claudeCodeCommand: string[] | null;
}

export class ConfigError extends Error {
  constructor(issues: string[]) {
    super(`Invalid configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Builds the app configuration from environment variables.
 * Relative paths are resolved against `cwd`.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv,
  options: {
    defaultMigrationsDir: string;
    defaultTemplatesDir: string;
    /** Used when `CAREERLY_TYPST_BIN` is not set; otherwise `typst` from the PATH. */
    defaultTypstBinary?: string;
    cwd?: string;
  },
): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const parsed = result.data;
  const cwd = options.cwd ?? process.cwd();
  const dataDir = path.resolve(cwd, parsed.CAREERLY_DATA_DIR);

  return {
    dataDir,
    databaseFile: path.join(dataDir, 'careerly.db'),
    filesDir: path.join(dataDir, 'files'),
    backupsDir: path.join(dataDir, 'backups'),
    logsDir: path.join(dataDir, 'logs'),
    migrationsDir: path.resolve(
      cwd,
      parsed.CAREERLY_MIGRATIONS_DIR ?? options.defaultMigrationsDir,
    ),
    templatesDir: path.resolve(cwd, parsed.CAREERLY_TEMPLATES_DIR ?? options.defaultTemplatesDir),
    typstBinary: parsed.CAREERLY_TYPST_BIN ?? options.defaultTypstBinary ?? 'typst',
    renderTimeoutMs: parsed.CAREERLY_RENDER_TIMEOUT_MS,
    typstPackagesDir: path.join(dataDir, 'cache', 'typst-packages'),
    apiToken: parsed.CAREERLY_API_TOKEN,
    controlToken: parsed.CAREERLY_CONTROL_TOKEN,
    host: '127.0.0.1',
    port: parsed.CAREERLY_API_PORT,
    allowedOrigins: parsed.CAREERLY_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    appVersion: parsed.CAREERLY_APP_VERSION,
    logLevel: parsed.CAREERLY_LOG_LEVEL,
    logToStdout: parsed.CAREERLY_LOG_TO_STDOUT,
    aiBaseUrls: {
      gemini: parsed.CAREERLY_GEMINI_BASE_URL.replace(/\/+$/, ''),
      anthropic: parsed.CAREERLY_ANTHROPIC_BASE_URL.replace(/\/+$/, ''),
    },
    geminiModels: {
      small: parsed.CAREERLY_GEMINI_MODELS_SMALL,
      large: parsed.CAREERLY_GEMINI_MODELS_LARGE,
    },
    anthropicModels: {
      small: parsed.CAREERLY_ANTHROPIC_MODELS_SMALL,
      large: parsed.CAREERLY_ANTHROPIC_MODELS_LARGE,
    },
    claudeCodeCommand: parsed.CAREERLY_CLAUDE_CODE_COMMAND ?? null,
  };
}
