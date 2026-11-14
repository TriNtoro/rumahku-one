import './helpers/api';
import { describe, expect, it } from 'vitest';
import { get } from './helpers/api';
import { assertCronAuthorized } from '@/server/http/cron-auth';

const secret = process.env.CRON_SECRET!;
const call = async (job: string, headers: Record<string, string> = {}, method = 'GET') => {
  const { GET, POST } = await import('@/app/api/cron/[job]/route');
  const req = new Request(`http://localhost:3000/api/cron/${job}`, { method, headers });
  return (method === 'GET' ? GET : POST)(req, { params: Promise.resolve({ job }) });
};

describe('endpoint cron', () => {
  it('menolak tanpa kredensial, dengan secret salah, dan dengan skema selain Bearer', async () => {
    expect((await call('heartbeat')).status).toBe(401);
    expect((await call('heartbeat', { authorization: 'Bearer salah' })).status).toBe(401);
    expect((await call('heartbeat', { authorization: secret })).status).toBe(401);
  });
  it('tanpa CRON_SECRET terkonfigurasi → selalu ditolak (fail closed)', () => {
    expect(() =>
      assertCronAuthorized(get('/x', { authorization: 'Bearer apa-saja' }), undefined),
    ).toThrow();
    expect(() => assertCronAuthorized(get('/x', { authorization: 'Bearer ' }), '')).toThrow();
  });
  it('dengan secret benar menjalankan job dan idempoten (dua kali berturut-turut)', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await call('heartbeat', { authorization: `Bearer ${secret}` });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ job: 'heartbeat', result: { db: true } });
    }
    expect((await call('heartbeat', { authorization: `Bearer ${secret}` }, 'POST')).status).toBe(
      200,
    );
  });
  it('job tidak dikenal → 404', async () => {
    expect((await call('tidak-ada', { authorization: `Bearer ${secret}` })).status).toBe(404);
  });
});
