# RUMAHKU-ONE

PWA mobile-first untuk rumah, keuangan, task/kalender keluarga. **Status: F0 (fondasi) — belum ada fitur bisnis.**
Profil deploy: **A — Vercel + Supabase + R2** (lihat `docs/adr/0001` dan `0007`). Aturan kerja: `AGENTS.md`.

## Isi F0

- Skema 69 tabel dengan RLS `FORCE` per `workspace_id`, role aplikasi tanpa hak owner/superuser, migrasi **maju & mundur**.
- Matriks izin 8 peran (sumber tunggal: `packages/shared/src/permissions.ts`, seed SQL dihasilkan darinya).
- Auth: daftar/masuk/keluar, argon2id, sesi cookie httpOnly (hanya hash token disimpan), lockout 5 gagal/15 menit, audit.
- Infrastruktur: error problem+json (RFC 9457), pino dengan redaksi, `/healthz`, `/readyz`, OpenAPI 3.1 di `/api/v1/openapi.json`,
  adaptor S3/R2 (presigned URL), `JobScheduler` lewat `/api/cron/[job]` (dilindungi `CRON_SECRET`).

## Menjalankan lokal (butuh PostgreSQL 16 dan Node 22)

```bash
pnpm install
cp .env.example .env.local            # isi nilai; jangan commit
export DATABASE_ADMIN_URL=postgres://postgres:<pw>@localhost:5432/postgres
export OWNER_PASSWORD=<acak> APP_PASSWORD=<acak> DB_NAME=rumahku
pnpm db:setup                          # buat role + database
export DATABASE_OWNER_URL=postgres://rumahku_owner:<OWNER_PASSWORD>@localhost:5432/rumahku
pnpm db:migrate && pnpm db:seed        # skema + izin
pnpm --filter @rumahku/web dev
```

Mundur satu migrasi: `pnpm db:rollback 1`. Buat ulang seed izin: `pnpm seed:gen`.

## Tes

```bash
export TEST_DATABASE_ADMIN_URL=postgres://postgres:<pw>@localhost:5432/postgres   # superuser
pnpm lint && pnpm typecheck && pnpm test
```

Tes membuat database sekali pakai per eksekusi lalu menghapusnya. Tes inti: isolasi tenant generatif (semua tabel
ber-`workspace_id`), role aplikasi tidak bisa melemahkan RLS, migrasi maju-mundur-maju, `withTenant` pada pool 1 koneksi.

## Deploy dari HP (profil A) — langkah ringkas, **belum diuji di Supabase**

1. Buat proyek Supabase; catat _direct connection_ (untuk migrasi) dan _pooler mode transaksi_ (untuk aplikasi).
2. Di SQL editor, buat dua role dengan kata sandi acak (lihat `packages/db-tools/src/admin.ts` untuk atributnya);
   baca peringatan ekstensi di `docs/adr/0007`.
3. Jalankan migrasi dari mesin mana pun yang punya Node (mis. Codespaces/Actions): `pnpm db:migrate && pnpm db:seed`.
4. Impor repo ke Vercel; isi env: `DATABASE_URL` (pooler, role `rumahku_app`), `APP_URL`, `CRON_SECRET` (≥ 32 karakter), `S3_*`.
5. Cek `/readyz` harus 200.

## Struktur

`apps/web` (UI + API + kode server) · `packages/shared` (money, problem+json, izin) · `packages/db-tools` (migrator, CLI) ·
`supabase/migrations|rollbacks|seed` · `docs/` (ADR, BACKLOG, THIRD_PARTY_NOTICES).
