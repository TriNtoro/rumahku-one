import { randomUUID } from 'node:crypto';
import { AppError, problemResponse } from '@rumahku/shared';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { getEnv } from '../env';
import { getLogger } from '../logger';

export interface RouteContext {
  req: Request;
  log: Logger;
  requestId: string;
  params: Record<string, string>;
}

type NextCtx = { params?: Promise<Record<string, string>> };

/**
 * Pembungkus route: problem+json seragam, ZodError → 422, kesalahan tak terduga → 500 generik
 * (pesan asli hanya di log, tidak pernah ke klien).
 */
export function apiRoute(handler: (ctx: RouteContext) => Promise<Response>) {
  return async (req: Request, nextCtx?: NextCtx): Promise<Response> => {
    const requestId = randomUUID();
    const started = Date.now();
    const log = getLogger().child({
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
    });
    let res: Response;
    try {
      const params = (await nextCtx?.params) ?? {};
      res = await handler({ req, log, requestId, params });
    } catch (e) {
      if (e instanceof AppError) {
        res = problemResponse(e);
      } else if (e instanceof ZodError) {
        res = problemResponse(
          new AppError(
            422,
            'VALIDATION_FAILED',
            'Data tidak valid',
            undefined,
            e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
      } else {
        log.error(
          { err: e instanceof Error ? { name: e.name, message: e.message } : 'unknown' },
          'unhandled',
        );
        res = problemResponse(new AppError(500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server'));
      }
    }
    res.headers.set('x-request-id', requestId);
    res.headers.set('cache-control', 'no-store');
    log.info({ status: res.status, ms: Date.now() - started }, 'request');
    return res;
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(422, 'VALIDATION_FAILED', 'Body harus JSON yang valid');
  }
}

/** Perlindungan CSRF dasar untuk metode non-GET (SameSite=Lax + pemeriksaan Origin). */
export function assertSameOrigin(req: Request, appUrl = getEnv().APP_URL): void {
  const origin = req.headers.get('origin');
  const expected = new URL(appUrl).origin;
  if (origin && origin !== expected) {
    throw new AppError(403, 'FORBIDDEN', 'Asal permintaan tidak diizinkan');
  }
  if (!origin && req.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError(403, 'FORBIDDEN', 'Asal permintaan tidak diizinkan');
  }
}
