# Panduan Lengkap Setup Backend Google Apps Script (Code.gs)

Panduan ini memandu Anda langkah demi langkah untuk mengonfigurasi Google Spreadsheet dan Google Apps Script (GAS) agar backend aplikasi retensi hafalan Al-Qur'an berjalan 100% otomatis.

---

## 1. Buka Google Spreadsheet
1. Buka Google Spreadsheet baru atau gunakan spreadsheet yang sudah Anda miliki:
   - ID Spreadsheet yang Anda gunakan: `16Bg7EG0NXQZkELkzB1mb8RorIv8ruLVgi6ZiGEDLMLU`
2. Di menu atas Google Sheets, klik **Extensions (Ekstensi)** ➔ **Apps Script**.

---

## 2. Salin Kode Backend `Code.gs`
1. Hapus seluruh isi kode bawaan di editor Apps Script.
2. Salin dan tempel seluruh isi file `backend/Code.gs` ke dalam editor tersebut.
3. Pastikan konstanta di baris atas:
   ```javascript
   const APP_VERSION = '4.3.0';                 // WAJIB sama dengan js/config.js
   const APP_TIMEZONE = 'Asia/Jakarta';         // zona waktu "hari ini" & jadwal review
   const SPREADSHEET_ID_DEFAULT = '16Bg7...';   // hanya dipakai bila Script Property kosong
   ```
4. Klik ikon **Save (Simpan / Ctrl+S)**.

> 🔐 **Sejak v4.3 tidak ada lagi `SETUP_SECRET` dan tidak ada endpoint `setup_database`
> lewat HTTP.** Fungsi `setupInitialDatabase()` menghapus isi 14 sheet, jadi satu-satunya
> cara menjalankannya adalah **dari editor Apps Script** (bagian 3 di bawah). Ini
> menghilangkan seluruh kelas risiko "endpoint destruktif terpicu tanpa sengaja".

> 🗂️ **Opsional — ID spreadsheet tanpa mengedit kode:** buka *Project Settings* →
> *Script Properties* → tambahkan properti `SPREADSHEET_ID` berisi ID spreadsheet Anda.
> Berguna saat pindah spreadsheet atau memisahkan lingkungan uji/produksi.
>
> 🐞 **Menelusuri error di server:** tambahkan Script Property `DEBUG_ERRORS` = `1`
> agar respons error menyertakan detail teknis (default: detail tidak dikirim ke klien).

---

## 3. Jalankan Inisialisasi Database Otomatis (hanya spreadsheet baru/kosong)
Anda tidak perlu membuat 14 sheet satu per satu secara manual! Fungsi `setupInitialDatabase()` telah diprogram untuk membuat semua struktur sheet, kolom header, formula config, dan akun demo secara otomatis.

> ⚠️ **Jangan jalankan `setupInitialDatabase()` pada spreadsheet lama/live atau yang berisi data.** Fungsi ini mengosongkan dan mengisi ulang 14 sheet. Untuk database yang sudah digunakan, pakai audit dan repair terbatas pada bagian 3a.

1. Di dropdown fungsi pada toolbar Apps Script, pilih fungsi: **`setupInitialDatabase`**.
2. Klik tombol **Run (Jalankan)**.
3. Jika muncul dialog *"Authorization Required"*, klik **Review Permissions** ➔ pilih akun Google Anda ➔ klik **Advanced (Lanjutan)** ➔ klik **Go to ... (unsafe)** ➔ klik **Allow (Izinkan)**.
4. Tunggu beberapa detik hingga proses selesai dengan log:
   `"Seluruh 14 sheet dan data inisialisasi PRD v4 berhasil dibuat di Spreadsheet!"`
5. Jika Anda sudah punya spreadsheet dari versi sebelumnya **jangan** menjalankan ulang
   `setupInitialDatabase()` (isinya akan terhapus). Gunakan audit/perbaikan aman pada
   bagian 3a; bila dua header aditif ini memang hilang dan header sebelumnya cocok,
   `applyMissingSchemaHeaders()` menambahkannya tanpa mengubah baris data:
   - `Master_Hafalan`: kolom ke-12 **`Consecutive_Lancar`** (Recovery Policy: Merah→Kuning butuh 2x Lancar berturut-turut).
   - `Cache_Ayat`: kolom ke-6 **`Teks_Indonesia`** (terjemahan ayat untuk modal Tes Acak Ortu).

   Kolom `Password_Hash` tidak perlu diubah: hash baru berformat `salt$hash`, dan hash
   SHA-256 lama (tanpa salt) tetap bisa login sampai password diganti.
