import net from 'node:net';

export function clientIp(req: Request): string | null {
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  return raw && net.isIP(raw) ? raw : null;
}

export function userAgent(req: Request): string | null {
  return req.headers.get('user-agent')?.slice(0, 300) ?? null;
}
