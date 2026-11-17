import { type JobEvent, JobEventSchema, type JobView, JobViewSchema } from '@careerly/contracts';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../platform/database/database.service.js';
import { inTransaction } from '../../platform/database/sqlite.js';
import { createTempDir } from '../../test-support/temp-dir.js';
import {
  type RunningServer,
  startTestServer,
  TEST_TOKEN,
  testConfig,
} from '../../test-support/test-server.js';
import { type JobHandler, JobQueue, JobRunner, PermanentJobError } from './index.js';

/*
 * The jobs module end to end (roadmap 4.3, ARCHITECTURE §10): persisted queue, executor with retries and
 * concurrency, resumption after closing the app, and progress by SSE.
 */

const ENV = { CAREERLY_JOB_RETRY_BASE_MS: '20' };

/** A handler whose runs wait until `release()`; it records how many run at the same time. */
function gatedHandler(type: string) {
  const gates: (() => void)[] = [];
  let running = 0;
  const state = { maxRunning: 0, runs: 0 };
  const handler: JobHandler = {
    type,
    run: async () => {
      state.runs += 1;
      running += 1;
      state.maxRunning = Math.max(state.maxRunning, running);
      await new Promise<void>((resolve) => gates.push(resolve));
      running -= 1;
    },
  };
  return {
    handler,
    state,
    release: () => gates.splice(0).forEach((open) => open()),
    waiting: () => gates.length,
  };
}

