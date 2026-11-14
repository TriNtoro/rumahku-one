import { describe, expect, it } from 'vitest';
import { AppError, notFound, problemResponse, toProblemBody } from '../src/index';

describe('problem+json (RFC 9457)', () => {
  it('menghasilkan type urn, status, code, dan content-type yang benar', async () => {
    const res = problemResponse(new AppError(409, 'EMAIL_TAKEN', 'Email sudah terdaftar'));
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toMatchObject({
      type: 'urn:rumahku:problem:email-taken',
      status: 409,
      code: 'EMAIL_TAKEN',
    });
  });
  it('notFound() = 404 generik, tidak membedakan "tidak ada" vs "bukan milikmu"', () => {
    const e = notFound();
    expect(e.status).toBe(404);
    expect(toProblemBody(e).detail).toBeUndefined();
  });
  it('meneruskan header tambahan (mis. Retry-After)', () => {
    const res = problemResponse(
      new AppError(429, 'RATE_LIMITED', 'x', undefined, undefined, { 'retry-after': '30' }),
    );
    expect(res.headers.get('retry-after')).toBe('30');
  });
});
