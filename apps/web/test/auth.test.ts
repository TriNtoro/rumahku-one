import { describe, expect, it } from 'vitest';
import { cookieFrom, freshIp, get, post, strongPassword, uniqueEmail } from './helpers/api';
import { query, url } from './helpers/db';

const loadRoutes = async () => ({
  register: (await import('@/app/api/v1/auth/register/route')).POST,
  login: (await import('@/app/api/v1/auth/login/route')).POST,
  logout: (await import('@/app/api/v1/auth/logout/route')).POST,
  me: (await import('@/app/api/v1/auth/me/route')).GET,
});

async function registered(email = uniqueEmail()) {
  const r = await loadRoutes();
  const res = await r.register(
    post('/api/v1/auth/register', { email, password: strongPassword, display_name: 'Illa' }),
  );
  expect(res.status).toBe(201);
  return { r, email };
}

describe('auth: register', () => {
  it('201, tanpa hash/sandi di respons, sandi disimpan sebagai argon2id', async () => {
    const email = uniqueEmail('reg');
    const r = await loadRoutes();
    const res = await r.register(
      post('/api/v1/auth/register', { email, password: strongPassword, display_name: 'Illa' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['display_name', 'email', 'id']);
    expect(JSON.stringify(body)).not.toMatch(/argon|password/i);
    const row = await query<{ password_hash: string }>(
      url.admin(),
      'SELECT password_hash FROM users WHERE email = $1',
      [email],
    );
    expect(row.rows[0]!.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(row.rows[0]!.password_hash).not.toContain(strongPassword);
  });

  it('email ganda → 409 problem+json', async () => {
    const { r, email } = await registered();
    const res = await r.register(
      post('/api/v1/auth/register', {
        email: email.toUpperCase(),
        password: strongPassword,
        display_name: 'X',
      }),
    );
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect((await res.json()).code).toBe('EMAIL_TAKEN');
  });

  it('validasi: sandi pendek / email rusak → 422 dengan rincian per-field', async () => {
    const r = await loadRoutes();
    const res = await r.register(
      post('/api/v1/auth/register', { email: 'bukan-email', password: 'pendek', display_name: '' }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors.map((e: { path: string }) => e.path).sort()).toEqual([
      'display_name',
      'email',
      'password',
    ]);
  });

  it('body bukan JSON → 422; asal lintas-situs → 403', async () => {
    const r = await loadRoutes();
    const bad = new Request('http://localhost:3000/api/v1/auth/register', {
      method: 'POST',
      body: '{rusak',
      headers: { 'x-forwarded-for': freshIp() },
    });
    expect((await r.register(bad)).status).toBe(422);
    const cross = post(
      '/api/v1/auth/register',
      { email: uniqueEmail(), password: strongPassword, display_name: 'a' },
      { origin: 'https://jahat.example' },
    );
    expect((await r.register(cross)).status).toBe(403);
  });
});

describe('auth: login, sesi, logout', () => {
  it('login mengatur cookie httpOnly+SameSite; token mentah tidak disimpan; /me berfungsi; logout mencabut', async () => {
    const { r, email } = await registered();
    const res = await r.login(post('/api/v1/auth/login', { email, password: strongPassword }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = cookieFrom(res);
    const token = cookie.split('=')[1]!;
    expect(token.length).toBeGreaterThanOrEqual(40);

    const stored = await query<{ token_hash: Buffer }>(
      url.admin(),
      `SELECT token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
      [email],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.token_hash.toString('utf8')).not.toContain(token);
    expect(stored.rows[0]!.token_hash.length).toBe(32);

    const me = await r.me(get('/api/v1/auth/me', { cookie }));
    expect(me.status).toBe(200);
    expect((await me.json()).email).toBe(email);

    const out = await r.logout(post('/api/v1/auth/logout', {}, { cookie }));
    expect(out.status).toBe(204);
    expect((await r.me(get('/api/v1/auth/me', { cookie }))).status).toBe(401);
  });

  it('/me tanpa cookie atau dengan token acak → 401', async () => {
    const r = await loadRoutes();
    expect((await r.me(get('/api/v1/auth/me'))).status).toBe(401);
    expect((await r.me(get('/api/v1/auth/me', { cookie: 'rk_session=tokenasal' }))).status).toBe(
      401,
    );
  });

  it('sesi kedaluwarsa ditolak', async () => {
    const { r, email } = await registered();
    const cookie = cookieFrom(
      await r.login(post('/api/v1/auth/login', { email, password: strongPassword })),
    );
    await query(
      url.admin(),
      `UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    expect((await r.me(get('/api/v1/auth/me', { cookie }))).status).toBe(401);
  });

  it('respons gagal-login identik untuk email tak dikenal dan sandi salah (anti enumerasi)', async () => {
    const { r, email } = await registered();
    const wrong = await r.login(
      post('/api/v1/auth/login', { email, password: 'salah-salah-salah' }),
    );
    const unknown = await r.login(
      post('/api/v1/auth/login', { email: uniqueEmail('hantu'), password: 'salah-salah-salah' }),
    );
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(wrong.headers.get('set-cookie')).toBeNull();
  });

  it('lockout setelah 5 gagal: login dengan sandi BENAR pun ditolak; terbuka lagi setelah masa kunci', async () => {
    const { r, email } = await registered();
    for (let i = 0; i < 5; i++) {
      expect(
        (await r.login(post('/api/v1/auth/login', { email, password: 'salah-salah-salah' })))
          .status,
      ).toBe(401);
    }
    const blocked = await r.login(post('/api/v1/auth/login', { email, password: strongPassword }));
    expect(blocked.status).toBe(401);
    expect(blocked.headers.get('set-cookie')).toBeNull();

    const audit = await query(
      url.admin(),
      `SELECT 1 FROM audit_logs WHERE action = 'auth.account_locked' AND actor_user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    expect(audit.rowCount).toBe(1);

    await query(
      url.admin(),
      `UPDATE users SET locked_until = now() - interval '1 second' WHERE email = $1`,
      [email],
    );
    expect(
      (await r.login(post('/api/v1/auth/login', { email, password: strongPassword }))).status,
    ).toBe(200);
  });

  it('login berhasil mereset penghitung gagal', async () => {
    const { r, email } = await registered();
    for (let i = 0; i < 3; i++)
      await r.login(post('/api/v1/auth/login', { email, password: 'salah-salah-salah' }));
    expect(
      (await r.login(post('/api/v1/auth/login', { email, password: strongPassword }))).status,
    ).toBe(200);
    const u = await query<{ failed_logins: number }>(
      url.admin(),
      'SELECT failed_logins FROM users WHERE email = $1',
      [email],
    );
    expect(u.rows[0]!.failed_logins).toBe(0);
  });

  it('pembatas laju: IP yang sama dibatasi 429 dengan Retry-After', async () => {
    const r = await loadRoutes();
    const ip = freshIp();
    let last: Response | undefined;
    for (let i = 0; i < 25; i++) {
      last = await r.login(
        post(
          '/api/v1/auth/login',
          { email: uniqueEmail(), password: 'x' },
          { 'x-forwarded-for': ip },
        ),
      );
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('peristiwa auth tercatat di audit_logs tanpa menyimpan sandi', async () => {
    const { r, email } = await registered();
    await r.login(post('/api/v1/auth/login', { email, password: strongPassword }));
    const a = await query<{ action: string; metadata: unknown }>(
      url.admin(),
      `SELECT action, to_jsonb(a) AS metadata FROM audit_logs a WHERE actor_user_id = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    expect(a.rows.map((x) => x.action).sort()).toEqual(['auth.login', 'auth.register']);
    expect(JSON.stringify(a.rows)).not.toContain(strongPassword);
  });
});
