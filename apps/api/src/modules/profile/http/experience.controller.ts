import {
  type Achievement,
  type CreateAchievementRequest,
  CreateAchievementRequestSchema,
  type CreatePositionRequest,
  CreatePositionRequestSchema,
  type CreateProjectRequest,
  CreateProjectRequestSchema,
  type Position,
  type Project,
  type ReorderAchievementsRequest,
  ReorderAchievementsRequestSchema,
  type UpdateAchievementRequest,
  UpdateAchievementRequestSchema,
  type UpdatePositionRequest,
  UpdatePositionRequestSchema,
  type UpdateProjectRequest,
  UpdateProjectRequestSchema,
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
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { ExperienceService } from '../application/experience.service.js';
import { ProfileErrorsInterceptor } from './profile-errors.interceptor.js';

/** Positions and projects with their achievements (RF-PROF-02 to RF-PROF-04). */
@Controller('profile')
@UseInterceptors(ProfileErrorsInterceptor)
export class ExperienceController {
  constructor(private readonly experience: ExperienceService) {}

  // --- Positions -----------------------------------------------------------------

  @Post('positions')
  createPosition(
    @Body(new ZodValidationPipe(CreatePositionRequestSchema)) body: CreatePositionRequest,
  ): Promise<Position> {
    return this.experience.createPosition(body);
  }

  @Get('positions/:id')
  getPosition(@Param('id') id: string): Promise<Position> {
    return this.experience.getPosition(id);
  }

  @Patch('positions/:id')
  updatePosition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePositionRequestSchema)) body: UpdatePositionRequest,
  ): Promise<Position> {
    return this.experience.updatePosition(id, body);
  }

  @Delete('positions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePosition(@Param('id') id: string): Promise<void> {
    return this.experience.delete('position', id);
  }

  @Post('positions/:id/achievements')
  addPositionAchievement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateAchievementRequestSchema)) body: CreateAchievementRequest,
  ): Promise<Achievement> {
    return this.experience.createAchievement({ kind: 'position', id }, body);
  }

  @Put('positions/:id/achievements/order')
  async reorderPositionAchievements(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReorderAchievementsRequestSchema)) body: ReorderAchievementsRequest,
  ): Promise<ReorderAchievementsRequest> {
    return {
      achievementIds: await this.experience.reorderAchievements(
        { kind: 'position', id },
        body.achievementIds,
      ),
    };
  }

  // --- Projects ------------------------------------------------------------------

  @Post('projects')
  createProject(
    @Body(new ZodValidationPipe(CreateProjectRequestSchema)) body: CreateProjectRequest,
  ): Promise<Project> {
    return this.experience.createProject(body);
  }

  @Get('projects/:id')
  getProject(@Param('id') id: string): Promise<Project> {
    return this.experience.getProject(id);
  }

  @Patch('projects/:id')
  updateProject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProjectRequestSchema)) body: UpdateProjectRequest,
  ): Promise<Project> {
    return this.experience.updateProject(id, body);
  }

  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProject(@Param('id') id: string): Promise<void> {
    return this.experience.delete('project', id);
  }

  @Post('projects/:id/achievements')
  addProjectAchievement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateAchievementRequestSchema)) body: CreateAchievementRequest,
  ): Promise<Achievement> {
    return this.experience.createAchievement({ kind: 'project', id }, body);
  }

  @Put('projects/:id/achievements/order')
  async reorderProjectAchievements(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReorderAchievementsRequestSchema)) body: ReorderAchievementsRequest,
  ): Promise<ReorderAchievementsRequest> {
    return {
      achievementIds: await this.experience.reorderAchievements(
        { kind: 'project', id },
        body.achievementIds,
      ),
    };
  }

  // --- Achievements (of positions or projects) ----------------------------------

  @Get('achievements/:id')
  getAchievement(@Param('id') id: string): Promise<Achievement> {
    return this.experience.getAchievement(id);
  }

  @Patch('achievements/:id')
  updateAchievement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAchievementRequestSchema)) body: UpdateAchievementRequest,
  ): Promise<Achievement> {
    return this.experience.updateAchievement(id, body);
  }

  @Delete('achievements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAchievement(@Param('id') id: string): Promise<void> {
    return this.experience.deleteAchievement(id);
  }
}