6. Buka kembali Google Spreadsheet Anda. Anda akan melihat 14 sheet telah terbuat rapi:
   - `Users`
   - `Santri`
   - `Target`
   - `Hafalan`
   - `Master_Hafalan`
   - `Murojaah`
   - `Riwayat_Tes`
   - `Gamifikasi`
   - `Badge`
   - `Notifikasi`
   - `Feedback`
   - `Config`
   - `Sessions`
   - `Cache_Ayat`

---

## 3a. Audit dan Perbaikan Skema Aman untuk Spreadsheet yang Sudah Berisi Data

Gunakan bagian ini untuk spreadsheet lama/live. Semua fungsi tersedia di dropdown
Apps Script setelah `Code.gs` terbaru disimpan. Sebelum menjalankan fungsi, pastikan
Script Property `SPREADSHEET_ID` (atau spreadsheet aktif yang dipakai) menunjuk ke
file yang benar. Audit default membaca baris data secara bertahap hanya untuk
menghitung baris yang sepenuhnya kosong; laporan hanya mengembalikan jumlah dan
nomor baris (maksimal 100 nomor per sheet), bukan isi record. Sheet arsip
`Arsip_Murojaah`, `Arsip_Riwayat_Tes`, dan `Arsip_Notifikasi` dibuat oleh fitur
arsip; wajar bila belum ada.

1. Jalankan **`auditDatabaseSchema()`** dan baca laporan di Execution log. Laporan
   menunjukkan sheet hilang, header kosong/terpotong, header yang berbeda/bergeser,
   sheet yang baru berisi header, baris data sepenuhnya kosong, dan fungsi tiap sheet
   dalam alur HAFAL → JAGA → UJI → PUTUSKAN → LANJUT. Tidak ada sheet atau nilai
   yang dibuat/diubah.
2. Jalankan **`auditStudentDataIntegrity()`** untuk dry-run relasi ID. Laporan hanya
   berisi hitungan/status dan nomor baris (maksimal 100 per kategori)—bukan nama,
   ID mentah, hash, token, atau isi pesan. Ia menandai alias ID yang dapat dipetakan,
   relasi yang belum jelas, duplikasi ID-target persis, serta target yang berbeda
   format ID tetapi mengarah ke santri-bulan yang sama. Fungsi ini tidak mengubah data;
   jangan migrasikan ID atau menghapus target berdasarkan laporan tanpa pemetaan
   dan keputusan pemilik data.
3. Jalankan **`repairMissingSchemaHeaders()`** untuk melihat dry-run di Execution log. Ini hanya
   merencanakan pembuatan sheet inti yang hilang dan header kosong/kolom ujung yang
   hilang; header berbeda dan header yang terdeteksi bergeser ke baris lebih bawah
   sengaja dilewati. Baris tidak dipindah otomatis.
4. Tinjau log dry-run terlebih dahulu. Jika sesuai, jalankan **`applyMissingSchemaHeaders()`**
   secara eksplisit. Fungsi ini hanya membuat sheet/header yang hilang dan mengisi
   header kosong atau suffix header yang hilang. Ia tidak menghapus, memindahkan,
   mengisi ulang, atau mengedit baris data; jumlah baris data diverifikasi kembali.
5. Jalankan lagi **`auditDatabaseSchema()`** untuk memverifikasi hasil. Bila status
   `header_mismatch`, `unexpected_extra_headers`, atau `header_row_offset`, jangan
   paksa repair otomatis; tinjau posisi/header mapping secara manual sebelum
   migrasi apa pun.

Perbaikan aman ini **tidak** membuat seed akun/demo dan bukan pengganti setup
pertama. Baris `Users`/data lain yang belum ada tetap harus diinisialisasi secara
terpisah dengan prosedur yang disetujui pemilik database.

---

## 4. Trigger Perhitungan Otomatis Setiap Malam
Menjalankan retention engine batch (Hijau → Kuning untuk review yang terlewat ≥3 hari)
dan membersihkan token sesi kedaluwarsa setiap pukul 01:00.

