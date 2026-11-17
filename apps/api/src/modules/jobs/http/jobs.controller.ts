import type { JobEvent, JobView } from '@careerly/contracts';
import { Controller, Get, type MessageEvent, NotFoundException, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JobEvents } from '../application/job-events.js';
import { JobQueue } from '../application/job-queue.js';
import { JobNotFoundError } from '../application/jobs.ports.js';

/** State and progress of background jobs, for the interface (ARCHITECTURE §10). */
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly queue: JobQueue,
    private readonly events: JobEvents,
  ) {}

  @Get(':id')
  get(@Param('id') id: string): JobView {
    return this.view(id);
  }

  /** Server-sent events: the current state, then what happens until the job finishes. */
  @Sse(':id/events')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    const initial = this.view(id);
    return new Observable<MessageEvent>((subscriber) => {
      const send = (event: JobEvent) => subscriber.next({ data: event });
      send({ kind: 'state', job: initial });
      if (initial.status === 'SUCCEEDED' || initial.status === 'FAILED') {
        subscriber.complete();
        return;
      }
      const unsubscribe = this.events.subscribe((event) => {
        if (event.jobId !== id) return;
        send(event);
        if (event.kind === 'succeeded' || event.kind === 'failed') subscriber.complete();
      });
      return unsubscribe;
    });
  }

  private view(id: string): JobView {
    try {
      return this.queue.get(id);
    } catch (error) {
      if (error instanceof JobNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
