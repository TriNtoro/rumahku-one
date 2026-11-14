-- Rollback 0001: hapus semua tabel aplikasi di schema public dan schema app.
-- Ekstensi (pgcrypto, citext) dibiarkan: bisa dipakai objek lain.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP;
END $$;
DROP SCHEMA IF EXISTS app CASCADE;
