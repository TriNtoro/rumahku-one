import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, roleHas } from '@rumahku/shared';
import { query, url } from './helpers/db';

describe('matriks izin (SPEC §4)', () => {
  it('semua izin berformat modul.entitas.aksi', () => {
    for (const key of Object.keys(PERMISSIONS)) expect(key).toMatch(/^[a-z]+\.[a-z_]+\.[a-z_]+$/);
  });
  it('owner memegang semua izin; admin semua kecuali hapus workspace', () => {
    const all = Object.keys(PERMISSIONS);
    expect(all.every((p) => roleHas('owner', p))).toBe(true);
    expect(roleHas('admin', 'workspace.workspace.delete')).toBe(false);
    expect(
      all.filter((p) => p !== 'workspace.workspace.delete').every((p) => roleHas('admin', p)),
    ).toBe(true);
  });
  it('deny-by-default: guest tidak punya izin tulis keuangan', () => {
    const writes = Object.keys(PERMISSIONS).filter(
      (p) => p.startsWith('finance.') && /create|update|delete|void/.test(p),
    );
    expect(writes.length).toBeGreaterThan(0);
    for (const p of writes) expect(roleHas('guest', p)).toBe(false);
  });
  it('seed di database identik dengan sumber TypeScript', async () => {
    const r = await query<{ role_key: string; permission_key: string }>(
      url.admin(),
      'SELECT role_key, permission_key FROM role_permissions',
    );
    const db = new Set(r.rows.map((x) => `${x.role_key}:${x.permission_key}`));
    const src = new Set<string>();
    for (const role of ROLES) for (const p of ROLE_PERMISSIONS[role] ?? []) src.add(`${role}:${p}`);
    expect(db).toEqual(src);
  });
});
