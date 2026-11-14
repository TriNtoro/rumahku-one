import { afterAll, describe, expect, it } from 'vitest';
import { AppError } from '@rumahku/shared';
import { appDb, query, seedWorkspace, url } from './helpers/db';

// Pool 1 koneksi meniru pooler mode transaksi: satu koneksi dipakai bergantian oleh banyak request.
const db = appDb(1);
afterAll(() => db.end());

describe('withTenant (aman untuk pooler transaksi)', () => {
  it('konteks tidak bocor ke transaksi berikutnya pada koneksi yang sama', async () => {
    const A = await seedWorkspace('pool-A');
    await db.withTenant(A, async (c) => {
      const r = await c.query(`SELECT current_setting('app.workspace_id', true) AS w`);
      expect(r.rows[0].w).toBe(A.workspaceId);
    });
    const after = await db.withTransaction((c) =>
      c.query(
        `SELECT nullif(current_setting('app.workspace_id', true), '') AS w, nullif(current_setting('app.user_id', true), '') AS u`,
      ),
    );
    expect(after.rows[0]).toEqual({ w: null, u: null });
  });

  it('request bergantian A/B/A/B secara bersamaan tidak saling melihat data', async () => {
    const A = await seedWorkspace('conc-A');
    const B = await seedWorkspace('conc-B');
    for (const w of [A, B]) {
      await query(url.admin(), `INSERT INTO labels (workspace_id, name) VALUES ($1, $2)`, [
        w.workspaceId,
        `label-${w.workspaceId}`,
      ]);
    }
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const w = i % 2 === 0 ? A : B;
        return db.withTenant(w, async (c) => {
          const r = await c.query<{ name: string }>('SELECT name FROM labels');
          return { want: w.workspaceId, names: r.rows.map((x) => x.name) };
        });
      }),
    );
    for (const r of results) expect(r.names).toEqual([`label-${r.want}`]);
  });

  it('rollback saat error dan koneksi tetap sehat sesudahnya', async () => {
    const A = await seedWorkspace('rb');
    await expect(
      db.withTenant(A, async (c) => {
        await c.query(`INSERT INTO labels (workspace_id, name) VALUES ($1, 'sementara')`, [
          A.workspaceId,
        ]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const n = await db.withTenant(A, async (c) => (await c.query('SELECT 1 FROM labels')).rowCount);
    expect(n).toBe(0);
  });

  it('non-anggota → 404 (bukan 403), juga untuk workspace yang tidak ada dan UUID rusak', async () => {
    const A = await seedWorkspace('mem-A');
    const B = await seedWorkspace('mem-B');
    for (const ctx of [
      { workspaceId: B.workspaceId, userId: A.userId },
      { workspaceId: '00000000-0000-4000-8000-000000000000', userId: A.userId },
      { workspaceId: "x'; DROP TABLE tasks;--", userId: A.userId },
    ]) {
      const err = await db.withTenant(ctx, async () => 1).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(404);
    }
  });

  it('anggota yang sudah dikeluarkan kehilangan akses', async () => {
    const A = await seedWorkspace('removed');
    await query(url.admin(), `UPDATE workspace_members SET removed_at = now() WHERE user_id = $1`, [
      A.userId,
    ]);
    const err = await db.withTenant(A, async () => 1).catch((e: unknown) => e);
    expect((err as AppError).status).toBe(404);
  });

  it('mengembalikan peran anggota', async () => {
    const A = await seedWorkspace('role', 'adult');
    const m = await db.withTenant(A, async (_c, m) => m);
    expect(m.role).toBe('adult');
  });
});
