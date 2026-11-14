# ADR-0001 — Stack: TypeScript monorepo, profil A (serverless)

Status: **Diusulkan** · Tanggal: 2026-11-14

## Konteks

Pengguna bekerja dari HP Android tanpa komputer/server sendiri, sehingga profil deploy yang dipilih adalah
**A: Vercel + Supabase (PostgreSQL 16) + R2**. Prompt F0 versi profil A menggantikan Fastify + worker terpisah
dengan route handler Next.js dan endpoint cron.

## Opsi

| Opsi                                                                      | Kelebihan                                                       | Kekurangan                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A. Next.js route handler + PostgreSQL terkelola + cron endpoint (dipilih) | Tanpa server untuk dikelola; satu deploy; bisa dikelola dari HP | Batas durasi fungsi serverless; tanpa antrean persisten; pool koneksi harus ramah pooler |
| B. Fastify + worker BullMQ di VPS/Docker                                  | Kendali penuh, job panjang, push/antrean andal                  | Butuh VPS & perawatan; sulit dari HP                                                     |
| C. Hibrida (web di Vercel, worker kecil di VPS)                           | Seimbang                                                        | Dua tempat deploy                                                                        |

## Keputusan

- Monorepo pnpm + Turborepo, TypeScript strict. `apps/web` = UI **dan** API (route handler standar `Request`/`Response`,
  sehingga dapat diuji langsung tanpa server HTTP).
- Kode server di `apps/web/src/server`; modul tidak saling memanggil repo.
- Tenant: `workspace_id` + RLS FORCE; konteks via `set_config(..., true)` di dalam transaksi
  (setara `SET LOCAL`, dapat diparameterkan, aman untuk pooler mode transaksi).
- Job: antarmuka tunggal `JobScheduler` dengan implementasi "endpoint cron" (`/api/cron/[job]`, dilindungi `CRON_SECRET`,
  fail-closed, setiap job idempoten). Pindah ke BullMQ/pg-boss hanya mengganti implementasi.
- Auth sendiri: argon2id, sesi cookie httpOnly dengan token acak (hanya hash SHA-256 disimpan), lockout 5 gagal/15 menit.
- Penyimpanan file: adaptor S3-compatible dengan presigned URL (PUT ≤ 15 mnt, GET ≤ 5 mnt).

## Konsekuensi

- Pembatas laju di memori hanya lapis tambahan per instans; pertahanan utama brute force = lockout di database.
- Tidak ada antivirus ClamAV di profil A (F1d perlu keputusan: layanan eksternal atau tunda).
- Pindah ke profil B/C tidak mengubah skema atau domain, hanya lapisan job/hosting.
- Pengujian memakai PostgreSQL 16 nyata via `TEST_DATABASE_ADMIN_URL` (service container di CI), bukan mock.
