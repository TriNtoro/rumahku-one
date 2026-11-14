# ADR-0007 — Hosting: profil A (Vercel + Supabase + R2)

Status: **Diusulkan** · Tanggal: 2026-11-14

## Konteks

Lihat `DEPLOY_PROFILES.md` di Project. Kebutuhan: dikelola dari HP, biaya rendah, tanpa server sendiri.

## Keputusan

- Aplikasi: Vercel (Next.js). Database: Supabase PostgreSQL 16. File: Cloudflare R2 (atau bucket Supabase).
- Aplikasi **tidak** memakai Supabase Auth maupun PostgREST; Supabase hanya PostgreSQL terkelola. Kita tidak bergantung
  pada fitur eksklusifnya.
- Dua role database: `rumahku_owner` (migrasi, koneksi langsung) dan `rumahku_app` (aplikasi, lewat pooler mode
  transaksi; NOSUPERUSER, NOBYPASSRLS, bukan pemilik tabel).

## Hal yang BELUM terverifikasi (wajib dicek saat deploy pertama)

1. Migrasi dijalankan terhadap PostgreSQL lokal 16.15, **bukan** instans Supabase. Di Supabase ekstensi (`citext`,
   `pgcrypto`) berada di schema `extensions`; bila `citext` tidak ditemukan, atur
   `ALTER ROLE rumahku_owner SET search_path = public, extensions;` sebelum migrasi.
2. Nama pengguna lewat pooler Supabase berformat `rumahku_app.<project-ref>`; periksa di dasbor.
3. Cron Vercel di paket gratis dibatasi frekuensinya; reminder menit-an (F1c) mungkin butuh penjadwal eksternal.

## Konsekuensi

Bila verifikasi di atas gagal, keputusan ini ditinjau ulang (alternatif: Neon, atau profil C).
