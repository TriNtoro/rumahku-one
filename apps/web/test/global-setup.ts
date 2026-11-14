import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  dropDatabase,
  ensureRoles,
  migrateUp,
  applySeed,
  withCredentials,
  withDatabase,
} from '@rumahku/db-tools';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Database sekali pakai per eksekusi tes (PostgreSQL 16 nyata, bukan mock).
// Admin URL dari TEST_DATABASE_ADMIN_URL; di CI diisi service container postgres:16.
export default async function setup() {
  const admin = process.env.TEST_DATABASE_ADMIN_URL;
  if (!admin) throw new Error('TEST_DATABASE_ADMIN_URL wajib diisi untuk tes integrasi');

  const dbName = `rumahku_test_${randomBytes(4).toString('hex')}`;
  const ownerPw = randomBytes(12).toString('hex');
  const appPw = randomBytes(12).toString('hex');

  await ensureRoles(admin, { owner: ownerPw, app: appPw });
  await createDatabase(withDatabase(admin, 'postgres'), dbName);

  const ownerUrl = withCredentials(withDatabase(admin, dbName), 'rumahku_owner', ownerPw);
  await migrateUp({
    ownerUrl,
    migrationsDir: path.join(root, 'supabase/migrations'),
    rollbacksDir: path.join(root, 'supabase/rollbacks'),
  });
  await applySeed(ownerUrl, path.join(root, 'supabase/seed/permissions.sql'));

  process.env.TEST_DB_NAME = dbName;
  process.env.TEST_ADMIN_URL = withDatabase(admin, dbName);
  process.env.TEST_OWNER_URL = ownerUrl;
  process.env.TEST_APP_URL = withCredentials(withDatabase(admin, dbName), 'rumahku_app', appPw);
  process.env.TEST_MIGRATIONS_DIR = path.join(root, 'supabase/migrations');
  process.env.TEST_ROLLBACKS_DIR = path.join(root, 'supabase/rollbacks');

  return async () => {
    await dropDatabase(withDatabase(admin, 'postgres'), dbName);
  };
}
