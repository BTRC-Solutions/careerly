import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import { ClaudeCodeProbe, type ClaudeCodeEnvironment } from '../application/claude-code.port.js';

export interface CliResult {
  stdout: string;
  exitCode: number | null;
  timedOut: boolean;
}

/** Enough for any structured answer; more is a sign something is wrong. */
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

/**
 * Runs the Claude Code installed on this computer (ADR-24). Never through a shell: arguments go
 * to the process as they are and the prompt goes through stdin. Its output is never logged.
 */
@Injectable()
export class ClaudeCodeCli extends ClaudeCodeProbe {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  /** The command to run, or `null` if Claude Code is not installed. */
  command(): string[] | null {
    if (this.config.claudeCodeCommand) return this.config.claudeCodeCommand;
    const names = process.platform === 'win32' ? ['claude.exe'] : ['claude'];
    const folders = [
      ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean),
      // Where the native installer puts it, often not in PATH for apps started from the desktop.
      path.join(os.homedir(), '.local', 'bin'),
    ];
    for (const folder of folders) {
      for (const name of names) {
        const candidate = path.join(folder, name);
        if (isFile(candidate)) return [candidate];
      }
    }
    return null;
  }

  async check(): Promise<ClaudeCodeEnvironment> {
    const command = this.command();
    if (!command) {
      return { ready: false, problem: 'NOT_INSTALLED', version: null, authMethod: null };
    }
    const [versionRun, statusRun] = await Promise.all([
      this.run(command, ['--version'], { timeoutMs: 15_000 }),
      this.run(command, ['auth', 'status', '--json'], { timeoutMs: 15_000 }),
    ]);
    const version = /\d+\.\d+\.\d+/.exec(versionRun.stdout)?.[0] ?? null;
    let status: { loggedIn?: unknown; authMethod?: unknown };
    try {
      status = JSON.parse(statusRun.stdout) as typeof status;
    } catch {
      return { ready: false, problem: 'CHECK_FAILED', version, authMethod: null };
    }
    const authMethod = typeof status.authMethod === 'string' ? status.authMethod : null;
    if (status.loggedIn !== true) {
      return { ready: false, problem: 'NOT_LOGGED_IN', version, authMethod };
    }
    return { ready: true, problem: null, version, authMethod };
  }

  /** Runs Claude Code with `args`, writing `stdin` to it; resolves when it exits or times out. */
  run(
    command: string[],
    args: string[],
    options: { cwd?: string; stdin?: string; timeoutMs: number },
  ): Promise<CliResult> {
    return new Promise((resolve) => {
      const [file, ...baseArgs] = command;
      const child = spawn(file!, [...baseArgs, ...args], {
        cwd: options.cwd,
        env: cleanEnvironment(),
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_OUTPUT_BYTES) child.kill();
        else chunks.push(chunk);
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ stdout: '', exitCode: null, timedOut });
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode, timedOut });
      });
      child.stdin.on('error', () => {
        // The process may exit before reading stdin; the exit code tells what happened.
      });
      child.stdin.end(options.stdin ?? '');
    });
  }
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Claude Code must use the user's subscription: an API key, token or other endpoint inherited
 * from the environment would make it bill an API account (or send data elsewhere) instead.
 */
function cleanEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(ANTHROPIC_|CLAUDE_CODE_USE_|AWS_BEARER_TOKEN_BEDROCK|CAREERLY_)/i.test(name),
    ),
  );
}
