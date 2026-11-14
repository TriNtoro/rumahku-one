-- 0002: role aplikasi non-owner, grant minimum, dan perbaikan RLS yang tidak ada di 0001.
-- Tujuan: role aplikasi TIDAK superuser, TIDAK pemilik tabel, TIDAK BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rumahku_app') THEN
    -- NOLOGIN: kata sandi + LOGIN diatur di luar migrasi (tidak ada rahasia di repo).
    CREATE ROLE rumahku_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rumahku_app' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'rumahku_app must not be superuser or BYPASSRLS';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, app TO rumahku_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rumahku_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rumahku_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rumahku_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rumahku_app;

-- Aturan 4: transaksi tidak pernah di-DELETE (void / transaksi pembalik).
REVOKE DELETE ON transactions FROM rumahku_app;
-- Audit log append-only.
REVOKE UPDATE, DELETE ON audit_logs FROM rumahku_app;
-- Katalog peran/izin hanya diubah lewat seed oleh owner.
REVOKE INSERT, UPDATE, DELETE ON roles, permissions, role_permissions FROM rumahku_app;

-- ---------- RLS: workspaces (0001 melewatkannya, sehingga semua workspace terbaca) ----------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_select ON workspaces FOR SELECT USING (
  id = app.current_workspace_id()
  OR created_by = app.current_user_id()
  OR EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspaces.id AND m.user_id = app.current_user_id() AND m.removed_at IS NULL
  )
);
CREATE POLICY workspace_insert ON workspaces FOR INSERT WITH CHECK (created_by = app.current_user_id());
CREATE POLICY workspace_update ON workspaces FOR UPDATE
  USING (id = app.current_workspace_id()) WITH CHECK (id = app.current_workspace_id());
-- Tanpa policy DELETE: workspace dihapus lewat deleted_at (soft delete).

-- ---------- RLS: keanggotaan sendiri terbaca tanpa konteks workspace (untuk login & daftar workspace) ----------
CREATE POLICY own_memberships ON workspace_members FOR SELECT USING (user_id = app.current_user_id());

-- ---------- RLS: audit_logs.workspace_id boleh NULL (peristiwa auth sebelum ada workspace) ----------
CREATE POLICY audit_no_tenant_insert ON audit_logs FOR INSERT WITH CHECK (workspace_id IS NULL);