**Sejak v4.3 trigger dipasang OTOMATIS** saat login pertama berhasil
(`ensureNightlyTrigger()`). Tidak ada lagi ketergantungan pada ingatan operator —
dulu langkah ini manual, dan bila terlupa, sheet `Sessions` tumbuh tanpa batas
sehingga semua request menjadi lambat ("putus–nyambung").

Bila ingin memasang / memastikan secara manual:
1. Di dropdown fungsi Apps Script, pilih fungsi: **`installNightlyTrigger`**.
2. Klik tombol **Run (Jalankan)**.
3. **Verifikasi:** jalankan fungsi **`healthCheck`** — ia melaporkan apakah trigger
   terpasang, kapan batch terakhir berjalan (`lastNightlyRun`), jumlah baris sheet
   kunci, dan daftar peringatan yang perlu ditindak.

---

## 5. Deploy Web App Google Apps Script
Agar Frontend (GitHub Pages) dapat berkomunikasi dengan backend:

1. Di pojok kanan atas editor Apps Script, klik tombol **Deploy** ➔ **New deployment (Penerapan baru)**.
2. Klik ikon gerigi ⚙️ di sebelah *Select type* ➔ pilih **Web app**.
3. Isi konfigurasi deployment:
   - **Description:** `Quran Retention API v4`
   - **Execute as (Jalankan sebagai):** `Me (email Anda)`
   - **Who has access (Siapa yang memiliki akses):** **`Anyone (Siapa saja)`** ⚠️ *Penting: wajib "Anyone" agar browser frontend bisa mengakses API*.
4. Klik **Deploy**.
5. Salin **Web app URL** yang dihasilkan (formatnya: `https://script.google.com/macros/s/.../exec`).
6. Jika URL berbeda dengan URL yang ada di `js/config.js`, cukup perbarui nilai `API_URL` di file `js/config.js`.

> 🔁 **Setiap kali `Code.gs` diperbarui** (termasuk perbaikan keamanan di versi ini),
> buat versi deployment baru supaya perubahan aktif:
> **Deploy ➔ Manage deployments ➔ ✏️ Edit ➔ Version: New version ➔ Deploy**.
> Tanpa langkah ini, frontend masih memanggil kode lama.

7. Halaman frontend akan menampilkan **"Mode Live (GAS)"** setelah tombol mode di header ditekan.
   Bila koneksi gagal, aplikasi **tidak** lagi menampilkan data simulasi sebagai data asli —
   akan muncul notifikasi error yang jelas.

---

## 5b. Arsip Riwayat Lama (v4.4) — aman secara default

Sheet histori (`Murojaah`, `Riwayat_Tes`, `Notifikasi`) tumbuh terus; karena setiap
pembacaan memakai `getRange`, ukuran sheet = ongkos. `archiveOldRows()` memindahkan
baris lama ke sheet `Arsip_*` pada spreadsheet yang sama (atau ke spreadsheet arsip
terpisah bila Script Property `SPREADSHEET_ID_ARSIP` diisi).

**Urutan aman yang disarankan:**
1. **Backup dulu:** Google Sheets ➔ *File* ➔ *Make a copy* (kebiasaan baik sebelum
   menyentuh data historis).
2. Dari editor Apps Script, jalankan **`selfTest()`** — ia melaporkan ukuran sheet,
   duplikat data, status trigger, dan **rencana arsip** (uji kering). Tidak ada yang
   diubah oleh `selfTest()`.
3. Jalankan **`archiveOldRows()`** tanpa argumen → tetap **uji kering**: ia hanya
   menunjukkan berapa baris yang akan dipindahkan per sheet. Periksa angkanya.
4. Bila angkanya wajar, jalankan **`archiveOldRows({ dryRun: false })`** untuk
   benar-benar memindahkan. Baris baru dihapus dari sheet aktif **hanya setelah**
   penulisan arsip terverifikasi.
5. Agar berjalan otomatis tiap malam: tambahkan baris `ARCHIVE_AKTIF` = `1` pada
   sheet `Config`. Selama `0`/tidak ada, batch malam hanya melaporkan (uji kering).

> ⚠️ Notifikasi yang **belum dibaca** tidak pernah diarsipkan, sehingga pesan untuk
> santri tidak hilang dari pandangan. Batas usia arsip diatur `ARCHIVE_AMBANG_BULAN`
> (default 6 bulan). Untuk pengujian, `archiveOldRows({ bulan: 1, dryRun: false })`.

---

