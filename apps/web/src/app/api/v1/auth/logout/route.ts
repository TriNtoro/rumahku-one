import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { revokeSession } from '@/server/auth/service';
import { clearSessionCookie, readSessionToken } from '@/server/auth/session';
import { apiRoute, assertSameOrigin } from '@/server/http/handler';
import { clientIp, userAgent } from '@/server/http/client-info';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async ({ req }) => {
  assertSameOrigin(req);
  const env = getEnv();
  const token = readSessionToken(req, env.APP_URL);
  if (token) await revokeSession(getDb(), token, { ip: clientIp(req), userAgent: userAgent(req) });
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearSessionCookie(env.APP_URL) },
  });
});
