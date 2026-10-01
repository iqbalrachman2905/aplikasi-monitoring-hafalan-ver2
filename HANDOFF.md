# 🤝 HANDOFF — Status Pekerjaan & Cara Melanjutkan

> Dokumen ini untuk **dibaca pertama kali** saat melanjutkan pekerjaan di sesi/chat baru.
> Terakhir diperbarui: **1 Oktober 2026** • Versi aplikasi: **4.4.0** • Branch kerja:
> `arena/01a0f19f-aplikasi-monitoring-hafalan-ve` • **PR #2 sudah di-MERGE** ke `main`
> (merge commit `1f4a076`; deploy GitHub Pages sukses, versi 4.4.0 sudah terbit).

---

## 1. Ringkasan 30 detik

Aplikasi monitoring hafalan (HTML/CSS/JS murni + backend Google Apps Script) sudah
melewati dua gelombang perbaikan:

| Gelombang | Fokus | Status |
|---|---|---|
| **v4.3 (Gelombang 0)** | Memutus **kegagalan senyap** & **data dobel**: feedback ustaz yang hilang, celah otorisasi antar-kelompok, idempotensi `requestId`, taksonomi kode error, timeout per aksi, guard klik ganda, trigger malam otomatis, `backend/` tidak lagi terbit ke Pages, CI memverifikasi sebelum deploy | ✅ selesai |
| **v4.4 (Gelombang 1 tahap 1–2)** | **Performa & perawatan data**: indeks sekali baca (O(santri×baris) → O(baris)), kolom minimal (`getDataRange` 34 → 3), sesi & dashboard via `CacheService`, arsip otomatis yang aman (default uji kering), `selfTest()`, uji retensi + paritas Mode Demo | ✅ selesai & **sudah merge ke `main`** (`1f4a076`) |
| **Berikutnya (tahap 3)** | Jalur ayat & flashcard: `get_ayah_range` (1 fetch banyak ayat), penyusunan kartu paralel, cache ayat di klien; lalu idempotensi tingkat bisnis & rate limit login | ⏳ belum |

**Semua uji hijau:** `npm run verify` → **85 uji otomatis** (24 lapisan API + 28 retensi/paritas + 33 simulasi arsip) + cek sintaks + penjaga regresi.

---

## 2. Perintah wajib sebelum menyentuh kode

```bash
npm run verify   # WAJIB hijau sebelum commit: sintaks + paritas + 85 uji
npm start        # dev server: http://localhost:8080 (bind 0.0.0.0)
```

Akun Mode Demo: `santri1` / `ortu1` / `ustaz1`, password `123456`.
Mode Live butuh deployment Apps Script (lihat `backend/SetupGuide.md`).

---

## 3. Peta berkas penting

| Berkas | Isi yang perlu diketahui |
|---|---|
| `quran-retention-app/backend/Code.gs` | Backend GAS (~2.900 baris). Kunci: `doPost` (router + idempotensi), `withLock`, `withIdempotency`, `readSheet_`, `buildMasterIndex_`, `dashVersion_`, `calculateNextRetentionState`, `archiveOldRows`, `systemDiagnostics_`, `selfTest`, `healthCheck` |
| `quran-retention-app/js/api.js` | Klien HTTP: `API.ERR` (taksonomi kode error), `API_POLICY` (timeout), `requestId`, retry aman, `handleMockRequest` (Mode Demo) |
| `quran-retention-app/js/mock-data.js` | State Mode Demo + `mockApplyRetention` (harus identik dengan `calculateNextRetentionState`) |
| `quran-retention-app/js/config.js` | `APP_VERSION` + `API_POLICY` + `RETENTION`/`GAMIFICATION`/`COMPETENCY` (cermin sheet `Config`) |
| `quran-retention-app/js/ui.js` | `UI.runOnce()` — pengaman klik ganda untuk semua aksi tulis |
| `tools/check-api-parity.cjs` | 8 kelompok penjaga regresi: action mock↔backend, feedback→Notifikasi, mock default, `setup_database`, idempotensi, performa dashboard, keselamatan arsip, `selfTest` read-only |
| `tools/test-api.cjs` | 24 uji lapisan API (mock, taksonomi error, anti-data-dobel, peringatan versi) |
| `tools/test-retention.cjs` | 28 uji: retensi (cap 60 hari, recovery 2× Lancar), **paritas backend↔mock**, tanggal arsip, kolom arsip |
| `tools/test-archive.cjs` | 33 uji: fungsi arsip **asli** dijalankan di atas Spreadsheet tiruan (uji kering tak mengubah sel, verifikasi gagal ⇒ tidak menghapus, notifikasi belum dibaca aman) |

