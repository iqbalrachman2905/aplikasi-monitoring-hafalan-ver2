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
   ```
   sudah sesuai dengan ID Spreadsheet Anda.
4. Klik ikon **Save (Simpan / Ctrl+S)**.

---

## 3. Jalankan Inisialisasi Database Otomatis
Anda tidak perlu membuat 14 sheet satu per satu secara manual! Fungsi `setupInitialDatabase()` telah diprogram untuk membuat semua struktur sheet, kolom header, formula config, dan akun demo secara otomatis.

1. Di dropdown fungsi pada toolbar Apps Script, pilih fungsi: **`setupInitialDatabase`**.
2. Klik tombol **Run (Jalankan)**.
3. Jika muncul dialog *"Authorization Required"*, klik **Review Permissions** ➔ pilih akun Google Anda ➔ klik **Advanced (Lanjutan)** ➔ klik **Go to ... (unsafe)** ➔ klik **Allow (Izinkan)**.
4. Tunggu beberapa detik hingga proses selesai dengan log:
   `"Seluruh 14 sheet dan data inisialisasi PRD v4 berhasil dibuat di Spreadsheet!"`
5. Buka kembali Google Spreadsheet Anda. Anda akan melihat 14 sheet telah terbuat rapi:
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

---

## 6. Akun Bawaan (Default Demo Credentials)

| Role | Username | Password | Keterangan |
|---|---|---|---|
| Ustaz | `ustaz1` | `123456` | Ustaz Ahmad Fauzi, Al-Hafizh |
| Santri | `santri1` | `123456` | Muhammad Hafizh Al-Fatih |
| Santri 2 | `santri2` | `123456` | Aisyah Humaira |
| Orang Tua | `ortu1` | `123456` | Bapak Ridwan (Orang Tua Hafizh) |
