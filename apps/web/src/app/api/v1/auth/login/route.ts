import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { loginSchema } from '@/server/auth/schemas';
import { loginUser } from '@/server/auth/service';
import { serializeSessionCookie } from '@/server/auth/session';
import { apiRoute, assertSameOrigin, json, readJson } from '@/server/http/handler';
import { clientIp, userAgent } from '@/server/http/client-info';
import { authLimiter } from '@/server/http/rate-limit';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async ({ req }) => {
  assertSameOrigin(req);
  authLimiter.check(`login:${clientIp(req) ?? 'unknown'}`);
  const input = loginSchema.parse(await readJson(req));
  const r = await loginUser(getDb(), input, { ip: clientIp(req), userAgent: userAgent(req) });
  return json({ user: r.user }, 200, {
    'set-cookie': serializeSessionCookie(getEnv().APP_URL, r.token, r.maxAgeSec),
  });
});
