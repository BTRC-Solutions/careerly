import { Controller, Get, Param, StreamableFile, UseInterceptors } from '@nestjs/common';
import { ResumeVersionsService } from '../application/resume-versions.service.js';
import { TemplatesErrorsInterceptor } from './templates-errors.interceptor.js';

/** Finalized CVs (RF-TAIL-14); they are listed by their tailoring session. */
@Controller('resume-versions')
@UseInterceptors(TemplatesErrorsInterceptor)
export class ResumeVersionsController {
  constructor(private readonly versions: ResumeVersionsService) {}

  /** Exactly the PDF that was finalized, never rendered again (RF-APP-08). */
  @Get(':id/pdf')
  async pdf(@Param('id') id: string): Promise<StreamableFile> {
    const { pdf, fileName } = await this.versions.pdf(id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }
}
