import { problemResponse, AppError } from '@rumahku/shared';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    await getDb().withTransaction((c) => c.query('SELECT 1'));
    return Response.json({ status: 'ready' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return problemResponse(new AppError(503, 'INTERNAL_ERROR', 'Database belum siap'));
  }
}
