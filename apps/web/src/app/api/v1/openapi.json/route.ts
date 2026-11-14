import { buildOpenApi } from '@/server/openapi';

export const dynamic = 'force-dynamic';
export const GET = (): Response => Response.json(buildOpenApi());
