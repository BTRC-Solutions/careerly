import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/**
 * Second check (after the local-access middleware) that `/internal/*` routes are called with the
 * control token, which only the Electron main process has. The interface token is not enough.
 */
@Injectable()
export class ControlTokenGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.controlToken;
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const authorization = request.headers.authorization;
    if (!expected || typeof authorization !== 'string') return false;

    const received = Buffer.from(authorization.replace(/^Bearer /, ''));
    const wanted = Buffer.from(expected);
    return received.length === wanted.length && timingSafeEqual(received, wanted);
  }
}
