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
   const SPREADSHEET_ID = '16Bg7EG0NXQZkELkzB1mb8RorIv8ruLVgi6ZiGEDLMLU';
   const APP_TIMEZONE = 'Asia/Jakarta';        // zona waktu "hari ini" & jadwal review
   const SETUP_SECRET = 'GANTI-KUNCI-SETUP-ANDA'; // kunci anti-penyalahgunaan setup
   ```
   sudah sesuai dengan ID Spreadsheet & zona waktu kelompok Anda.
4. Klik ikon **Save (Simpan / Ctrl+S)**.

> ⚠️ **Keamanan `SETUP_SECRET`**: fungsi `setupInitialDatabase()` menghapus isi 14 sheet.
> Karena itu aksinya di `doPost` hanya boleh dijalankan dengan `setupKey` yang sama.
> **Sejak v4.2**, selama `SETUP_SECRET` masih nilai default `GANTI-KUNCI-SETUP-ANDA`,
> endpoint `setup_database` via HTTP **ditolak total** — tidak bisa terpicu tanpa sengaja
> meskipun pengirim mengirim nilai default tersebut. Cara paling aman: **jalankan dari
> editor Apps Script** (bagian 3 di bawah) dan biarkan kunci tidak dibagikan.

---

## 3. Jalankan Inisialisasi Database Otomatis
Anda tidak perlu membuat 14 sheet satu per satu secara manual! Fungsi `setupInitialDatabase()` telah diprogram untuk membuat semua struktur sheet, kolom header, formula config, dan akun demo secara otomatis.

1. Di dropdown fungsi pada toolbar Apps Script, pilih fungsi: **`setupInitialDatabase`**.
2. Klik tombol **Run (Jalankan)**.
3. Jika muncul dialog *"Authorization Required"*, klik **Review Permissions** ➔ pilih akun Google Anda ➔ klik **Advanced (Lanjutan)** ➔ klik **Go to ... (unsafe)** ➔ klik **Allow (Izinkan)**.
4. Tunggu beberapa detik hingga proses selesai dengan log:
   `"Seluruh 14 sheet dan data inisialisasi PRD v4 berhasil dibuat di Spreadsheet!"`
5. Jika Anda sudah punya spreadsheet dari versi sebelumnya **jangan** menjalankan ulang
   `setupInitialDatabase()` (isinya akan terhapus). Cukup tambahkan 2 kolom aditif berikut
   pada baris header — nilainya akan diisi otomatis oleh aplikasi:
   - `Master_Hafalan`: kolom ke-12 **`Consecutive_Lancar`** (untuk Recovery Policy: Merah→Kuning butuh 2x Lancar berturut-turut).
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

## 4. Install Trigger Perhitungan Otomatis Setiap Malam (Opsional tapi Direkomendasikan)
Untuk menjalankan retention engine batch dan membersihkan token kedaluwarsa setiap pukul 01:00 malam:
1. Di dropdown fungsi Apps Script, pilih fungsi: **`installNightlyTrigger`**.
2. Klik tombol **Run (Jalankan)**.
3. Trigger harian sekarang aktif otomatis.

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

### Cara mengecek performa
1. Buka Apps Script ➔ **Executions**: lihat durasi & error tiap pemanggilan.
2. Cari log `Sheet "..." belum ada dan dibuat kosong.` untuk mendeteksi setup yang
   belum lengkap (penyebab data terlihat “hilang”).
3. Setelah perubahan, pastikan aplikasi menampilkan **Mode Live (GAS)** dan bisa
   memuat dashboard Ustaz tanpa error.
