import { AppError } from '@rumahku/shared';
import type { Db, Tx } from '../db';
import { burnVerifyTime, hashPassword, verifyPassword } from './password';
import type { LoginInput, RegisterInput } from './schemas';
import { hashToken, newSessionToken, SESSION_ABSOLUTE_DAYS, SESSION_IDLE_DAYS } from './session';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export interface PublicUser {
  id: string;
  email: string;
  display_name: string;
}

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

// Satu pesan untuk semua kegagalan login (salah sandi, email tak dikenal, akun terkunci):
// tidak membocorkan keberadaan akun.
const invalidCredentials = () =>
  new AppError(
    401,
    'INVALID_CREDENTIALS',
    'Email atau kata sandi salah, atau akun terkunci sementara',
    'Periksa kembali, atau coba lagi beberapa menit lagi.',
  );

async function audit(c: Tx, action: string, actor: string | null, info: ClientInfo): Promise<void> {
  // Peristiwa auth tidak punya workspace → workspace_id NULL (diizinkan policy audit_no_tenant_insert).
  await c.query(
    `INSERT INTO audit_logs (workspace_id, actor_user_id, action, ip, user_agent)
     VALUES (NULL, $1, $2, $3, $4)`,
    [actor, action, info.ip, info.userAgent],
  );
}

export async function registerUser(
  db: Db,
  input: RegisterInput,
  info: ClientInfo,
): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  return db.withTransaction(async (c) => {
    const r = await c.query<PublicUser>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email::text AS email, display_name`,
      [input.email, input.display_name, passwordHash],
    );
    const user = r.rows[0];
    if (!user) throw new AppError(409, 'EMAIL_TAKEN', 'Email sudah terdaftar');
    await audit(c, 'auth.register', user.id, info);
    return user;
  });
}

type LoginOutcome =
  { ok: true; token: string; user: PublicUser; maxAgeSec: number } | { ok: false };

export async function loginUser(
  db: Db,
  input: LoginInput,
  info: ClientInfo,
): Promise<{ token: string; user: PublicUser; maxAgeSec: number }> {
  // Hasil dihitung di dalam transaksi lalu dilempar SETELAH commit, supaya penghitung gagal-login
  // tidak ikut di-rollback.
  const outcome = await db.withTransaction<LoginOutcome>(async (c) => {
    const r = await c.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string | null;
      status: string;
      failed_logins: number;
      locked_until: Date | null;
      is_locked: boolean;
    }>(
      `SELECT id, email::text AS email, display_name, password_hash, status, failed_logins, locked_until,
              (locked_until IS NOT NULL AND locked_until > now()) AS is_locked
         FROM users WHERE email = $1 FOR UPDATE`,
      [input.email],
    );
    const u = r.rows[0];

    if (!u || !u.password_hash) {
      await burnVerifyTime(input.password);
      await audit(c, 'auth.login_failed', null, info);
      return { ok: false };
    }
    if (u.is_locked || u.status !== 'active') {
      await burnVerifyTime(input.password);
      await audit(c, 'auth.login_blocked', u.id, info);
      return { ok: false };
    }

    const valid = await verifyPassword(u.password_hash, input.password);
    if (!valid) {
      // Kunci yang sudah kedaluwarsa memulai hitungan dari awal.
      const base = u.locked_until ? 0 : u.failed_logins;
      const next = base + 1;
      await c.query(
        `UPDATE users SET failed_logins = $2,
                locked_until = CASE WHEN $3::boolean THEN now() + make_interval(mins => $4) ELSE NULL END
          WHERE id = $1`,
        [u.id, next, next >= MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
      await audit(
        c,
        next >= MAX_FAILED_LOGINS ? 'auth.account_locked' : 'auth.login_failed',
        u.id,
        info,
      );
      return { ok: false };
    }

    const token = newSessionToken();
    const maxAgeSec = SESSION_ABSOLUTE_DAYS * 86400;
    await c.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
    await c.query(
      `INSERT INTO sessions (user_id, token_hash, ip, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
      [u.id, hashToken(token), info.ip, info.userAgent, SESSION_ABSOLUTE_DAYS],
    );
    await audit(c, 'auth.login', u.id, info);
    return {
      ok: true,
      token,
      maxAgeSec,
      user: { id: u.id, email: u.email, display_name: u.display_name },
    };
  });

  if (!outcome.ok) throw invalidCredentials();
  return { token: outcome.token, user: outcome.user, maxAgeSec: outcome.maxAgeSec };
}

export async function resolveSession(db: Db, token: string): Promise<PublicUser | null> {
  return db.withTransaction(async (c) => {
    const r = await c.query<PublicUser & { sid: string; stale: boolean }>(
      `SELECT u.id, u.email::text AS email, u.display_name, s.id AS sid,
              (s.last_seen_at < now() - interval '5 minutes') AS stale
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
          AND s.last_seen_at > now() - make_interval(days => $2) AND u.status = 'active'`,
      [hashToken(token), SESSION_IDLE_DAYS],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.stale)
      await c.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.sid]);
    return { id: row.id, email: row.email, display_name: row.display_name };
  });
}

export async function revokeSession(db: Db, token: string, info: ClientInfo): Promise<void> {
  await db.withTransaction(async (c) => {
    const r = await c.query<{ user_id: string }>(
      `UPDATE sessions SET revoked_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL RETURNING user_id`,
      [hashToken(token)],
    );
    const row = r.rows[0];
    if (row) await audit(c, 'auth.logout', row.user_id, info);
  });
}
