import { createHash, randomBytes } from 'node:crypto';

export const SESSION_ABSOLUTE_DAYS = 90;
export const SESSION_IDLE_DAYS = 30;

export const newSessionToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

export function sessionCookieName(appUrl: string): string {
  return new URL(appUrl).protocol === 'https:' ? '__Host-rk_session' : 'rk_session';
}

export function serializeSessionCookie(appUrl: string, token: string, maxAgeSec: number): string {
  const secure = new URL(appUrl).protocol === 'https:';
  return [
    `${sessionCookieName(appUrl)}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export const clearSessionCookie = (appUrl: string): string => serializeSessionCookie(appUrl, '', 0);

export function readSessionToken(req: Request, appUrl: string): string | null {
  const name = sessionCookieName(appUrl);
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      const v = part.slice(idx + 1).trim();
      return v.length > 0 && v.length <= 200 ? v : null;
    }
  }
  return null;
}
