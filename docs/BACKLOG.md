# BACKLOG — ide yang ditunda (bukan cakupan F0)

## Referensi UI (dikirim Illa, 2026-11-14) — aplikasi keluarga lain, untuk F1+

Dipakai sebagai **inspirasi pola**, bukan untuk ditiru (logo, nama, warna, teks tidak boleh disalin).

- Beranda: sapaan + cuaca ringkas + grid ikon modul (Keuangan, Kalender, Perawatan, Jurnal, Link Penting, Laporan, Lainnya).
- "Agenda Hari ini" dengan centang dan hitung selesai (0/1), tombol tambah cepat.
- Kartu "Hari Ini": budget aman, jadwal anak, tagihan besok, servis kendaraan, pengingat quality time.
- Kalender bulanan dengan titik berwarna per kategori; kategori dapat diurutkan (tahan lalu geser).
- Notifikasi berisi satu urusan: partner bergabung, tugas jatuh tempo.
- Kartu percakapan pasangan (Conversation Cards) dan jurnal keluarga → terkait F5–F6.
- Fitur keuangan di contoh: foto struk terbaca otomatis (OCR), gaji terbagi ke pos, kalkulator cicilan (bunga tetap/flat/bertingkat), harga emas/saham/reksadana otomatis, sinkron Google Sheets/unduh Excel.

Ide turunan: kartu "Hari Ini" dihitung dari `domain_events` + `schedules`, tanpa logika terpisah.

## Lain-lain

- Ganti rate-limit in-memory dengan penyimpanan bersama (Upstash/Redis atau tabel DB) sebelum dibuka untuk banyak pengguna.
- `GET /auth/me` ditambahkan di F0 hanya untuk membuktikan sesi berfungsi.

## Referensi UI batch 2 (menu "Lainnya" + pengaturan) — untuk F1+

- Navigasi bawah 5 tab: Beranda, Keuangan, Kalender, Berdua, Lainnya.
- Menu Lainnya dikelompokkan: Rumah & Catatan (Maintenance dengan tab Kendaraan/Rumah/Elektronik), Keuangan (akun pribadi: pasangan hanya melihat pindahan & total), Pengaturan (akun & keamanan, notifikasi, tampilan & fitur/aktif-nonaktif modul, wallet & pos, anggaran & mata uang, data & backup/import/Google Sheets), Bantuan & FAQ, Usulan Fitur.
- Profil keluarga: nama keluarga, nama saya, undang partner, tanggal ulang tahun pernikahan (pengingat 7 hari sebelumnya), daftar anggota.
- Perawatan rumah: kartu dengan interval ("rutin tiap 1 tahun") dan hitung mundur ("94 hari lagi"); tombol Import.
- Prompt "Tambahkan ke Layar Utama" untuk PWA (relevan untuk iOS Web Push, lihat SPEC §9.2).
- Mode demo dengan data contoh (berguna untuk onboarding).
- Ditolak untuk RUMAHKU-ONE: program affiliate, banner penjualan lifetime (di luar cakupan; model berbagi masih keputusan terbuka).
- Selaras SPEC: `workspaces.enabled_modules` = "Atur Fitur"; akun privat = `fin_accounts.visibility='private'` (perlu varian "pasangan lihat total saja" → tanya Illa di F1d).

## Referensi UI batch 3 (pengaturan lanjutan) — untuk F1+

- Akun pribadi berkunci PIN terpisah dari PIN keluarga; terkunci lagi saat pindah app/layar mati/2 menit tidak disentuh. Pasangan hanya melihat pindahan uang dan total (wallet "Akun pribadi"), bukan isinya. → keputusan F1d/F5 (kaitkan dengan re-auth SPEC §8.2).
- "Atur Fitur" (11 fitur on/off), "Pintasan Beranda" (8 ikon, urutan bisa diseret), "Menu Keuangan" (9 tombol, bisa diatur); daftar "Tambah pintasan": catat pengeluaran/pemasukan, transfer antar wallet, scan nota, transaksi rutin, goal & tabungan, aset & investasi.
- Tampilan per perangkat: otomatis / komputer / HP (hanya berlaku untuk browser itu).
- Notifikasi & cuaca: cuaca di Beranda on/off, lokasi rumah, info install PWA.
- Link Penting dikunci PIN (perlu setel PIN dulu).
- Keamanan: ganti password, penjelasan "data terenkripsi" untuk pengguna awam.
- Catatan: "Chat AI" dan "Scan nota" menyentuh privasi/biaya → perlu keputusan terpisah sebelum masuk cakupan.

## Referensi UI batch 4 — untuk F1+ (sumber: dua aplikasi contoh; hanya pola)

- Keuangan: wallet bawaan per pengguna ("wallet bawaanku"); wallet pasangan disembunyikan dari pilihan saat mencatat tapi laporan/saldo tetap lengkap; rasio split "Bersama" (mis. 50/50) sebagai default per transaksi, transaksi lama tidak berubah; **periode anggaran & laporan mulai di tanggal gajian (1–31)**, bukan hanya tanggal 1 (perlu kolom di `workspaces`/`budgets` — keputusan F3); mata uang utama.
- Hapus/reset: data terhapus bisa dipulihkan 90 hari (selaras soft delete `deleted_at`); reset butuh PIN/re-auth; "siapa boleh mengubah & menghapus" sebagai pengaturan.
- Layar Hari Ini ala aplikasi rutin: tugas hari ini (x/y), habit per waktu (pagi/siang/malam) dengan streak, kolom tulis cepat "Tulis tugas atau habit…", tab Hari Ini/Tugas/Fokus/Habit/Rapor. → F1b (quick add ≤3 ketukan) dan F5 (habit).
- Layar login: logo, sapaan, email, kata sandi (ikon lihat), "Lupa password?", "Daftar Akun".
