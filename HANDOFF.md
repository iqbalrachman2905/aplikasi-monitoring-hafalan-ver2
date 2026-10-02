# 🤝 HANDOFF — Status Pekerjaan & Cara Melanjutkan

> Dokumen ini untuk **dibaca pertama kali** saat melanjutkan pekerjaan di sesi/chat baru.
> Terakhir diperbarui: **2 Oktober 2026** • Versi aplikasi: **4.5.0** • Branch kerja:
> `arena/01a0f627-aplikasi-monitoring-hafalan-ve`. Status PR perlu diverifikasi dari branch ini sebelum review/merge.

---

## 1. Ringkasan 30 detik

Aplikasi monitoring hafalan (HTML/CSS/JS murni + backend Google Apps Script) sudah
melewati dua gelombang perbaikan:

| Gelombang | Fokus | Status |
|---|---|---|
| **v4.3 (Gelombang 0)** | Memutus **kegagalan senyap** & **data dobel**: feedback ustaz yang hilang, celah otorisasi antar-kelompok, idempotensi `requestId`, taksonomi kode error, timeout per aksi, guard klik ganda, trigger malam otomatis, `backend/` tidak lagi terbit ke Pages, CI memverifikasi sebelum deploy | ✅ selesai |
| **v4.4 (Gelombang 1 tahap 1–2)** | **Performa & perawatan data**: indeks sekali baca, kolom minimal, sesi & dashboard via `CacheService`, arsip aman (default uji kering), audit skema/relasi ID baca-saja, uji retensi + paritas Demo | ✅ selesai |
| **v4.5 (Audit PRD & UX mobile)** | Kartu aktivitas terakhir + langkah berikutnya per role, ringkasan 7 hari dan tren bulanan Orang Tua, setoran terakhir Ustaz, matriks kartu di mobile, zoom browser & target sentuh aksesibel | ✅ selesai secara lokal |
| **Berikutnya (tahap 3)** | Jalur ayat & flashcard: `get_ayah_range` (1 fetch banyak ayat), penyusunan kartu paralel, cache ayat di klien; lalu idempotensi tingkat bisnis & rate limit login | ⏳ belum |

**Uji terakhir:** `npm run verify` lulus — 151 pemeriksaan otomatis (API 28, retensi 28, arsip 38, skema 36, dashboard/UX 21); sintaks, pemeriksaan backend GAS, dan paritas juga lulus. `git diff --check` juga lulus. Belum ada uji browser/perangkat atau deployment GAS.

**Catatan cakupan PRD:** ringkasan mingguan kini berupa panel dashboard Ortu dari catatan setoran/murojaah/evaluasi yang tersimpan. Auto-Flag penurunan performa Ustaz masih gap; definisi perbandingan belum disepakati, dan evaluasi acak lintas unit tidak boleh dibandingkan begitu saja.

---

## 2. Perintah wajib sebelum menyentuh kode

```bash
npm run verify   # WAJIB hijau sebelum commit: sintaks + paritas + 151 pemeriksaan otomatis
npm start        # dev server: http://localhost:8080 (bind 0.0.0.0)
```

Akun Mode Demo: `santri1` / `ortu1` / `ustaz1`, password `123456`.
Mode Live butuh deployment Apps Script (lihat `backend/SetupGuide.md`).

---

## 3. Peta berkas penting

