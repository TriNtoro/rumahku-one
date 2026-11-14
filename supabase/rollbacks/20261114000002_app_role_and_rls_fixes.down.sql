-- Rollback 0002. Role rumahku_app sengaja TIDAK dihapus (objek tingkat cluster, mungkin dipakai database lain).
DROP POLICY IF EXISTS audit_no_tenant_insert ON audit_logs;
DROP POLICY IF EXISTS own_memberships ON workspace_members;
DROP POLICY IF EXISTS workspace_update ON workspaces;
DROP POLICY IF EXISTS workspace_insert ON workspaces;
DROP POLICY IF EXISTS workspace_select ON workspaces;
ALTER TABLE workspaces NO FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM rumahku_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM rumahku_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM rumahku_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM rumahku_app;
REVOKE USAGE ON SCHEMA public, app FROM rumahku_app;
