import type { ClaudeCodeProblem } from '@careerly/contracts';

/** What this computer offers for Claude Code (ADR-25). */
export interface ClaudeCodeEnvironment {
  /** Installed and signed in. */
  ready: boolean;
  problem: ClaudeCodeProblem | null;
  version: string | null;
  authMethod: string | null;
}

/** Port: checks whether Claude Code is installed and signed in. */
export abstract class ClaudeCodeProbe {
  abstract check(): Promise<ClaudeCodeEnvironment>;
}
