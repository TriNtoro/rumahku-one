# Pemberitahuan Pihak Ketiga

Diperiksa 2026-11-14 dari `package.json` terpasang di `node_modules` (bukan dari ingatan). Jalankan ulang
pemeriksaan lisensi setiap kali menambah dependensi (aturan 10 AGENTS.md).

## Dependensi langsung

| Paket                                                  | Versi                              | Lisensi    | Jenis   | Dipakai di                  |
| ------------------------------------------------------ | ---------------------------------- | ---------- | ------- | --------------------------- |
| next                                                   | 16.4.6                             | MIT        | runtime | apps/web                    |
| react, react-dom                                       | 19.3.1                             | MIT        | runtime | apps/web                    |
| zod                                                    | 4.6.7                              | MIT        | runtime | apps/web                    |
| pg                                                     | 8.23.1                             | MIT        | runtime | apps/web, packages/db-tools |
| pino                                                   | 10.4.0                             | MIT        | runtime | apps/web                    |
| @node-rs/argon2                                        | 2.2.2                              | MIT        | runtime | apps/web                    |
| @aws-sdk/client-s3, @aws-sdk/s3-request-presigner      | 3.1169.0                           | Apache-2.0 | runtime | apps/web                    |
| typescript                                             | 5.9.3                              | Apache-2.0 | dev     | root                        |
| vitest                                                 | 5.1.0                              | MIT        | dev     | apps/web, packages/shared   |
| eslint, typescript-eslint, prettier                    | 10.15.0 / 8.72.2 / 3.10.1          | MIT        | dev     | root                        |
| turbo, tsx, husky, lint-staged                         | 2.11.11 / 4.23.15 / 9.1.7 / 17.6.0 | MIT        | dev     | root                        |
| @commitlint/cli, @commitlint/config-conventional       | 21.2.4                             | MIT        | dev     | root                        |
| @types/node, @types/pg, @types/react, @types/react-dom | —                                  | MIT        | dev     | —                           |

## Dependensi transitif (291 paket unik dipindai)

MIT 207 · Apache-2.0 45 · ISC 16 · BSD-2-Clause 6 · BSD-3-Clause 3 · BlueOak-1.0.0 3 · MPL-2.0 3 · LGPL-3.0-or-later 2 · 0BSD 1 · Python-2.0 1 · CC-BY-4.0 1.
Tidak ada AGPL/GPL/BSL/SSPL/FSL/ELv2.

### Perlu perhatian (bukan pelanggaran, tetapi dicatat)

| Paket                                | Lisensi           | Dibawa oleh                                  | Catatan                                                                                                                                                                                                     |
| ------------------------------------ | ----------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @img/sharp-libvips-linux-x64 (+musl) | LGPL-3.0-or-later | `next` → `sharp` (opsional, optimasi gambar) | Biner pra-bangun yang ditautkan dinamis; kita tidak menyalin atau memodifikasi kodenya. Bila memakai `next/image` di produksi, pertahankan pemberitahuan ini. Tinjau lagi sebelum distribusi ke pihak lain. |
| lightningcss (+ biner linux)         | MPL-2.0           | `vite` → `vitest`                            | Hanya alat tes/dev, tidak dikirim ke produksi. MPL bersifat copyleft tingkat berkas; tidak ada modifikasi.                                                                                                  |

Paket workspace sendiri (`@rumahku/*`) belum memiliki bidang `license`; putuskan lisensi proyek sebelum dibuka ke publik.

## Kebijakan

Repositori AGPL/GPL/BSL/source-available hanya dijadikan referensi ide; tidak ada kode yang disalin.
