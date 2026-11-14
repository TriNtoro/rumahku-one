import pg from 'pg';
import { notFound, type RoleKey } from '@rumahku/shared';
import { z } from 'zod';
import { getEnv } from './env';

export type Tx = pg.PoolClient;

export interface TenantContext {
  workspaceId: string;
  userId: string;
}

export interface Membership {
  memberId: string;
  role: RoleKey;
}

export interface Db {
  pool: pg.Pool;
  /** Transaksi tanpa konteks tenant: hanya untuk tabel auth (users, sessions, ...). */
  withTransaction<T>(fn: (c: Tx) => Promise<T>): Promise<T>;
  /** Transaksi dengan app.user_id saja (mis. daftar workspace milik pengguna). */
  withUser<T>(userId: string, fn: (c: Tx) => Promise<T>): Promise<T>;
  /** Transaksi dengan konteks tenant penuh; non-anggota → 404 (tidak membocorkan keberadaan). */
  withTenant<T>(ctx: TenantContext, fn: (c: Tx, m: Membership) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

const uuid = z.string().uuid();

export function createDb(opts: { connectionString: string; max: number }): Db {
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max,
    application_name: 'rumahku-web',
  });

  async function tx<T>(setup: (c: Tx) => Promise<void>, fn: (c: Tx) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c);
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  // set_config(..., true) = SET LOCAL yang bisa diparameterkan; aman di pooler mode transaksi
  // karena nilai hilang saat COMMIT/ROLLBACK dan tidak pernah menempel di sesi.
  const setContext = (c: Tx, workspaceId: string | null, userId: string | null) =>
    c.query(
      `SELECT set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true)`,
      [workspaceId ?? '', userId ?? ''],
    );

  return {
    pool,
    withTransaction: (fn) => tx(async () => undefined, fn),
    withUser: (userId, fn) => {
      if (!uuid.safeParse(userId).success) throw notFound();
      return tx((c) => setContext(c, null, userId).then(() => undefined), fn);
    },
    withTenant: async (ctx, fn) => {
      if (!uuid.safeParse(ctx.workspaceId).success || !uuid.safeParse(ctx.userId).success) {
        throw notFound();
      }
      return tx(
        (c) => setContext(c, ctx.workspaceId, ctx.userId).then(() => undefined),
        async (c) => {
          const r = await c.query<{ id: string; role_key: RoleKey }>(
            `SELECT m.id, m.role_key
               FROM workspace_members m
               JOIN workspaces w ON w.id = m.workspace_id
              WHERE m.workspace_id = $1 AND m.user_id = $2
                AND m.removed_at IS NULL AND w.deleted_at IS NULL`,
            [ctx.workspaceId, ctx.userId],
          );
          const row = r.rows[0];
          if (!row) throw notFound();
          return fn(c, { memberId: row.id, role: row.role_key });
        },
      );
    },
    end: () => pool.end(),
  };
}

let shared: Db | undefined;
const g = globalThis as unknown as { __rumahkuDb?: Db };

// Singleton per proses; disimpan di globalThis agar tidak membocorkan pool saat hot-reload dev.
export function getDb(): Db {
  if (shared) return shared;
  const env = getEnv();
  shared = g.__rumahkuDb ??= createDb({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX });
  return shared;
}
