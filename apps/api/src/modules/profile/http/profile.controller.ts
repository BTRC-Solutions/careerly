import {
  type Certification,
  type CreateCertificationRequest,
  CreateCertificationRequestSchema,
  type CreateEducationRequest,
  CreateEducationRequestSchema,
  type CreateLanguageSkillRequest,
  CreateLanguageSkillRequestSchema,
  type Education,
  type LanguageSkill,
  type PersonalInfo,
  type Profile,
  type UpdateCertificationRequest,
  UpdateCertificationRequestSchema,
  type UpdateEducationRequest,
  UpdateEducationRequestSchema,
  type UpdateLanguageSkillRequest,
  UpdateLanguageSkillRequestSchema,
  type UpdatePersonalInfoRequest,
  UpdatePersonalInfoRequestSchema,
} from '@careerly/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { ProfileService } from '../application/profile.service.js';
import { ProfileErrorsInterceptor } from './profile-errors.interceptor.js';

/** Whole profile, personal information, education, certifications and languages. */
@Controller('profile')
@UseInterceptors(ProfileErrorsInterceptor)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(): Promise<Profile> {
    return this.profile.getProfile();
  }

  @Patch('personal-info')
  updatePersonalInfo(
    @Body(new ZodValidationPipe(UpdatePersonalInfoRequestSchema)) body: UpdatePersonalInfoRequest,
  ): Promise<PersonalInfo> {
    return this.profile.updatePersonalInfo(body);
  }

  // --- Education ---------------------------------------------------------------

  @Post('education')
  createEducation(
    @Body(new ZodValidationPipe(CreateEducationRequestSchema)) body: CreateEducationRequest,
  ): Promise<Education> {
    return this.profile.createEducation(body);
  }

  @Patch('education/:id')
  updateEducation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEducationRequestSchema)) body: UpdateEducationRequest,
  ): Promise<Education> {
    return this.profile.updateEducation(id, body);
  }

  @Delete('education/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEducation(@Param('id') id: string): Promise<void> {
    return this.profile.deleteFromSection('education', id);
  }

  // --- Certifications ------------------------------------------------------------

  @Post('certifications')
  createCertification(
    @Body(new ZodValidationPipe(CreateCertificationRequestSchema))
    body: CreateCertificationRequest,
  ): Promise<Certification> {
    return this.profile.createCertification(body);
  }

  @Patch('certifications/:id')
  updateCertification(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCertificationRequestSchema))
    body: UpdateCertificationRequest,
  ): Promise<Certification> {
    return this.profile.updateCertification(id, body);
  }

  @Delete('certifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCertification(@Param('id') id: string): Promise<void> {
    return this.profile.deleteFromSection('certifications', id);
  }

  // --- Languages -----------------------------------------------------------------

  @Post('languages')
  createLanguage(
    @Body(new ZodValidationPipe(CreateLanguageSkillRequestSchema))
    body: CreateLanguageSkillRequest,
  ): Promise<LanguageSkill> {
    return this.profile.createLanguage(body);
  }

  @Patch('languages/:id')
  updateLanguage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLanguageSkillRequestSchema))
    body: UpdateLanguageSkillRequest,
  ): Promise<LanguageSkill> {
    return this.profile.updateLanguage(id, body);
  }

  @Delete('languages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLanguage(@Param('id') id: string): Promise<void> {
    return this.profile.deleteFromSection('languages', id);
  }
}
