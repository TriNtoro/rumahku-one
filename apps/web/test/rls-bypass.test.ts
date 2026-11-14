import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { query, seedWorkspace, url } from './helpers/db';

async function asApp(sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: url.app() });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

describe('role aplikasi tidak bisa melemahkan RLS', () => {
  it('bukan superuser, tanpa BYPASSRLS, bukan pemilik tabel', async () => {
    const r = await query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(
      url.admin(),
      `SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'rumahku_app'`,
    );
    expect(r.rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
    const owned = await query(
      url.admin(),
      `SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner = 'rumahku_app'`,
    );
    expect(owned.rowCount).toBe(0);
  });

  it.each([
    ['DISABLE ROW LEVEL SECURITY', 'ALTER TABLE tasks DISABLE ROW LEVEL SECURITY'],
    ['NO FORCE ROW LEVEL SECURITY', 'ALTER TABLE tasks NO FORCE ROW LEVEL SECURITY'],
    ['DROP POLICY', 'DROP POLICY tenant_isolation ON tasks'],
    ['CREATE POLICY', 'CREATE POLICY bocor ON tasks USING (true)'],
    ['ALTER ROLE BYPASSRLS', 'ALTER ROLE rumahku_app BYPASSRLS'],
    ['SET ROLE owner', 'SET ROLE rumahku_owner'],
    ['session_replication_role', `SET session_replication_role = replica`],
    ['DROP TABLE', 'DROP TABLE tasks'],
  ])('menolak: %s', async (_name, sql) => {
    await expect(asApp(sql)).rejects.toThrow(
      /must be owner|permission denied|not permitted|cannot|superuser|privilege/i,
    );
  });

  it('row_security=off tidak melonggarkan: kueri ditolak, bukan membocorkan baris', async () => {
    await seedWorkspace('rls-off');
    const c = new pg.Client({ connectionString: url.app() });
    await c.connect();
    try {
      await c.query('SET row_security = off');
      await expect(c.query('SELECT * FROM tasks')).rejects.toThrow(/row-level security/i);
    } finally {
      await c.end();
    }
  });

  it('transaksi tidak bisa di-DELETE; audit_logs append-only; roles/permissions tidak bisa diubah', async () => {
    await expect(asApp('DELETE FROM transactions')).rejects.toThrow(/permission denied/i);
    await expect(asApp(`UPDATE audit_logs SET action = 'x'`)).rejects.toThrow(/permission denied/i);
    await expect(asApp('DELETE FROM audit_logs')).rejects.toThrow(/permission denied/i);
    await expect(asApp(`INSERT INTO roles (key, label) VALUES ('hacker', 'x')`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asApp(`DELETE FROM role_permissions`)).rejects.toThrow(/permission denied/i);
    await expect(
      asApp(`INSERT INTO permissions (key, description) VALUES ('x.y.z', 'x')`),
    ).rejects.toThrow(/permission denied/i);
  });
});
