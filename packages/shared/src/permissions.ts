// Sumber tunggal matriks izin (SPEC §4). seed/permissions.sql dihasilkan dari berkas ini
// (pnpm seed:gen); tes memastikan keduanya tidak menyimpang.
export const ROLES = [
  'owner',
  'admin',
  'adult',
  'teen',
  'child',
  'caretaker',
  'advisor',
  'guest',
] as const;
export type RoleKey = (typeof ROLES)[number];

export const PERMISSIONS: Record<string, string> = {
  'workspace.workspace.read': 'Melihat workspace',
  'workspace.workspace.delete': 'Hapus workspace / transfer kepemilikan',
  'workspace.members.manage': 'Kelola anggota & undangan',
  'workspace.modules.manage': 'Aktif/nonaktifkan modul',
  'workspace.data.export': 'Ekspor data workspace',
  'audit.log.read': 'Lihat audit log',
  'tasks.task.read': 'Baca task bersama',
  'tasks.task.write': 'Tulis task bersama',
  'tasks.task.complete': 'Selesaikan task',
  'tasks.task.read_own': 'Baca task milik sendiri',
  'tasks.task.write_own': 'Tulis task milik sendiri',
  'tasks.task.read_home': 'Baca task rumah',
  'tasks.task.complete_home': 'Selesaikan task rumah',
  'calendar.event.read': 'Baca kalender bersama',
  'calendar.event.write': 'Tulis kalender bersama',
  'calendar.event.read_own': 'Baca kalender milik sendiri',
  'calendar.event.write_own': 'Tulis kalender milik sendiri',
  'documents.document.read': 'Baca dokumen workspace',
  'documents.document.write': 'Tulis dokumen workspace',
  'documents.document.read_granted': 'Baca dokumen yang diberi akses (berkedaluwarsa)',
  'documents.document.read_link': 'Baca satu dokumen lewat tautan',
  'assets.asset.read': 'Baca aset & perawatan',
  'assets.asset.write': 'Tulis aset & perawatan',
  'assets.maintenance.complete': 'Selesaikan perawatan',
  'finance.account.read': 'Baca akun keuangan bersama',
  'finance.account.write': 'Tulis akun keuangan bersama',
  'finance.transaction.read': 'Baca transaksi bersama',
  'finance.transaction.read_limited': 'Baca transaksi (terbatas)',
  'finance.transaction.write': 'Tulis transaksi',
  'finance.transaction.void': 'Void transaksi mana pun',
  'finance.transaction.void_own': 'Void transaksi sendiri',
  'finance.report.read': 'Baca laporan keuangan',
  'finance.report.read_selected': 'Baca laporan terpilih',
  'home.shopping.read': 'Baca daftar belanja',
  'home.shopping.write': 'Tulis daftar belanja',
  'home.inventory.read': 'Baca stok',
  'home.inventory.write': 'Tulis stok',
};

const ALL = Object.keys(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== 'workspace.workspace.delete'),
  adult: [
    'workspace.workspace.read',
    'tasks.task.read',
    'tasks.task.write',
    'tasks.task.complete',
    'calendar.event.read',
    'calendar.event.write',
    'documents.document.read',
    'documents.document.write',
    'assets.asset.read',
    'assets.asset.write',
    'assets.maintenance.complete',
    'finance.account.read',
    'finance.account.write',
    'finance.transaction.read',
    'finance.transaction.write',
    'finance.transaction.void_own',
    'finance.report.read',
    'home.shopping.read',
    'home.shopping.write',
    'home.inventory.read',
    'home.inventory.write',
  ],
  teen: [
    'workspace.workspace.read',
    'tasks.task.read',
    'tasks.task.write',
    'tasks.task.complete',
    'calendar.event.read',
    'calendar.event.write',
    'assets.asset.read',
    'finance.transaction.read_limited',
    'home.shopping.read',
    'home.shopping.write',
    'home.inventory.read',
    'home.inventory.write',
  ],
  child: [
    'workspace.workspace.read',
    'tasks.task.read_own',
    'tasks.task.write_own',
    'tasks.task.complete',
    'calendar.event.read_own',
    'calendar.event.write_own',
    'home.shopping.read',
    'home.inventory.read',
  ],
  caretaker: [
    'workspace.workspace.read',
    'tasks.task.read_home',
    'tasks.task.complete_home',
    'assets.asset.read',
    'assets.maintenance.complete',
    'home.shopping.read',
    'home.shopping.write',
    'home.inventory.read',
    'home.inventory.write',
  ],
  advisor: ['documents.document.read_granted', 'finance.report.read_selected'],
  guest: ['documents.document.read_link'],
};

export function roleHas(role: RoleKey, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function renderPermissionsSeed(): string {
  const perms = Object.entries(PERMISSIONS)
    .map(([k, d]) => `  (${sqlStr(k)}, ${sqlStr(d)})`)
    .join(',\n');
  const rp = ROLES.flatMap((r) =>
    ROLE_PERMISSIONS[r].map((p) => `  (${sqlStr(r)}, ${sqlStr(p)})`),
  ).join(',\n');
  const keys = Object.keys(PERMISSIONS).map(sqlStr).join(', ');
  return `-- DIHASILKAN dari packages/shared/src/permissions.ts oleh \`pnpm seed:gen\`. Jangan edit manual.
BEGIN;
DELETE FROM role_permissions;
DELETE FROM permissions WHERE key NOT IN (${keys});
INSERT INTO permissions (key, description) VALUES
${perms}
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;
INSERT INTO role_permissions (role_key, permission_key) VALUES
${rp}
ON CONFLICT DO NOTHING;
COMMIT;
`;
}
