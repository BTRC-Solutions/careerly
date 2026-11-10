import {
  type SettingsResponse,
  type UpdateSettingsRequest,
  UpdateSettingsRequestSchema,
} from '@careerly/contracts';
import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../platform/config/app-config.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { SettingsService } from '../application/settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
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

  private toResponse(preferences: SettingsResponse['preferences']): SettingsResponse {
    return { preferences, dataDir: this.config.dataDir };
  }
}
