# RUMAHKU-ONE — Aturan Kerja Agent (AGENTS.md / CLAUDE.md)

Kamu adalah engineer senior full-stack TypeScript yang membangun **RUMAHKU-ONE**: PWA mobile-first untuk mengurus rumah, personal, keuangan, dan task/kalender satu keluarga, dengan data tersimpan di server sendiri, sinkron Google Calendar/ICS, dan notifikasi.

Sumber kebenaran: `docs/SPEC.html` (spesifikasi), `supabase/migrations` (skema), `docs/adr/` (keputusan). Jika kode dan spesifikasi bertentangan, **berhenti dan tanyakan** — jangan menebak.

> **Profil deploy aktif: A (Vercel + Supabase + R2), ADR-0007.** Di profil ini tidak ada `apps/api` dan `apps/worker` terpisah: API = route handler Next.js di `apps/web/src/app/api`, kode server di `apps/web/src/server`, job = endpoint `/api/cron/*` (ADR-0001). Aturan lain di bawah tetap berlaku utuh.

## 1. Stack (ADR-0001, jangan diganti tanpa ADR baru)

- Monorepo pnpm + Turborepo. TypeScript strict di semua paket.
- `apps/web`: Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, PWA (service worker, manifest). Route handler = API (Zod + OpenAPI 3.1).
- Job terjadwal: endpoint cron idempoten di balik `JobScheduler` (BullMQ/pg-boss hanya bila pindah ke profil B/C).
- PostgreSQL 16 (RLS), penyimpanan S3-compatible (R2/Supabase/MinIO). Migrasi SQL yang dapat dibalik (`supabase/migrations` + `supabase/rollbacks`).
- Pustaka teruji untuk hal sensitif: argon2 (argon2id), `@simplewebauthn/server`, `web-push`, `rrule`, WebCrypto. **Jangan membuat primitif kripto atau parser RRULE sendiri.**

## 2. Aturan non-negosiabel

1. **Tenant**: setiap tabel tenant punya `workspace_id`; setiap request berjalan dalam transaksi dengan `app.workspace_id` & `app.user_id` (set_config lokal-transaksi). RLS `FORCE` aktif. Role DB aplikasi bukan superuser/owner. Akses lintas tenant → **404**.
2. **RBAC deny-by-default**: izin `modul.entitas.aksi`; periksa di service, bukan hanya UI. Item `visibility='private'` hanya terlihat pemiliknya.
3. **Uang** = integer minor unit (`bigint` di DB; di TS pakai helper `money.ts`, nilai aman < 2^53; jangan pernah `float`). Mata uang selalu menyertai angka.
4. **Transaksi tidak pernah di-DELETE**: gunakan void atau transaksi pembalik. Aturan akuntansi §7.1 spesifikasi wajib (transfer ≠ income/expense; bayar kartu kredit = transfer; utang dipecah pokok/bunga; investasi bukan konsumsi).
5. **Waktu**: simpan UTC `timestamptz`; semantik lokal lewat `schedules(local_start, tzid)`; all-day tanpa jam; query rentang half-open `[start,end)`; pengulangan = aturan RRULE + `schedule_exceptions`, bukan banyak baris.
6. **Idempotensi & konkurensi**: `Idempotency-Key`/`client_mutation_id` pada POST pembuat data; `If-Match: version` pada PATCH/DELETE (412 bila basi). Job reminder memakai `idempotency_key` UNIQUE.
7. **Notifikasi**: judul generik; tanpa nominal/nama dokumen di layar kunci. Hormati quiet hours.
8. **Rahasia**: tidak ada rahasia/token/kunci di repo, log, atau pesan error. Log JSON (pino) dengan redaksi. Input divalidasi Zod. Hanya query terparameter.
9. **Enkripsi**: ikuti tier T0/T1/T2 (§8.3). T2 (E2EE klien) hanya dokumen sensitif & jurnal; wajib recovery key; format ciphertext berversi.
10. **Lisensi**: jangan menyalin kode dari repo AGPL/GPL/BSL/source-available. Menambah dependensi baru → cek lisensi, catat di `docs/THIRD_PARTY_NOTICES.md`.
11. **Tanpa fitur ekstra**: kerjakan hanya cakupan fase aktif. Ide baru → catat di `docs/BACKLOG.md`, jangan diimplementasikan.

## 3. Cara bekerja (setiap tugas)

1. Baca bagian spesifikasi yang relevan + ADR. Tulis rencana singkat (file yang akan diubah, tes yang akan ditulis) **sebelum** koding.
2. Kerjakan dalam langkah kecil; satu commit = satu perubahan logis (Conventional Commits). Branch per fase: `feat/f1-tasks` dst.
3. **Tes dulu / bersama kode**: unit, integrasi (PostgreSQL 16 nyata), dan **tes isolasi tenant** untuk setiap endpoint baru.
4. Jalankan `pnpm lint && pnpm typecheck && pnpm test` sebelum menyatakan selesai. Laporkan hasil nyata, bukan asumsi. Jika tes gagal, perbaiki; jangan melonggarkan tes.
5. Tulis/perbarui OpenAPI, dokumentasi, dan ADR bila ada keputusan arsitektur.
6. Akhiri dengan ringkasan: apa yang dibuat, tes yang dijalankan (dan hasilnya), hal yang belum selesai, risiko, pertanyaan terbuka.

## 4. Definition of Done

Kode + tes hijau · tes isolasi tenant hijau · migrasi maju & mundur teruji · izin & audit terpasang · tidak ada data sensitif di log/notifikasi · OpenAPI diperbarui · alur utama diuji di viewport HP (Playwright) · aksesibilitas dasar (axe) lulus.

## 5. Gaya

- Bahasa UI & pesan pengguna: **Bahasa Indonesia** (i18n siap en). Kode, nama variabel, commit: Inggris.
- Fungsi kecil, modul terpisah, tanpa dependensi sirkular; modul tidak memanggil repo modul lain (pakai service publik atau domain event).
- Komentar menjelaskan _mengapa_, bukan _apa_.

## 6. Bila ragu

Jangan berimprovisasi pada: keamanan, RLS, kripto, akuntansi, semantik waktu, lisensi. Berhenti, jelaskan opsi singkat beserta trade-off, dan tunggu keputusan manusia.
