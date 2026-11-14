import { getDb } from '@/server/db';
import { registerSchema } from '@/server/auth/schemas';
import { registerUser } from '@/server/auth/service';
import { apiRoute, assertSameOrigin, json, readJson } from '@/server/http/handler';
import { clientIp, userAgent } from '@/server/http/client-info';
import { authLimiter } from '@/server/http/rate-limit';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async ({ req }) => {
  assertSameOrigin(req);
  authLimiter.check(`register:${clientIp(req) ?? 'unknown'}`);
  const input = registerSchema.parse(await readJson(req));
  const user = await registerUser(getDb(), input, { ip: clientIp(req), userAgent: userAgent(req) });
  return json(user, 201);
});
