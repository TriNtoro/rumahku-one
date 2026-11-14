import pg from 'pg';
import { createDb, type Db } from '@/server/db';

export const url = {
  admin: () => process.env.TEST_ADMIN_URL!,
  owner: () => process.env.TEST_OWNER_URL!,
  app: () => process.env.TEST_APP_URL!,
};

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  connectionString: string,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const c = new pg.Client({ connectionString });
  await c.connect();
  try {
    return await c.query<T>(sql, params);
  } finally {
    await c.end();
  }
}

export const appDb = (max = 3): Db => createDb({ connectionString: url.app(), max });

/** Buat pengguna + workspace + keanggotaan lewat superuser (melewati RLS) untuk fixture tes. */
export async function seedWorkspace(label: string, role = 'owner') {
  const u = await query<{ id: string }>(
    url.admin(),
    `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'x') RETURNING id`,
    [`${label}-${Math.random().toString(36).slice(2)}@example.test`, label],
  );
  const userId = u.rows[0]!.id;
  const w = await query<{ id: string }>(
    url.admin(),
    `INSERT INTO workspaces (name, kind, created_by) VALUES ($1, 'household', $2) RETURNING id`,
    [label, userId],
  );
  const workspaceId = w.rows[0]!.id;
  await query(
    url.admin(),
    `INSERT INTO workspace_members (workspace_id, user_id, role_key) VALUES ($1, $2, $3)`,
    [workspaceId, userId, role],
  );
  return { userId, workspaceId };
}
