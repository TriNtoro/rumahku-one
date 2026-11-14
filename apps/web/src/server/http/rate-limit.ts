import { AppError } from '@rumahku/shared';

// Pembatas jendela tetap, di memori. Keterbatasan: per instans serverless, jadi hanya lapisan
// tambahan; pertahanan utama brute force adalah lockout akun di database. Ganti dengan store
// bersama sebelum dibuka untuk banyak pengguna (docs/BACKLOG.md).
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): void {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      const retry = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Terlalu banyak permintaan',
        'Coba lagi nanti.',
        undefined,
        {
          'retry-after': String(retry),
        },
      );
    }
  }
}

export const authLimiter = new RateLimiter(20, 60_000);
