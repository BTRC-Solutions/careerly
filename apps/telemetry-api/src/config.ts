import { z } from 'zod';

/** Settings of the receiver, from the environment (the `.env` Jenkins writes on the host, ARCHITECTURE §19.6). */
export interface TelemetryApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  /** Shared with `stats-web` for `GET /internal/stats/*`. */
  internalSecret: string;
  /** Leading zero bits the proof of work of a new installation needs (~1–2 s at 20). Raised without an app update. */
  powDifficulty: number;
  /** Requests per hour from one IP (hashed, in memory only). */
  requestsPerHourPerIp: number;
  /** New installations per hour across all IPs; reaching it is logged as an alert. */
  newInstallsPerHour: number;
  /** Proxy hops in front of the receiver (Caddy), to read the client IP from `X-Forwarded-For`. */
  trustProxyHops: number;
}

const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const EnvSchema = z.object({
  TELEMETRY_HOST: z.string().min(1).default('0.0.0.0'),
  TELEMETRY_PORT: integer(3000, 0, 65_535),
  DATABASE_URL: z.string().min(1),
  TELEMETRY_INTERNAL_SECRET: z.string().min(32),
  TELEMETRY_POW_DIFFICULTY: integer(20, 0, 32),
  TELEMETRY_RATE_LIMIT_PER_HOUR: integer(20, 1, 10_000),
  TELEMETRY_NEW_INSTALLS_PER_HOUR: integer(50, 1, 100_000),
  TELEMETRY_TRUST_PROXY_HOPS: integer(1, 0, 10),
});

export function loadConfig(env: NodeJS.ProcessEnv): TelemetryApiConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid telemetry-api configuration: ${fields}.`);
  }
  const e = parsed.data;
  return {
    host: e.TELEMETRY_HOST,
    port: e.TELEMETRY_PORT,
    databaseUrl: e.DATABASE_URL,
    internalSecret: e.TELEMETRY_INTERNAL_SECRET,
    powDifficulty: e.TELEMETRY_POW_DIFFICULTY,
    requestsPerHourPerIp: e.TELEMETRY_RATE_LIMIT_PER_HOUR,
    newInstallsPerHour: e.TELEMETRY_NEW_INSTALLS_PER_HOUR,
    trustProxyHops: e.TELEMETRY_TRUST_PROXY_HOPS,
  };
}
