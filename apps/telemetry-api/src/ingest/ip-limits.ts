import { createHash, randomBytes } from 'node:crypto';
import { utcDay } from './days.js';

const HOUR_MS = 60 * 60 * 1000;

export type LimitAnswer = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * The limits that need the IP (ARCHITECTURE §19.4), kept only in memory and with the IP hashed with a salt that
 * changes every UTC day (RNF-23): nothing here survives a restart or a day, and nothing is written anywhere.
 * - Requests per hour from one IP.
 * - One new installation per IP and UTC day.
 * - New installations per hour across all IPs.
 */
export class IpLimits {
  private day = '';
  private salt = randomBytes(32);
  private readonly requests = new Map<string, { windowStart: number; count: number }>();
  private readonly registeredToday = new Set<string>();
  private newInstalls = { windowStart: 0, count: 0 };

  constructor(
    private readonly options: { requestsPerHourPerIp: number; newInstallsPerHour: number },
    private readonly now: () => Date,
  ) {}

  /** Counts a request from `ip`; past the hourly limit it says when to come back. */
  hit(ip: string): LimitAnswer {
    const key = this.key(ip);
    const now = this.now().getTime();
    const current = this.requests.get(key);
    if (!current || now - current.windowStart >= HOUR_MS) {
      this.requests.set(key, { windowStart: now, count: 1 });
      return { ok: true };
    }
    if (current.count >= this.options.requestsPerHourPerIp) {
      return {
        ok: false,
        retryAfterSeconds: Math.ceil((current.windowStart + HOUR_MS - now) / 1000),
      };
    }
    current.count++;
    return { ok: true };
  }

  /** Whether `ip` may register a new installation today (it did not register another one). */
  mayRegister(ip: string): boolean {
    return !this.registeredToday.has(this.key(ip));
  }

  /** Takes one of this hour's new installations; `false` when the global limit is reached. */
  takeNewInstall(): boolean {
    const now = this.now().getTime();
    if (now - this.newInstalls.windowStart >= HOUR_MS)
      this.newInstalls = { windowStart: now, count: 0 };
    if (this.newInstalls.count >= this.options.newInstallsPerHour) return false;
    this.newInstalls.count++;
    return true;
  }

  /** Records that `ip` registered an installation today. */
  registered(ip: string): void {
    this.registeredToday.add(this.key(ip));
  }

  private key(ip: string): string {
    const today = utcDay(this.now());
    if (today !== this.day) {
      // A new day: a new salt, and yesterday's hashes are forgotten.
      this.day = today;
      this.salt = randomBytes(32);
      this.requests.clear();
      this.registeredToday.clear();
    }
    return createHash('sha256').update(this.salt).update(ip).digest('base64url');
  }
}