async function waitFor<T>(check: () => T | undefined | false, timeoutMs = 5000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for a condition.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('jobs (integration)', () => {
  let temp: ReturnType<typeof createTempDir>;
  let server: RunningServer | undefined;

  beforeEach(() => {
    temp = createTempDir();
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    temp.cleanup();
  });

  async function start() {
    server = await startTestServer(testConfig(path.join(temp.dir, 'data'), ENV));
    return {
      queue: server.app.get(JobQueue),
      runner: server.app.get(JobRunner),
    };
  }

  function statusOf(queue: JobQueue, id: string, status: JobView['status']) {
    return () => queue.get(id).status === status && queue.get(id);
  }

  it('runs a job with its payload and keeps the result', async () => {
    const { queue, runner } = await start();
    const payloads: unknown[] = [];
    runner.register({ type: 'echo', run: async (payload) => void payloads.push(payload) });

    const job = queue.enqueue({ type: 'echo', payload: { sessionId: 's-1' } });
    expect(job).toMatchObject({ type: 'echo', status: 'PENDING', attempts: 0, maxAttempts: 3 });

    const done = await waitFor(statusOf(queue, job.id, 'SUCCEEDED'));
    expect(done).toMatchObject({ attempts: 1, lastError: null });
    expect(done.finishedAt).not.toBeNull();
    expect(payloads).toEqual([{ sessionId: 's-1' }]);

    const response = await fetch(`http://127.0.0.1:${server!.port}/jobs/${job.id}`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(JobViewSchema.parse(await response.json()).status).toBe('SUCCEEDED');
  });

  it('retries with backoff and records only the error code', async () => {
    const { queue, runner } = await start();
    let calls = 0;
    runner.register({
      type: 'flaky',
      run: async () => {
        calls += 1;
        if (calls < 3) {
          throw Object.assign(new Error('the JD said something private'), { code: 'RATE_LIMITED' });
        }
      },
    });

    const job = queue.enqueue({ type: 'flaky', payload: null });

    const done = await waitFor(statusOf(queue, job.id, 'SUCCEEDED'));
    expect(done.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('gives up after the last attempt, or at once on a permanent error', async () => {
    const { queue, runner } = await start();
    runner.register({
      type: 'broken',
      run: () => Promise.reject(Object.assign(new Error('secret'), { code: 'UNAVAILABLE' })),
    });
    runner.register({
      type: 'gone',
      run: () => Promise.reject(new PermanentJobError('SESSION_DELETED')),
    });

    const broken = queue.enqueue({ type: 'broken', payload: null, maxAttempts: 2 });
    const gone = queue.enqueue({ type: 'gone', payload: null });

    expect(await waitFor(statusOf(queue, broken.id, 'FAILED'))).toMatchObject({
      attempts: 2,
      lastError: 'UNAVAILABLE',
    });
    expect(await waitFor(statusOf(queue, gone.id, 'FAILED'))).toMatchObject({
      attempts: 1,
      lastError: 'SESSION_DELETED',
    });
  });

  it('enqueues once per dedupe key, and again after a failure', async () => {
    const { queue, runner } = await start();
    let fail = true;
    runner.register({
      type: 'step',
      run: () => (fail ? Promise.reject(new PermanentJobError('NOPE')) : Promise.resolve()),
    });

    const first = queue.enqueue({ type: 'step', payload: null, dedupeKey: 's-1:analysis' });
    expect(queue.enqueue({ type: 'step', payload: null, dedupeKey: 's-1:analysis' }).id).toBe(
      first.id,
    );
    await waitFor(statusOf(queue, first.id, 'FAILED'));

    fail = false;
    const again = queue.enqueue({ type: 'step', payload: null, dedupeKey: 's-1:analysis' });
    expect(again).toMatchObject({ id: first.id, status: 'PENDING', attempts: 0 });
    await waitFor(statusOf(queue, first.id, 'SUCCEEDED'));
  });

  it('enqueues in the same transaction as the change that needs the job', async () => {
    const { queue } = await start();
    const database = server!.app.get(DatabaseService);
    let enqueued: JobView | undefined;

    expect(() =>
      inTransaction(database.connection, () => {
        enqueued = queue.enqueue({ type: 'never-registered', payload: null });
        throw new Error('the state change failed');
      }),
    ).toThrow('the state change failed');

    expect(() => queue.get(enqueued!.id)).toThrow('does not exist');
  });

  it('runs at most two jobs at the same time', async () => {
    const { queue, runner } = await start();
    const gate = gatedHandler('slow');
    runner.register(gate.handler);

    const jobs = [1, 2, 3].map(() => queue.enqueue({ type: 'slow', payload: null }));
    await waitFor(() => gate.waiting() === 2);
    expect(jobs.map((job) => queue.get(job.id).status).sort()).toEqual([
      'PENDING',
      'RUNNING',
      'RUNNING',
    ]);

    gate.release();
    await waitFor(() => gate.waiting() === 1);
    gate.release();
    await waitFor(() => jobs.every((job) => queue.get(job.id).status === 'SUCCEEDED'));
    expect(gate.state.maxRunning).toBe(2);
  });

  it('completes a job interrupted by closing the app when it opens again (RNF-13)', async () => {
    const first = await start();
    const gate = gatedHandler('long');
    first.runner.register(gate.handler);
    const job = first.queue.enqueue({ type: 'long', payload: { sessionId: 's-1' } });
    await waitFor(() => gate.waiting() === 1);
    expect(first.queue.get(job.id).status).toBe('RUNNING');

    // Close the app mid-way; the attempt finishing afterwards must not be recorded.
    await server!.close();
    server = undefined;
    gate.release();

    const second = await start();
    const payloads: unknown[] = [];
    second.runner.register({ type: 'long', run: async (payload) => void payloads.push(payload) });

    const done = await waitFor(statusOf(second.queue, job.id, 'SUCCEEDED'));
    expect(done.attempts).toBe(2);
    expect(payloads).toEqual([{ sessionId: 's-1' }]);
  });

  it('streams the state and progress by SSE until the job ends', async () => {
    const { queue, runner } = await start();
    const gate = gatedHandler('reported');
    runner.register({
      type: 'reported',
      run: async (payload, context) => {
        context.report({ step: 'matching', done: 1, total: 2 });
        await gate.handler.run(payload, context);
      },
    });
    const job = queue.enqueue({ type: 'reported', payload: null });
    await waitFor(() => gate.waiting() === 1);

    const response = await fetch(`http://127.0.0.1:${server!.port}/jobs/${job.id}/events`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reading = readEvents(response);
    gate.release();
    const events = await reading;

    expect(events[0]).toMatchObject({
      kind: 'state',
      job: { status: 'RUNNING', progress: { step: 'matching', done: 1, total: 2 } },
    });
    expect(events.at(-1)).toEqual({ kind: 'succeeded', jobId: job.id });
  });

  it('answers 404 for an unknown job', async () => {
    await start();
    const response = await fetch(`http://127.0.0.1:${server!.port}/jobs/nope`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(response.status).toBe(404);
  });
});

/** Reads a server-sent events response until it ends. */
async function readEvents(response: Response): Promise<JobEvent[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JobEventSchema.parse(JSON.parse(line.slice('data: '.length))));
}
