import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '@rumahku/shared';
import { getEnv } from '../env';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Vercel Cron mengirim `Authorization: Bearer $CRON_SECRET`. Tanpa secret terkonfigurasi → selalu ditolak. */
export function assertCronAuthorized(req: Request, secret = getEnv().CRON_SECRET): void {
  const header = req.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Tidak diizinkan');
  }
}
