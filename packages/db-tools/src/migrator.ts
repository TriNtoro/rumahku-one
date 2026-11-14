import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Riwayat migrasi disimpan di schema terpisah yang TIDAK dapat diakses role aplikasi.
const META = 'rumahku_meta';

export interface MigratorOptions {
  /** URL role owner migrasi (bukan role aplikasi). */
  ownerUrl: string;
  /** Folder berisi <versi>_<nama>.sql. */
  migrationsDir: string;
  /** Folder berisi <versi>_<nama>.down.sql. */
  rollbacksDir: string;
}

interface Migration {
  version: string;
  name: string;
  file: string;
}

function listMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const m = /^(\d+)_(.+)\.sql$/.exec(file);
      if (!m) throw new Error(`Nama migrasi tidak valid: ${file}`);
      return { version: m[1]!, name: m[2]!, file };
    });
}

async function ensureMeta(c: pg.Client): Promise<void> {
  await c.query(`CREATE SCHEMA IF NOT EXISTS ${META}`);
  await c.query(
    `CREATE TABLE IF NOT EXISTS ${META}.schema_migrations (
       version text PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
}

async function applied(c: pg.Client): Promise<string[]> {
  const r = await c.query<{ version: string }>(
    `SELECT version FROM ${META}.schema_migrations ORDER BY version`,
  );
  return r.rows.map((x) => x.version);
}

async function withClient<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function migrateUp(opts: MigratorOptions): Promise<string[]> {
  return withClient(opts.ownerUrl, async (c) => {
    await ensureMeta(c);
    const done = new Set(await applied(c));
    const ran: string[] = [];
    for (const m of listMigrations(opts.migrationsDir)) {
      if (done.has(m.version)) continue;
      const sql = readFileSync(path.join(opts.migrationsDir, m.file), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query(`INSERT INTO ${META}.schema_migrations (version, name) VALUES ($1, $2)`, [
          m.version,
          m.name,
        ]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Migrasi ${m.file} gagal: ${(e as Error).message}`);
      }
      ran.push(m.file);
    }
    return ran;
  });
}

/** Mundur `steps` migrasi terakhir (default 1). Gunakan steps besar untuk semuanya. */
export async function migrateDown(opts: MigratorOptions, steps = 1): Promise<string[]> {
  return withClient(opts.ownerUrl, async (c) => {
    await ensureMeta(c);
    const done = await applied(c);
    const all = listMigrations(opts.migrationsDir);
    const ran: string[] = [];
    for (const version of done.reverse().slice(0, steps)) {
      const m = all.find((x) => x.version === version);
      if (!m) throw new Error(`Migrasi ${version} tidak ditemukan di disk`);
      const downFile = `${m.version}_${m.name}.down.sql`;
      const sql = readFileSync(path.join(opts.rollbacksDir, downFile), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query(`DELETE FROM ${META}.schema_migrations WHERE version = $1`, [version]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Rollback ${downFile} gagal: ${(e as Error).message}`);
      }
      ran.push(downFile);
    }
    return ran;
  });
}

export async function applySeed(ownerUrl: string, seedFile: string): Promise<void> {
  const sql = readFileSync(seedFile, 'utf8');
  await withClient(ownerUrl, (c) => c.query(sql).then(() => undefined));
}