---

## 4. Keputusan yang sudah diambil pemilik sistem (jangan diubah tanpa bertanya)

1. **Skema Notifikasi TIDAK diubah.** Broadcast tetap menulis N baris; penghematannya
   lewat arsip/pemangkasan, bukan normalisasi tabel.
2. **Tombol Mode Demo & ganti peran tetap terlihat** (tidak disembunyikan di produksi).
3. **`README.txt` & `DEVELOPMENT.txt` dihapus** — sumber tunggal adalah file `.md`.
4. **`backend/` tidak ikut terbit ke GitHub Pages** (dulu membocorkan ID spreadsheet).
5. **Arsip otomatis default UJI KERING.** Baru aktif bila `ARCHIVE_AKTIF = 1` di sheet `Config`.
6. **Uji lapisan API ditulis tanpa dependency** (tanpa Chrome/Puppeteer).
   `tools/test-flashcard.cjs` lama tetap ada tetapi **bukan** bagian dari `npm test`.

---

## 5. Status merge (SUDAH SELESAI — bukti)

| Pemeriksaan | Hasil |
|---|---|
| `npm run verify` sebelum merge | ✅ 85 uji lulus (24 API + 28 retensi/paritas + 33 simulasi arsip) |
| CI di PR #2 | ✅ job `verify` sukses (`deploy` di-skip di PR — memang begitu) |
| Merge PR #2 | ✅ `state = MERGED`, merge commit **`1f4a076`**, `main` = `1f4a076` |
| Deploy GitHub Pages dari `main` | ✅ run sukses (job `deploy` **success**) |
| Situs terbit | ✅ `js/config.js` memuat `APP_VERSION: '4.4.0'` |
| Folder `backend/` di Pages | ✅ **404** (ID spreadsheet tidak lagi terbit) |

> 6 commit ikut masuk: `b325f44`, `c6550fe`, `b111c0a`, `e838442` (v4.3) + `761a54c` (tahap 1)
> + `a6adf47` (tahap 2). Rollback: `git revert` commit spesifik, atau redeploy versi lama
> (Pages ➔ *Deployments*, Apps Script ➔ *Manage deployments* ➔ pilih version lama).

## 6. ⚠️ SATU-SATUNYA langkah manual yang belum dikerjakan (backend Live)

Repo & situs sudah benar, tetapi **backend Live masih versi lama sampai Anda melakukan ini**:

1. Buka spreadsheet ➔ **Extensions ➔ Apps Script**.
2. **Tempel isi `quran-retention-app/backend/Code.gs`** dari `main` (versi 4.4.0) — ganti seluruh isi,
   lalu **Simpan**.
3. **Deploy ➔ Manage deployments ➔** ✏️ (Edit) ➔ **Version: New version** ➔ **Deploy**.
   Tanpa langkah ini aplikasi menampilkan peringatan *"backend masih versi lama"* (memang disengaja
   oleh pengaman versi).
4. Jalankan **`selfTest()`** dari editor (dropdown fungsi ➔ Run) dan periksa bagian `warnings`.
5. Uji cepat Mode Live: login `ustaz1` → dashboard harus terasa cepat → catat 1 setoran →
   cek santri menerima notifikasi; login `ortu1` → tes acak.
6. (Opsional) Arsip: jalankan `archiveOldRows()` = **uji kering**; bila angkanya wajar,
   `archiveOldRows({ dryRun: false })`; nyalakan otomatis dengan `ARCHIVE_AKTIF = 1` di sheet `Config`.
   Urutan aman lengkap ada di `backend/SetupGuide.md` bagian 5b.

---

## 7. Pekerjaan berikutnya (tahap 3) — siap dikerjakan

