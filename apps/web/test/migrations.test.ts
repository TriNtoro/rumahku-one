import { randomBytes } from 'node:crypto';
import {
  createDatabase,
  dropDatabase,
  migrateDown,
  migrateUp,
  withDatabase,
} from '@rumahku/db-tools';
import { afterAll, describe, expect, it } from 'vitest';
import { query, url } from './helpers/db';

const name = `rumahku_mig_${randomBytes(4).toString('hex')}`;
const adminPg = () => withDatabase(url.admin(), 'postgres');
const ownerUrl = () => withDatabase(url.owner(), name);
const opts = () => ({
  ownerUrl: ownerUrl(),
  migrationsDir: process.env.TEST_MIGRATIONS_DIR!,
  rollbacksDir: process.env.TEST_ROLLBACKS_DIR!,
});
const tableCount = async () =>
  Number(
    (
      await query<{ n: string }>(
        withDatabase(url.admin(), name),
        `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
      )
    ).rows[0]!.n,
  );

afterAll(async () => {
  await dropDatabase(adminPg(), name);
});

describe('migrasi dapat dibalik', () => {
  it('maju → mundur penuh → maju lagi pada PostgreSQL nyata', async () => {
    await createDatabase(adminPg(), name);

    const up1 = await migrateUp(opts());
    expect(up1).toHaveLength(2);
    expect(await tableCount()).toBe(69);

    expect(await migrateUp(opts())).toEqual([]); // idempoten

    const down = await migrateDown(opts(), 2);
    expect(down).toHaveLength(2);
    expect(await tableCount()).toBe(0);

    const up2 = await migrateUp(opts());
    expect(up2).toHaveLength(2);
    expect(await tableCount()).toBe(69);
  });

  it('mundur satu langkah hanya melepas migrasi 0002 dan menjaga skema dasar', async () => {
    await migrateDown(opts(), 1);
    expect(await tableCount()).toBe(69);
    const rls = await query<{ relrowsecurity: boolean }>(
      withDatabase(url.admin(), name),
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'workspaces' AND relnamespace = 'public'::regnamespace`,
    );
    expect(rls.rows[0]!.relrowsecurity).toBe(false);
    await migrateUp(opts());
  });

  it('riwayat migrasi tidak dapat diakses role aplikasi', async () => {
    const r = await query<{ ok: boolean }>(
      url.admin(),
      `SELECT has_schema_privilege('rumahku_app', 'rumahku_meta', 'USAGE') AS ok`,
    );
    expect(r.rows[0]!.ok).toBe(false);
  });
});
