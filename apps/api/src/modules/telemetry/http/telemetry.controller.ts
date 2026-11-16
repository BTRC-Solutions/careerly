import {
  type RegenerateInstallIdResponse,
  type TelemetryPreviewResponse,
  type TelemetryReportsResponse,
  type TelemetrySettingsResponse,
  type UpdateTelemetrySettingsRequest,
  UpdateTelemetrySettingsRequestSchema,
} from '@careerly/contracts';
import { Body, ConflictException, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { NoInstallIdError, TelemetryService } from '../application/telemetry.service.js';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('settings')
  getSettings(): Promise<TelemetrySettingsResponse> {
    return this.telemetry.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateTelemetrySettingsRequestSchema))
    request: UpdateTelemetrySettingsRequest,
  ): Promise<TelemetrySettingsResponse> {
    return this.telemetry.updateSettings(request);
  }

  @Get('preview')
  preview(): Promise<TelemetryPreviewResponse> {
    return this.telemetry.preview();
  }

  @Get('reports')
  listReports(): Promise<TelemetryReportsResponse> {
    return this.telemetry.listReports();
  }

  @Post('install-id/regenerate')
  @HttpCode(200)
  async regenerateInstallId(): Promise<RegenerateInstallIdResponse> {
    try {
      return { installId: await this.telemetry.regenerateInstallId() };
    } catch (error) {
      if (error instanceof NoInstallIdError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
