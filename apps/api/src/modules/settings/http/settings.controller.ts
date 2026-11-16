import {
  type SettingsResponse,
  type UpdateSettingsRequest,
  UpdateSettingsRequestSchema,
  type VerifyAiKeyRequest,
  VerifyAiKeyRequestSchema,
  type VerifyAiKeyResponse,
} from '@careerly/contracts';
import { Body, Controller, Get, HttpCode, Inject, Patch, Post } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { AiKeyService } from '../application/ai-key.service.js';
import { SettingsService } from '../application/settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly aiKey: AiKeyService,
  ) {}

  @Get()
  async get(): Promise<SettingsResponse> {
    return this.toResponse(await this.settings.getPreferences());
  }

  @Patch()
  async update(
    @Body(new ZodValidationPipe(UpdateSettingsRequestSchema)) patch: UpdateSettingsRequest,
  ): Promise<SettingsResponse> {
    return this.toResponse(await this.settings.updatePreferences(patch));
  }

  /** Test call to the AI provider (RF-CONF-02). Always 200: the outcome is in `status`. */
  @Post('ai-key/verify')
  @HttpCode(200)
  verifyAiKey(
    @Body(new ZodValidationPipe(VerifyAiKeyRequestSchema)) request: VerifyAiKeyRequest,
  ): Promise<VerifyAiKeyResponse> {
    return this.aiKey.verify(request);
  }

  private toResponse(preferences: SettingsResponse['preferences']): SettingsResponse {
    return {
      preferences,
      dataDir: this.config.dataDir,
      aiKey: this.aiKey.status(),
    };
  }
}
