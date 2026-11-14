import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPermissionsSeed } from '@rumahku/shared';
import { createDatabase, ensureRoles, withDatabase } from './admin';
import { applySeed, migrateDown, migrateUp } from './migrator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dirs = {
  migrationsDir: path.join(root, 'supabase/migrations'),
  rollbacksDir: path.join(root, 'supabase/rollbacks'),
};
const seedFile = path.join(root, 'supabase/seed/permissions.sql');

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} wajib diisi`);
  return v;
}

const [cmd, arg] = process.argv.slice(2);

switch (cmd) {
  case 'setup': {
    // Lokal/CI: buat role + database. Di Supabase, buat role lewat SQL editor (lihat README).
    const admin = need('DATABASE_ADMIN_URL');
    await ensureRoles(admin, { owner: need('OWNER_PASSWORD'), app: need('APP_PASSWORD') });
    const db = process.env.DB_NAME;
    if (db) await createDatabase(withDatabase(admin, 'postgres'), db);
    console.log('setup selesai');
    break;
  }
  case 'up':
    console.log('diterapkan:', await migrateUp({ ownerUrl: need('DATABASE_OWNER_URL'), ...dirs }));
    break;
  case 'down':
    console.log(
      'dibatalkan:',
      await migrateDown({ ownerUrl: need('DATABASE_OWNER_URL'), ...dirs }, Number(arg ?? 1)),
    );
    break;
  case 'seed':
    await applySeed(need('DATABASE_OWNER_URL'), seedFile);
    console.log('seed izin diterapkan');
    break;
  case 'gen-seed':
    writeFileSync(seedFile, renderPermissionsSeed());
    console.log('ditulis', seedFile);
    break;
  default:
    console.log('Pemakaian: cli <setup|up|down [n]|seed|gen-seed>');
    process.exit(1);
}