## 6. Akun Bawaan (Default Demo Credentials)

| Role | Username | Password | Keterangan |
|---|---|---|---|
| Ustaz | `ustaz1` | `123456` | Ustaz Ahmad Fauzi, Al-Hafizh |
| Santri | `santri1` | `123456` | Muhammad Hafizh Al-Fatih |
| Santri 2 | `santri2` | `123456` | Aisyah Humaira |
| Orang Tua | `ortu1` | `123456` | Bapak Ridwan (Orang Tua Hafizh) |

---

## 7. Troubleshooting: “Gagal membuat data” & Aplikasi Lambat

### Gejala
- Menyimpan setoran / target / broadcast kadang gagal atau lama.
- Muncul error `Service Spreadsheets failed` atau “Server sedang sibuk menyimpan data”.

### Penyebab & solusi
1. **Kode lama masih terpakai** → setelah mengubah `Code.gs`, WAJIB buat
   deployment versi baru: *Deploy ➔ Manage deployments ➔ ✏️ Edit ➔ Version: New version ➔ Deploy*.
2. **Akses Web App bukan “Anyone”** → login/permintaan bisa dialihkan (HTTP 302)
   dan gagal. Set *Who has access* = **Anyone**.
3. **Jumlah tulis menumpuk** (banyak santri input bersamaan) → versi terbaru sudah
   memakai **cache**, **batch write**, dan **lock retry + flush**. Hindari broadcast
   besar bersamaan dengan input setoran massal.
4. **Perhitungan retensi berat di jam sibuk** → jalankan `installNightlyTrigger()`
   agar batch harian berjalan pukul 01:00.
5. **Sheet belum dibuat** → jalankan `setupInitialDatabase()` dari **editor Apps
   Script** (bukan lewat HTTP) supaya semua 14 sheet + header terbuat sekali jalan.
6. **Spreadsheet terlalu besar** → arsipkan riwayat lama (pakai `ARCHIVE_AMBANG_BULAN`)
   atau pisahkan riwayat ke spreadsheet arsip.
7. **Audio/terjemahan ayat tidak muncul padahal sudah pernah diuji** → v4.2 sudah
   memperbaiki pemetaan kolom `Cache_Ayat` dan menambah stale-check: cache yang
   rusak/lama (>30 hari) otomatis diambil ulang. Pastikan Anda memakai `Code.gs`
   versi terbaru (deployment versi baru), lalu uji ulang tes acak ortu.
8. **Muncul peringatan "Backend Google Apps Script masih vX (frontend vY)"** →
   deployment yang melayani frontend masih versi lama. Buat deployment versi baru
   (langkah 5 di atas). Peringatan ini disengaja agar masalah ini tidak lagi
   tersembunyi.
9. **Ada pesan "Data mungkin TERSIMPAN" saat menyimpan** → request timeout di sisi
   klien, tetapi server bisa jadi tetap menyelesaikan penyimpanan. Aplikasi v4.3
   otomatis memuat ulang data untuk memastikan dan **tidak** menyarankan mengulang.
   Bila backend masih versi lama (tanpa pengaman anti-dobel), jangan mengulang
   perintah sebelum memeriksa daftar/riwayat.
10. **Sheet `Sessions` membengkak / login melambat** → jalankan `healthCheck` atau
    `selfTest`: bila trigger tidak terpasang, jalankan `installNightlyTrigger`.
    Token kedaluwarsa juga dibersihkan otomatis saat ditemukan (lazy cleanup).
11. **Ingin memastikan data tidak dobel/rusak** → jalankan **`selfTest()`** dari editor
    Apps Script. Laporannya memuat: ukuran tiap sheet, header kolom aditif
    (`Consecutive_Lancar`, `Teks_Indonesia`), duplikat `Target`/`Master_Hafalan`/
    `Users`/token sesi, jumlah sesi kedaluwarsa, status trigger + `lastNightlyRun`,
    serta rencana arsip (uji kering).

### Cara mengecek performa
1. Buka Apps Script ➔ **Executions**: lihat durasi & error tiap pemanggilan.
2. Cari log `Sheet "..." belum ada dan dibuat kosong.` untuk mendeteksi setup yang
   belum lengkap (penyebab data terlihat “hilang”).
3. Setelah perubahan, pastikan aplikasi menampilkan **Mode Live (GAS)** dan bisa
   memuat dashboard Ustaz tanpa error.
