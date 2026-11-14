import pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { query, seedWorkspace, url } from './helpers/db';

interface Col {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
}

let tables: string[] = [];
let A: { userId: string; workspaceId: string };
let B: { userId: string; workspaceId: string };
const inserted: string[] = [];
const skipped: Record<string, string> = {};

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

// Nilai pengisi generik per tipe kolom, agar semua tabel ber-workspace_id tercakup otomatis.
// Tabel dengan CHECK lintas-kolom yang tidak bisa ditebak generik; didokumentasikan eksplisit.
const OVERRIDES: Record<string, Record<string, string>> = {
  time_blocks: { ends_at: `now() + interval '1 hour'` },
};

function sample(
  col: Col,
  enums: Map<string, string>,
  allowed: Map<string, string>,
  ws: string,
  user: string,
): string {
  if (col.column_name === 'workspace_id') return `'${ws}'`;
  const override = OVERRIDES[col.table_name]?.[col.column_name];
  if (override) return override;
  const pick = allowed.get(`${col.table_name}.${col.column_name}`);
  if (pick) return `'${pick}'`;
  if (/(^|_)(user_id|created_by|actor_user_id)$/.test(col.column_name)) return `'${user}'`;
  switch (col.data_type) {
    case 'uuid':
      return 'gen_random_uuid()';
    case 'text':
    case 'character varying':
    case 'character':
      return `'x-' || substr(md5(random()::text), 1, 8)`;
    case 'citext':
      return `'x-' || substr(md5(random()::text), 1, 8)`;
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
      return '1';
    case 'boolean':
      return 'false';
    case 'date':
      return 'current_date';
    case 'jsonb':
    case 'json':
      return `'{}'`;
    case 'bytea':
      return 'gen_random_bytes(16)';
    case 'ARRAY':
      return `'{}'`;
    case 'time without time zone':
      return `'00:00'`;
    case 'USER-DEFINED':
      return `'${enums.get(col.udt_name) ?? ''}'::${q(col.udt_name)}`;
    default:
      if (col.data_type.startsWith('timestamp')) return 'now()';
      return 'NULL';
  }
}

beforeAll(async () => {
  A = await seedWorkspace('A');
  B = await seedWorkspace('B');

  const t = await query<{ table_name: string }>(
    url.admin(),
    `SELECT DISTINCT c.table_name FROM information_schema.columns c
       JOIN information_schema.tables t USING (table_schema, table_name)
      WHERE c.table_schema='public' AND c.column_name='workspace_id' AND t.table_type='BASE TABLE'
      ORDER BY 1`,
  );
  tables = t.rows.map((r) => r.table_name);

  const cols = await query<
    Col & {
      is_nullable: string;
      column_default: string | null;
      is_generated: string;
      is_identity: string;
    }
  >(
    url.admin(),
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, is_generated, is_identity
       FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1)`,
    [tables],
  );
  const en = await query<{ typname: string; label: string }>(
    url.admin(),
    `SELECT t.typname, (array_agg(e.enumlabel ORDER BY e.enumsortorder))[1] AS label
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`,
  );
  const enums = new Map(en.rows.map((r) => [r.typname, r.label]));

  // CHECK satu kolom bentuk `col = ANY (ARRAY['a', ...])` → pakai nilai pertama yang diizinkan.
  const chk = await query<{ tbl: string; col: string; def: string }>(
    url.admin(),
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'c' AND array_length(c.conkey, 1) = 1 AND c.connamespace = 'public'::regnamespace`,
  );
  const allowed = new Map<string, string>();
  for (const r of chk.rows) {
    const m = /ANY \(ARRAY\['([^']+)'/.exec(r.def);
    if (m?.[1]) allowed.set(`${r.tbl}.${r.col}`, m[1]);
  }

  // Superuser + replica: FK & trigger dimatikan HANYA untuk membangun fixture; RLS diuji di bawah.
  const c = new pg.Client({ connectionString: url.admin() });
  await c.connect();
  try {
    await c.query(`SET session_replication_role = replica`);
    for (const [ws, user] of [
      [A.workspaceId, A.userId],
      [B.workspaceId, B.userId],
    ] as const) {
      for (const table of tables) {
        if (table === 'workspace_members') continue; // sudah dibuat seedWorkspace
        const need = cols.rows.filter(
          (x) =>
            x.table_name === table &&
            x.is_generated !== 'ALWAYS' &&
            x.is_identity !== 'YES' &&
            (x.column_name === 'workspace_id' ||
              (x.is_nullable === 'NO' && x.column_default === null)),
        );
        const names = need.map((x) => q(x.column_name)).join(', ');
        const vals = need.map((x) => sample(x, enums, allowed, ws, user)).join(', ');
        try {
          await c.query(`INSERT INTO ${q(table)} (${names}) VALUES (${vals})`);
          if (ws === A.workspaceId) inserted.push(table);
        } catch (e) {
          skipped[table] = (e as Error).message;
        }
      }
    }
  } finally {
    await c.end();
  }
});

