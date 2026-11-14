// Impor modul ini PERTAMA di berkas tes API: mengisi env sebelum modul server membacanya (lazy).
process.env.DATABASE_URL = process.env.TEST_APP_URL!;
process.env.APP_URL = 'http://localhost:3000';
process.env.CRON_SECRET = 'cron-secret-for-tests-0123456789abcdef';
process.env.LOG_LEVEL = 'silent';
process.env.DB_POOL_MAX = '3';

let ipCounter = 10;
/** IP unik per panggilan agar pembatas laju tidak mengganggu tes lain. */
export const freshIp = (): string =>
  `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp(), ...headers },
    body: JSON.stringify(body),
  });
}

export function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, { headers });
}

export function cookieFrom(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0] ?? '';
}

export const strongPassword = 'kata-sandi-aman-123';
export const uniqueEmail = (p = 'u') => `${p}-${Math.random().toString(36).slice(2)}@example.test`;
