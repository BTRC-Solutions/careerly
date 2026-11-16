import { Injectable } from '@nestjs/common';
import { ActiveAiCredentials, ClaudeCodeProbe } from '../../ai/index.js';
import { type ClaudeCodeCheck, ClaudeCodeGateway } from '../application/claude-code.service.js';

/** Claude Code through the `ai` module's public API (ADR-25). */
@Injectable()
export class AiModuleClaudeCodeGateway extends ClaudeCodeGateway {
  constructor(
    private readonly probe: ClaudeCodeProbe,
    private readonly active: ActiveAiCredentials,
  ) {
    super();
  }

  check(): Promise<ClaudeCodeCheck> {
    return this.probe.check();
  }

  useSwitchSource(source: () => Promise<boolean>): void {
    this.active.useClaudeCodeSource(source);
  }
}
