import {
  type AddApplicationEventRequest,
  AddApplicationEventRequestSchema,
  type Application,
  type ApplicationEvent,
  type ApplicationEventList,
  type ApplicationList,
  type Contact,
  type ContactInput,
  ContactInputSchema,
  type ContactList,
  type CreateApplicationRequest,
  CreateApplicationRequestSchema,
  type ListApplicationsQuery,
  ListApplicationsQuerySchema,
  type MoveApplicationRequest,
  MoveApplicationRequestSchema,
  type ResumeVersionList,
  type SendApplicationRequest,
  SendApplicationRequestSchema,
  type UpdateApplicationRequest,
  UpdateApplicationRequestSchema,
} from '@careerly/contracts';
import {
  BadRequestException,
  Body,
  type CallHandler,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { ApplicationsService } from '../application/applications.service.js';
import {
  ApplicationAlreadyExistsError,
  ApplicationJobPostingNotFoundError,
  ApplicationNotFoundError,
  ContactNotFoundError,
  UnknownResumeVersionError,
} from '../application/applications.ports.js';
import { InvalidApplicationTransitionError } from '../domain/application.js';

/** Maps the module's errors to HTTP (then shaped by `ApiExceptionFilter`). */
@Injectable()
class ApplicationsErrorsInterceptor implements NestInterceptor {
  intercept(_context: unknown, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((error: unknown) => throwError(() => toHttpError(error))));
  }
}

function toHttpError(error: unknown): unknown {
  if (
    error instanceof ApplicationNotFoundError ||
    error instanceof ApplicationJobPostingNotFoundError ||
    error instanceof ContactNotFoundError
  ) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof ApplicationAlreadyExistsError ||
    error instanceof InvalidApplicationTransitionError
  ) {
    return new ConflictException(error.message);
  }
  if (error instanceof UnknownResumeVersionError) return new BadRequestException(error.message);
  return error;
}

const SendableQuerySchema = z.object({ jobPostingId: z.string().min(1) });

/** Job applications (roadmap 7.3, RF-APP-01, RF-APP-02, RF-APP-08). */
@Controller('applications')
@UseInterceptors(ApplicationsErrorsInterceptor)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  /** All the applications, or the one of a job description (`?jobPostingId=`). */
  @Get()
  list(
    @Query(new ZodValidationPipe(ListApplicationsQuerySchema)) query: ListApplicationsQuery,
  ): Promise<ApplicationList> {
    return this.applications.list(query);
  }

  /** One per job description: saved, or already sent with some of its finalized CVs. */
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateApplicationRequestSchema)) body: CreateApplicationRequest,
  ): Promise<Application> {
    return this.applications.create(body);
  }

  /** The finalized CVs of a job description, which can be sent with its application. */
  @Get('sendable-resumes')
  sendableResumes(
    @Query(new ZodValidationPipe(SendableQuerySchema)) query: { jobPostingId: string },
  ): Promise<ResumeVersionList> {
    return this.applications.sendableResumes(query.jobPostingId);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Application> {
    return this.applications.get(id);
  }

  /** The extra data (RF-APP-07): channel, priority and salaries. */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateApplicationRequestSchema)) body: UpdateApplicationRequest,
  ): Promise<Application> {
    return this.applications.update(id, body);
  }

  /** The contacts (RF-APP-05). */
  @Get(':id/contacts')
  contacts(@Param('id') id: string): Promise<ContactList> {
    return this.applications.contacts(id);
  }

  @Post(':id/contacts')
  addContact(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ContactInputSchema)) body: ContactInput,
  ): Promise<Contact> {
    return this.applications.addContact(id, body);
  }

  @Put(':id/contacts/:contactId')
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body(new ZodValidationPipe(ContactInputSchema)) body: ContactInput,
  ): Promise<Contact> {
    return this.applications.updateContact(id, contactId, body);
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteContact(@Param('id') id: string, @Param('contactId') contactId: string): Promise<void> {
    return this.applications.deleteContact(id, contactId);
  }

  /** It was sent (RF-APP-02): a saved application becomes `APPLIED`; one already sent gets the new CVs. */
  @Post(':id/sent-resumes')
  @HttpCode(HttpStatus.OK)
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendApplicationRequestSchema)) body: SendApplicationRequest,
  ): Promise<Application> {
    return this.applications.send(id, body);
  }

  /**
   * Moves it to another state (kanban, RF-APP-03), validated by the aggregate: 409 when the move needs a
   * confirmation or a sent CV, or the application is closed and the target is not an active state.
   */
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MoveApplicationRequestSchema)) body: MoveApplicationRequest,
  ): Promise<Application> {
    return this.applications.move(id, body);
  }

  /** The timeline (RF-APP-04): changes of state, notes, interviews and messages, oldest first. */
  @Get(':id/events')
  events(@Param('id') id: string): Promise<ApplicationEventList> {
    return this.applications.events(id);
  }

  /**
   * Adds a note, an interview or a message to the timeline. There is no route to change or delete one: the
   * timeline is append-only (roadmap 7.5).
   */
  @Post(':id/events')
  addEvent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddApplicationEventRequestSchema))
    body: AddApplicationEventRequest,
  ): Promise<ApplicationEvent> {
    return this.applications.addEvent(id, body);
  }

  /** Deletes the application, its timeline, contacts and the record of what was sent; the finalized CVs stay. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.applications.delete(id);
  }
}
