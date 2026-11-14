import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(3),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CRON_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Dibaca malas agar `next build` tidak gagal tanpa env; kesalahan konfigurasi muncul saat dipakai.
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source !== process.env) return schema.parse(source);
  cached ??= schema.parse(source);
  return cached;
}