async function asApp<T>(ws: string | null, user: string | null, fn: (c: pg.Client) => Promise<T>) {
  const c = new pg.Client({ connectionString: url.app() });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true)`,
      [ws ?? '', user ?? ''],
    );
    const r = await fn(c);
    await c.query('ROLLBACK');
    return r;
  } finally {
    await c.end();
  }
}

describe('isolasi tenant (semua tabel ber-workspace_id)', () => {
  it('menemukan tabel tenant dan RLS FORCE aktif di semuanya', async () => {
    expect(tables.length).toBeGreaterThan(50);
    const r = await query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      url.admin(),
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)`,
      [tables],
    );
    const bad = r.rows
      .filter((x) => !x.relrowsecurity || !x.relforcerowsecurity)
      .map((x) => x.relname);
    expect(bad).toEqual([]);
  });

  it('fixture berhasil dibuat untuk (hampir) semua tabel; yang dilewati dilaporkan', () => {
    // Setiap tabel yang gagal diisi = lubang cakupan. Daftar harus kosong; bila tidak, perbaiki generator.
    expect(skipped).toEqual({});
    expect(inserted.length).toBe(tables.length - 1);
  });

  it('konteks A hanya melihat baris A, tidak pernah baris B, di SEMUA tabel', async () => {
    await asApp(A.workspaceId, A.userId, async (c) => {
      for (const table of tables) {
        const r = await c.query<{ ws: string }>(`SELECT workspace_id AS ws FROM ${q(table)}`);
        const leaked = r.rows.filter((x) => x.ws === B.workspaceId);
        expect(leaked, `bocor di ${table}`).toHaveLength(0);
        if (inserted.includes(table))
          expect(r.rows.length, `A tak terlihat di ${table}`).toBeGreaterThan(0);
      }
    });
  });

  it('tanpa konteks, aplikasi tidak melihat baris tenant mana pun (kecuali kebijakan kepemilikan)', async () => {
    await asApp(null, null, async (c) => {
      for (const table of tables) {
        const r = await c.query(`SELECT 1 FROM ${q(table)}`);
        expect(r.rowCount, `terlihat tanpa konteks: ${table}`).toBe(0);
      }
    });
  });

  it('tidak bisa menulis/mengubah/menghapus baris B dari konteks A', async () => {
    await asApp(A.workspaceId, A.userId, async (c) => {
      for (const table of tables) {
        if (table === 'transactions' || table === 'audit_logs') continue; // hak DELETE dicabut; diuji terpisah
        const del = await c.query(`DELETE FROM ${q(table)} WHERE workspace_id = $1`, [
          B.workspaceId,
        ]);
        expect(del.rowCount, `DELETE lintas tenant di ${table}`).toBe(0);
      }
      const upd = await c
        .query(`UPDATE tasks SET title = 'diretas' WHERE workspace_id = $1`, [B.workspaceId])
        .catch(() => ({ rowCount: 0 }));
      expect(upd.rowCount).toBe(0);
    });
  });

  it('INSERT dengan workspace_id milik tenant lain ditolak oleh RLS', async () => {
    await asApp(A.workspaceId, A.userId, async (c) => {
      await expect(
        c.query(`INSERT INTO labels (workspace_id, name) VALUES ($1, 'x')`, [B.workspaceId]),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('tabel workspaces: A tidak melihat workspace B', async () => {
    await asApp(A.workspaceId, A.userId, async (c) => {
      const r = await c.query<{ id: string }>('SELECT id FROM workspaces');
      expect(r.rows.map((x) => x.id)).toEqual([A.workspaceId]);
    });
  });
});
