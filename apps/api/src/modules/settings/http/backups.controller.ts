import {
  type Backup,
  type DeleteAllDataRequest,
  DeleteAllDataRequestSchema,
  type ListBackupsResponse,
  type RestoreBackupRequest,
  RestoreBackupRequestSchema,
  type RestoreBackupResponse,
} from '@careerly/contracts';
import { Body, Controller, Delete, Get, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { BackupService } from '../application/backup.service.js';
import { BackupErrorsInterceptor } from './backup-errors.interceptor.js';

@Controller()
@UseInterceptors(BackupErrorsInterceptor)
export class BackupsController {
  constructor(private readonly backups: BackupService) {}

  @Get('backups')
  list(): Promise<ListBackupsResponse> {
    return this.backups.list();
  }

  @Post('backups')
  create(): Promise<Backup> {
    return this.backups.create();
  }

  @Post('backups/restore')
  @HttpCode(200)
  restore(
    @Body(new ZodValidationPipe(RestoreBackupRequestSchema)) request: RestoreBackupRequest,
  ): Promise<RestoreBackupResponse> {
    return this.backups.restore(request.path);
  }

  /** Deletes all local data (RF-CONF-05). Requires `{ "confirmation": "DELETE_ALL_DATA" }`. */
  @Delete('data')
  @HttpCode(204)
  async deleteAll(
    @Body(new ZodValidationPipe(DeleteAllDataRequestSchema)) _request: DeleteAllDataRequest,
  ): Promise<void> {
    await this.backups.deleteAll();
  }
}
