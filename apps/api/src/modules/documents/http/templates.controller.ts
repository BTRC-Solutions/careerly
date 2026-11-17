import path from 'node:path';
import {
  type RenameTemplateRequest,
  type ResumeLanguage,
  ResumeLanguageSchema,
  RenameTemplateRequestSchema,
  type TemplateSummary,
  USER_TEMPLATE_MAX_BYTES,
  type UploadTemplateFields,
  UploadTemplateFieldsSchema,
} from '@careerly/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { UserTemplateError } from '../application/documents.ports.js';
import { TemplateExamplesService } from '../application/template-examples.service.js';
import { UserTemplatesService } from '../application/user-templates.service.js';
import { TemplatesErrorsInterceptor } from './templates-errors.interceptor.js';

/** The parts of a Multer upload this controller reads (kept in memory, never written to disk). */
interface UploadedTemplate {
  buffer: Buffer;
  size: number;
  originalname: string;
}

/** The CV templates the user can choose from, and their own `.typ` files (RF-TAIL-09, roadmaps 4.12 and 4.13). */
@Controller('templates')
@UseInterceptors(TemplatesErrorsInterceptor)
export class TemplatesController {
  constructor(
    private readonly templates: UserTemplatesService,
    private readonly examples: TemplateExamplesService,
  ) {}

  @Get()
  list(): Promise<TemplateSummary[]> {
    return this.templates.list();
  }

  /** The default template and the examples, as a `.zip` to start writing one's own. */
  @Get('starter-kit')
  async starterKit(): Promise<StreamableFile> {
    return new StreamableFile(await this.examples.downloadStarterKit(), {
      type: 'application/zip',
      disposition: 'attachment; filename="careerly-template-starter-kit.zip"',
    });
  }

  /** The template rendered with the example in `language`, as a PDF. */
  @Get(':id/preview/:language')
  async preview(
    @Param('id') id: string,
    @Param('language', new ZodValidationPipe(ResumeLanguageSchema)) language: ResumeLanguage,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.examples.preview(id, language), {
      type: 'application/pdf',
    });
  }

  /** Uploads a `.typ` file in the "file" field; the optional "name" field defaults to the file name. */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: USER_TEMPLATE_MAX_BYTES, files: 1 } }),
  )
  upload(
    @UploadedFile() upload: UploadedTemplate | undefined,
    @Body(new ZodValidationPipe(UploadTemplateFieldsSchema)) fields: UploadTemplateFields,
  ): Promise<TemplateSummary> {
    if (!upload || upload.size === 0) {
      throw new BadRequestException('Attach the template as a .typ file in the "file" field.');
    }
    if (!/\.typ$/i.test(upload.originalname)) {
      throw new UserTemplateError('INVALID_FILE', 'Only .typ files can be uploaded as templates.');
    }
    const name = fields.name ?? defaultName(upload.originalname);
    return this.templates.upload(upload.buffer, name);
  }

  @Patch(':id')
  rename(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenameTemplateRequestSchema)) body: RenameTemplateRequest,
  ): Promise<TemplateSummary> {
    return this.templates.rename(id, body.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.templates.delete(id);
  }
}

/** The file name without `.typ`, trimmed and cut to the name length limit. */
function defaultName(originalname: string): string {
  const stem = path
    .basename(originalname)
    .replace(/\.typ$/i, '')
    .trim()
    .slice(0, 80);
  return stem || 'Template';
}