| # | Pekerjaan | Alasan | Risiko bila salah | Ukuran |
|---|---|---|---|---|
| 1 | **`get_ayah_range(surah, dari, sampai)`** — 1 fetch untuk banyak ayat; flashcard memakai 3–4 request berurutan per kartu (5 kartu = 15–20 request) | Jalur paling berat di sisi pengguna; juga mengurangi kuota UrlFetch | Sedang — perlu hati-hati pada `Cache_Ayat` (kolom & stale-check) | M |
| 2 | **Susun kartu flashcard paralel** (`Promise.all` bertahap) + cache ayat di klien (LRU `localStorage`) | Membuat tab Flashcard terasa instan walau jaringan lambat | Rendah | S |
| 3 | **Idempotensi tingkat bisnis**: upsert murojaah per (santri, jenis, unit, tanggal) | Lapisan kedua setelah `requestId` (mencegah XP dobel walau cache gagal) | Sedang — menyentuh data historis | M |
| 4 | **Rate limit login + sheet `Audit`** | Endpoint login publik tanpa pembatas | Rendah | S |
| 5 | **Sesi berbasis token bertanda tangan (stateless)** | Menghapus pembacaan `Sessions` sepenuhnya | Sedang — kehilangan pencabutan token instan | M |
| 6 | **Panel "Status Sistem" di UI** (konsumsi `health_check`) | Agar `warnings` terlihat tanpa membuka Apps Script | Rendah | S |
| 7 | **Batasi request berulang `get_ayah_content`** dengan cache klien agar tidak memicu validasi sesi berulang | Melengkapi butir 2 | Rendah | S |

Urutan yang disarankan: **1 → 2 → 3 → 4 → 6/7 → 5**.
Butir 5 dikerjakan terakhir karena mengubah model keamanan sesi.

---

## 8. Konvensi kerja (supaya tidak menimbulkan bug baru)

1. **Naikkan versi di DUA tempat sekaligus** saat merilis: `APP_VERSION` di
   `js/config.js` **dan** `backend/Code.gs`, plus `package.json`.
2. **Setiap perubahan perilaku wajib menambah penjaga di `tools/check-api-parity.cjs`**
   atau uji di `tools/test-api.cjs` / `tools/test-retention.cjs`.
3. **Setiap penulisan baru wajib** dibungkus `withLock(...)` **dan** didaftarkan di
   `WRITE_ACTIONS` (`js/api.js`) agar otomatis dibungkus `withIdempotency`.
4. **Setiap penulisan baru wajib menaikkan versi data** — sudah otomatis lewat `withLock`,
   kecuali memang tidak mengubah data dashboard (contoh: cache ayat).
5. **Pembacaan sheet baru wajib memakai `readSheet_(nama, jumlahKolom)`** — jangan
   `getDataRange()`; CI akan menolaknya untuk fungsi dashboard.
6. **Mock harus mengikuti backend.** Bila menambah action di `Code.gs`, tambahkan juga
   di `handleMockRequest` — jika belum, mock akan menjawab jujur "belum didukung"
   (bukan "sukses" palsu).
7. **Jangan hapus apa pun dari spreadsheet tanpa uji kering + verifikasi tulis.**
   Pola ini sudah dipakai `archiveOldRows` dan dijaga CI.

---

## 9. Kalau ada masalah setelah merge (gejala → penyebab → tindakan)

| Gejala | Kemungkinan penyebab | Tindakan |
|---|---|---|
| Peringatan "backend masih versi lama" | Deployment GAS belum dibuat versi baru | Deploy ➔ New version |
| "Data mungkin TERSIMPAN" saat menyimpan | Request timeout; server bisa jadi tetap selesai | Jangan ulangi perintah; buka daftar/riwayat untuk memastikan (aplikasi sudah memuat ulang otomatis) |
| Dashboard kosong / error kontrak | `Code.gs` lama + frontend baru, atau URL `API_URL` salah | Buat deployment baru; periksa `js/config.js` |
| Login lambat / sheet `Sessions` besar | Trigger malam tidak berjalan | `selfTest()` → jalankan `installNightlyTrigger()` |
| Pesan ustaz tidak muncul di santri | Kemungkinan regresi ditulis ke sheet lain | Jalankan `npm run check` → penjaga paritas akan menunjukkannya |
| Data target/hafalan terlihat dobel | Sisa data lama dari versi pra-4.3 | `selfTest()` melaporkan jumlah duplikat; gabungkan manual bila perlu |

---

## 10. Prompt saran untuk sesi/chat berikutnya

> "Lanjutkan pekerjaan di repo `aplikasi-monitoring-hafalan-ver2`. Baca `HANDOFF.md`
> dulu. Kerjakan **tahap 3 butir 1–2** (`get_ayah_range` + kartu flashcard paralel +
> cache ayat klien). Patuhi konvensi di bagian 8 HANDOFF.md, dan wajib lulus
> `npm run verify` sebelum commit. Tambahkan penjaga/u​​ji baru untuk perilaku baru."
