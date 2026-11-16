import {
  type ClaudeCodeStatus,
  type UpdateClaudeCodeRequest,
  UpdateClaudeCodeRequestSchema,
} from '@careerly/contracts';
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { ClaudeCodeService } from '../application/claude-code.service.js';

/**
 * Claude Code with the user's subscription (RF-CONF-14, ADR-25). `PUT` always answers 200 with
 * the status: if it cannot be turned on, `enabled` stays `false` and `problem` says why.
 */
@Controller('settings/claude-code')
export class ClaudeCodeController {
  constructor(private readonly claudeCode: ClaudeCodeService) {}

  @Get()
  status(): Promise<ClaudeCodeStatus> {
    return this.claudeCode.status();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(UpdateClaudeCodeRequestSchema)) body: UpdateClaudeCodeRequest,
  ): Promise<ClaudeCodeStatus> {
    return this.claudeCode.setEnabled(body.enabled);
  }
}
