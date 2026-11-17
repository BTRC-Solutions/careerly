import type { JobEvent, JobProgress } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';

/** Events of running jobs (not `state`, which is built per subscriber). */
export type JobRuntimeEvent = Exclude<JobEvent, { kind: 'state' }>;

/**
 * In-memory events of the jobs being run (ARCHITECTURE §10), relayed to the interface by SSE. Also keeps
 * the last progress of each running job, so a late subscriber sees it. Nothing here is persisted.
 */
@Injectable()
export class JobEvents {
  private readonly listeners = new Set<(event: JobRuntimeEvent) => void>();
  private readonly progress = new Map<string, JobProgress>();

  subscribe(listener: (event: JobRuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: JobRuntimeEvent): void {
    if (event.kind === 'progress') this.progress.set(event.jobId, event.progress);
    if (event.kind !== 'progress' && event.kind !== 'started') this.progress.delete(event.jobId);
    for (const listener of this.listeners) listener(event);
  }

  lastProgress(jobId: string): JobProgress | null {
    return this.progress.get(jobId) ?? null;
  }
}
