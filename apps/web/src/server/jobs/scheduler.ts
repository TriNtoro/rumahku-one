import type { Logger } from 'pino';
import { AppError, notFound } from '@rumahku/shared';

export interface JobContext {
  now: Date;
  log: Logger;
}

/** Kontrak: setiap job HARUS idempoten (penjadwal cron boleh memanggil dua kali). */
export interface Job {
  name: string;
  run(ctx: JobContext): Promise<Record<string, unknown>>;
}

/** Antarmuka tunggal penjadwal; implementasi F0 = endpoint cron yang dipanggil penjadwal eksternal. */
export interface JobScheduler {
  run(name: string, ctx: JobContext): Promise<Record<string, unknown>>;
}

export class CronJobScheduler implements JobScheduler {
  private readonly jobs = new Map<string, Job>();

  constructor(jobs: Job[]) {
    for (const j of jobs) this.jobs.set(j.name, j);
  }

  async run(name: string, ctx: JobContext): Promise<Record<string, unknown>> {
    const job = this.jobs.get(name);
    if (!job) throw notFound();
    try {
      return await job.run(ctx);
    } catch (e) {
      ctx.log.error({ job: name, err: e instanceof Error ? e.message : 'unknown' }, 'job failed');
      throw new AppError(500, 'INTERNAL_ERROR', 'Job gagal');
    }
  }
}
