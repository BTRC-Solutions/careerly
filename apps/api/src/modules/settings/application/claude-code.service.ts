import type { ClaudeCodeProblem, ClaudeCodeStatus } from '@careerly/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SettingsService } from './settings.service.js';

/** Settings key of the switch: `ai.claudeCode.enabled`. */
const NAMESPACE = 'ai';
const ENABLED_KEY = 'claudeCode.enabled';

/** What this computer offers for Claude Code. */
export interface ClaudeCodeCheck {
  ready: boolean;
  problem: ClaudeCodeProblem | null;
  version: string | null;
  authMethod: string | null;
}

/**
 * Port: the `ai` module's side of Claude Code (ADR-25). Declared as an abstract class so it can be
 * used as a Nest DI token.
 */
export abstract class ClaudeCodeGateway {
  abstract check(): Promise<ClaudeCodeCheck>;
  /** Where AI calls read the switch from (plugged in once, at startup). */
  abstract useSwitchSource(source: () => Promise<boolean>): void;
}

/**
 * Using Claude Code with the user's subscription instead of an API key (RF-CONF-14, ADR-25).
 * Turning it on is refused while it is not installed and signed in, so AI calls never switch to
 * something that cannot answer. AI calls read the switch on every call.
 */
@Injectable()
export class ClaudeCodeService implements OnModuleInit {
  constructor(
    private readonly settings: SettingsService,
    private readonly gateway: ClaudeCodeGateway,
  ) {}

  onModuleInit() {
    this.gateway.useSwitchSource(() => this.isEnabled());
  }

  async status(): Promise<ClaudeCodeStatus> {
    const [enabled, check] = await Promise.all([this.isEnabled(), this.gateway.check()]);
    return { enabled, ...check };
  }

  async setEnabled(enabled: boolean): Promise<ClaudeCodeStatus> {
    if (enabled) {
      const check = await this.gateway.check();
      if (!check.ready) return { enabled: await this.isEnabled(), ...check };
    }
    await this.settings.updateNamespace(NAMESPACE, { [ENABLED_KEY]: enabled ? true : undefined });
    return this.status();
  }

  private async isEnabled(): Promise<boolean> {
    return (await this.settings.getNamespace(NAMESPACE)).get(ENABLED_KEY) === true;
  }
}
