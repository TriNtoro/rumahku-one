import { getDb } from '@/server/db';
import { requireSession } from '@/server/auth/require-session';
import { apiRoute, json } from '@/server/http/handler';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async ({ req }) => {
  const { user } = await requireSession(getDb(), req);
  return json(user);
});
