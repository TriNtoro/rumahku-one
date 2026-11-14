import './helpers/api';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@/server/logger';
import { buildOpenApi } from '@/server/openapi';
import { get } from './helpers/api';

describe('log: redaksi rahasia', () => {
  it('password, token, cookie, authorization tidak pernah tertulis', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _e, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = createLogger(sink, 'info');
    log.info(
      {
        password: 'RAHASIA1',
        user: { password: 'RAHASIA2', token: 'RAHASIA3' },
        req: { headers: { authorization: 'Bearer RAHASIA4', cookie: 'rk=RAHASIA5' } },
      },
      'uji',
    );
    const out = lines.join('');
    expect(out).not.toMatch(/RAHASIA/);
    expect(out).toContain('[REDACTED]');
  });
});

describe('OpenAPI 3.1', () => {
  const doc = buildOpenApi();
  it('versi dan jalur inti ada', () => {
    expect(doc.openapi).toBe('3.1.0');
    for (const p of [
      '/healthz',
      '/readyz',
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/me',
    ]) {
      expect(Object.keys(doc.paths)).toContain(p);
    }
  });
  it('skema register diturunkan dari Zod (email & password wajib)', () => {
    const schema = (
      doc.paths['/api/v1/auth/register'].post.requestBody.content['application/json'] as {
        schema: { required: string[] };
      }
    ).schema;
    expect(schema.required).toEqual(expect.arrayContaining(['email', 'password', 'display_name']));
  });
  it('endpoint /api/v1/openapi.json melayani dokumen yang sama', async () => {
    const { GET } = await import('@/app/api/v1/openapi.json/route');
    expect((await GET().json()).openapi).toBe('3.1.0');
  });
});

describe('kesehatan', () => {
  it('/healthz 200 tanpa menyentuh database; /readyz 200 dengan database nyata', async () => {
    const h = await import('@/app/healthz/route');
    expect(h.GET().status).toBe(200);
    const r = await import('@/app/readyz/route');
    const res = await r.GET();
    expect(res.status).toBe(200);
    expect(get('/x').method).toBe('GET');
  });
});