| Berkas | Isi yang perlu diketahui |
|---|---|
| `quran-retention-app/backend/Code.gs` | Backend GAS (~3.700 baris). Kunci: `doPost` (router + idempotensi), `withLock`, `withIdempotency`, `readSheet_`, `buildMasterIndex_`, aktivitas terakhir + ringkasan 7 hari Orang Tua, `dashVersion_`, `calculateNextRetentionState`, `archiveOldRows`, audit skema/ID baca-saja, `selfTest`, `healthCheck` |
| `quran-retention-app/js/api.js` | Klien HTTP: `API.ERR` (taksonomi kode error), `API_POLICY` (timeout), `requestId`, retry aman, `handleMockRequest` (Mode Demo) |
| `quran-retention-app/js/mock-data.js` | State Mode Demo + `mockApplyRetention` (harus identik dengan `calculateNextRetentionState`) |
| `quran-retention-app/js/config.js` | `APP_VERSION` + `API_POLICY` + `RETENTION`/`GAMIFICATION`/`COMPETENCY` (cermin sheet `Config`) |
| `quran-retention-app/js/ui.js` | `UI.runOnce()` — pengaman klik ganda untuk semua aksi tulis |
| `tools/check-api-parity.cjs` | 8 kelompok penjaga regresi: action mock↔backend, feedback→Notifikasi, mock default, `setup_database`, idempotensi, performa dashboard, keselamatan arsip, `selfTest` read-only |
| `tools/test-api.cjs` | 28 uji lapisan API (mock, kontrak dashboard termasuk ringkasan pekanan, taksonomi error, anti-data-dobel) |
| `tools/test-retention.cjs` | 28 uji retensi + **paritas backend↔mock** + perhitungan tanggal arsip |
| `tools/test-dashboard-guidance.cjs` | 21 uji kontrak aktivitas/aksi per role, ringkasan pekanan/tren bulanan, & penjaga UX mobile |
| `tools/test-archive.cjs` | 38 uji keselamatan arsip dry-run, verifikasi tulis, cutoff, dan idempotensi |
| `tools/test-schema-audit.cjs` | 36 uji audit skema/relasi ID dan repair header aditif tanpa migrasi |

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

## 5. Checklist SEBELUM merge (aman & cepat)

- [ ] `npm run verify` hijau di mesin sendiri.
- [ ] Verifikasi melalui `gh pr list` apakah ada PR yang benar-benar berasal dari branch sesi ini; jangan menganggap PR #2 terkait branch ini tanpa pemeriksaan.
- [ ] Tab **Actions** di GitHub: job `verify` (check + test) harus **sukses** sebelum job `deploy`.
- [ ] Baca `git diff --stat`; audit ini hanya menambah kontrak baca dashboard dan UX lokal. Tidak ada workbook live yang diubah, tidak ada migrasi ID, dan tidak ada kebijakan target bulanan yang diubah.
- [ ] (Opsional, sangat disarankan) **Buat salinan spreadsheet** sebelum uji Live:
      Google Sheets ➔ *File* ➔ *Make a copy*.

## 6. Checklist SESUDAH merge (wajib, berurutan)

1. **Salin `backend/Code.gs`** ke editor Apps Script (Extensions ➔ Apps Script).
2. **Deploy versi baru:** Deploy ➔ *Manage deployments* ➔ ✏️ Edit ➔ *Version: New version* ➔ Deploy.
   Tanpa ini aplikasi menampilkan peringatan *"backend masih versi lama"* (memang disengaja).
3. Jalankan `selfTest()` hanya pada spreadsheet salinan/dev setelah seluruh efek sampingnya ditinjau; jangan menjalankannya pada workbook live berisi data sampai aman read-only terbukti.
4. Uji Mode Live: login `ustaz1` → buka dashboard (pastikan cepat) → catat 1 setoran →
   cek santri menerima notifikasi; login `ortu1` → tes acak → evaluasi.
5. Cek halaman Pages: `.../backend/Code.gs` harus **404** (bukti folder backend tidak terbit).
6. Bila ada masalah: **rollback mudah** —
   *Frontend:* Pages ➔ Deployments ➔ pilih deployment lama ➔ *Redeploy*.
   *Backend:* Apps Script ➔ *Manage deployments* ➔ Edit ➔ pilih **version lama** ➔ Deploy.
7. Opsional: aktifkan arsip (`ARCHIVE_AKTIF = 1` di sheet `Config`) setelah menjalankan
   `archiveOldRows()` (uji kering) dan memeriksa angkanya.

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
