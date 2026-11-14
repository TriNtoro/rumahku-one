import { apiRoute, json } from '@/server/http/handler';
import { assertCronAuthorized } from '@/server/http/cron-auth';
import { scheduler } from '@/server/jobs/registry';

export const dynamic = 'force-dynamic';

const handle = apiRoute(async ({ req, log, params }) => {
  assertCronAuthorized(req);
  const result = await scheduler.run(params.job ?? '', { now: new Date(), log });
  return json({ job: params.job, result });
});

export { handle as GET, handle as POST };
