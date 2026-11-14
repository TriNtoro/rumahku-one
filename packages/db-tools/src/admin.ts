import pg from 'pg';

// Peran & database dibuat oleh admin (superuser lokal/CI, atau pemilik proyek di Supabase).
// Kata sandi selalu datang dari argumen/env — tidak pernah di-hardcode.
export const OWNER_ROLE = 'rumahku_owner';
export const APP_ROLE = 'rumahku_app';

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Nama tidak valid: ${name}`);
  return `"${name}"`;
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function withAdmin<T>(adminUrl: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function ensureRoles(
  adminUrl: string,
  passwords: { owner: string; app: string },
): Promise<void> {
  await withAdmin(adminUrl, async (c) => {
    // CREATE/ALTER ROLE tidak mendukung parameter, maka literal di-escape manual.
    for (const [role, pw] of [
      [OWNER_ROLE, passwords.owner],
      [APP_ROLE, passwords.app],
    ] as const) {
      const exists = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const verb = exists.rowCount ? 'ALTER' : 'CREATE';
      await c.query(
        `${verb} ROLE ${ident(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${literal(pw)}`,
      );
    }
  });
}

export async function createDatabase(adminUrl: string, name: string): Promise<void> {
  await withAdmin(adminUrl, async (c) => {
    await c.query(`CREATE DATABASE ${ident(name)} OWNER ${ident(OWNER_ROLE)}`);
  });
}

export async function dropDatabase(adminUrl: string, name: string): Promise<void> {
  await withAdmin(adminUrl, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${ident(name)} WITH (FORCE)`);
  });
}

export function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export function withCredentials(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}
