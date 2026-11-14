import { getDb } from '../db';
import { CronJobScheduler, type Job } from './scheduler';

// F0 hanya memuat job heartbeat; job reminder/sinkron menyusul di F1c/F3.
export const heartbeat: Job = {
  name: 'heartbeat',
  async run() {
    const r = await getDb().withTransaction((c) => c.query<{ ok: number }>('SELECT 1 AS ok'));
    return { db: r.rows[0]?.ok === 1 };
  },
};

export const scheduler = new CronJobScheduler([heartbeat]);
