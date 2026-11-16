import {
  type ConfirmCvImportRequest,
  ConfirmCvImportRequestSchema,
  type ConfirmCvImportResponse,
  CV_IMPORT_MAX_BYTES,
  type CvImportDraft,
} from '@careerly/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import type { CvFile } from '../application/cv-import.ports.js';
import { CvImportService } from '../application/cv-import.service.js';
import { ProfileErrorsInterceptor } from './profile-errors.interceptor.js';

/** The parts of a Multer upload this controller reads (kept in memory, never written to disk). */
interface UploadedCv {
  buffer: Buffer;
  size: number;
}

/**
 * Importing a CV (RF-PROF-09): `POST /profile/import` returns a draft and saves nothing;
 * `POST /profile/import/confirm` creates what the user kept, with origin `IMPORT`.
 */
@Controller('profile/import')
@UseInterceptors(ProfileErrorsInterceptor)
export class CvImportController {
  constructor(private readonly imports: CvImportService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: CV_IMPORT_MAX_BYTES, files: 1, fields: 0 } }),
  )
  draft(@UploadedFile() upload: UploadedCv | undefined): Promise<CvImportDraft> {
    if (!upload || upload.size === 0) {
      throw new BadRequestException('Attach the CV as a PDF or DOCX file in the "file" field.');
    }
    return this.imports.draft(identify(upload.buffer));
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Body(new ZodValidationPipe(ConfirmCvImportRequestSchema)) body: ConfirmCvImportRequest,
  ): Promise<ConfirmCvImportResponse> {
    return this.imports.confirm(body);
  }
}

/** Identifies the file by its content (magic bytes), not by its name or declared type. */
function identify(data: Buffer): CvFile {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', data };
  // DOCX files are ZIP archives; mammoth validates the rest.
  if (data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return { kind: 'docx', data };
  }
  throw new BadRequestException('Only PDF and DOCX files can be imported.');
}
