import { AppError } from '@rumahku/shared';
import type { Db } from '../db';
import { getEnv } from '../env';
import { resolveSession, type PublicUser } from './service';
import { readSessionToken } from './session';

export async function requireSession(
  db: Db,
  req: Request,
): Promise<{ user: PublicUser; token: string }> {
  const token = readSessionToken(req, getEnv().APP_URL);
  const user = token ? await resolveSession(db, token) : null;
  if (!token || !user) throw new AppError(401, 'UNAUTHENTICATED', 'Belum masuk');
  return { user, token };
}
