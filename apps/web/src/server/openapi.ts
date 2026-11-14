import { z } from 'zod';
import { loginSchema, registerSchema, userSchema } from './auth/schemas';

const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: 'draft-2020-12', io: 'input' });

const problem = {
  description: 'Kesalahan (RFC 9457)',
  content: {
    'application/problem+json': {
      schema: {
        type: 'object',
        required: ['type', 'title', 'status', 'code'],
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer' },
          code: { type: 'string' },
          detail: { type: 'string' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

const json = (s: z.ZodType) => ({ content: { 'application/json': { schema: schema(s) } } });

export function buildOpenApi() {
  return {
    openapi: '3.1.0',
    info: { title: 'RUMAHKU-ONE API', version: '0.0.1' },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'rk_session' } },
    },
    paths: {
      '/healthz': { get: { summary: 'Liveness', responses: { '200': { description: 'OK' } } } },
      '/readyz': {
        get: {
          summary: 'Readiness (database)',
          responses: { '200': { description: 'Siap' }, '503': problem },
        },
      },
      '/api/v1/auth/register': {
        post: {
          summary: 'Daftar',
          requestBody: { required: true, ...json(registerSchema) },
          responses: {
            '201': { description: 'Dibuat', ...json(userSchema) },
            '409': problem,
            '422': problem,
            '429': problem,
          },
        },
      },
      '/api/v1/auth/login': {
        post: {
          summary: 'Masuk (mengatur cookie sesi httpOnly)',
          requestBody: { required: true, ...json(loginSchema) },
          responses: {
            '200': { description: 'Berhasil', ...json(z.object({ user: userSchema })) },
            '401': problem,
            '422': problem,
            '429': problem,
          },
        },
      },
      '/api/v1/auth/logout': {
        post: {
          summary: 'Keluar',
          security: [{ session: [] }],
          responses: { '204': { description: 'Keluar' } },
        },
      },
      '/api/v1/auth/me': {
        get: {
          summary: 'Pengguna saat ini',
          security: [{ session: [] }],
          responses: { '200': { description: 'OK', ...json(userSchema) }, '401': problem },
        },
      },
    },
  };
}
