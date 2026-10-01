# 📘 DEVELOPMENT.md — Panduan & Checklist Pengembangan

Dokumen kerja untuk **Aplikasi Monitoring Hafalan Al-Qur'an Berbasis Retensi**.
Berisi cara menjalankan, peta arsitektur, catatan perbaikan bug, dan checklist
pengembangan (sudah selesai maupun rencana).

> Versi dokumen: 4.4.0 • Terakhir diperbarui: 1 Oktober 2026

---

## 1. Ringkasan Proyek

Aplikasi web **mobile-first** untuk memantau retensi hafalan santri dengan
pendekatan *spaced repetition* (SM-2-lite). Tiga peran:

| Peran | Fokus utama |
|---|---|
| 👦 **Santri** | Misi murojaah harian, flashcard, gamifikasi (XP/level/streak), tampilan ramah anak |
| 👨‍🏫 **Ustaz** | Monitoring kelompok, input setoran, atur target, peta potensi santri |
| 👨‍👩‍👦 **Orang Tua** | Rapor traffic-light, tes acak 1-klik, **peta kompetensi anak**, kirim semangat |

**Stack:** HTML + CSS + JavaScript murni (**tanpa build step**), backend opsional
Google Apps Script + Google Sheets.

---

## 2. Cara Menjalankan

### Prasyarat
- Node.js ≥ 18 (untuk dev server lokal), atau Python 3.
- Tidak perlu `npm install` — proyek ini **tanpa dependency**.

### Menjalankan server lokal
```bash
npm start          # menjalankan tools/serve.cjs (port 8080, bind 0.0.0.0)
npm run verify     # cek sintaks + paritas API + uji lapisan API (wajib sebelum commit)
```
Buka **http://127.0.0.1:8080/**

Alternatif tanpa Node:
```bash
cd quran-retention-app && python -m http.server 8080
```

> ⚠️ Jangan membuka `index.html` lewat `file://` untuk pengujian serius;
> sebagian browser membatasi `localStorage`/fetch pada protokol file.

### Verifikasi sebelum commit
```bash
npm run check   # sintaks 10 file JS + Code.gs + paritas mock↔backend + penjaga performa/arsip
npm test        # 24 uji API + 28 uji retensi/paritas + 33 uji simulasi arsip = 85 uji
npm run verify  # keduanya sekaligus
```

### Akun uji (Mode Demo)
| Peran | Username | Password |
|---|---|---|
| Santri | `santri1` / `santri2` | `123456` |
| Orang Tua | `ortu1` | `123456` |
| Ustaz | `ustaz1` | `123456` |

---

## 3. Peta Arsitektur

```
aplikasi-monitoring-hafalan/
├── package.json                # script start & check (tanpa dependency)
├── tools/
│   ├── serve.cjs               # dev server statis (menyajikan quran-retention-app/)
│   ├── check-syntax.cjs        # parse semua js/*.js
│   └── test-flashcard.cjs      # uji logika flashcard
└── quran-retention-app/
    ├── index.html              # SPA: header, 4 view (login/santri/ortu/ustaz), modal
    ├── DEVELOPMENT.md          # dokumen ini
    ├── README.md               # ringkasan fitur & panduan deploy
    ├── css/                    # variables, base, layout, components, islamic-theme, animations
    ├── js/
    │   ├── config.js           # APP_CONFIG (mode, retensi, kompetensi) + helper tanggal/skor
    │   ├── quran-data.js       # 114 surah + bank ayat + helper audio
    │   ├── mock-data.js        # state demo + mesin retensi sisi klien
    │   ├── api.js              # HTTP client + handler Mode Demo (mirror Code.gs)
    │   ├── auth.js             # session/token + login
    │   ├── ui.js               # toast, modal, audio, confetti, escapeHTML
    │   ├── dashboard-santri.js # misi, flashcard, gamifikasi, Mode Anak
    │   ├── dashboard-ortu.js   # rapor, tes acak, peta kompetensi
    │   ├── dashboard-ustaz.js  # matriks, setoran, target, peta potensi
    │   └── app.js              # bootstrap + router peran + toggle mode
    └── backend/
        ├── Code.gs             # Google Apps Script (14 sheet, retention engine)
        └── SetupGuide.md       # panduan setup spreadsheet
```

### Kontrak data penting
- `ustaz_get_dashboard.santriList[]` → `{ idSantri, nama, retention{hijau,kuning,merah,overdue}, gamifikasi{xp,level,currentStreak}, target{bulan,surah,ayatMulai,ayatAkhir}, targetProgress{covered,total,percent}, lastUnit, flags }`
- `ortu_get_dashboard` → `{ retention{hijau,kuning,merah,total}, gamifikasi, unitList[], recentTests[] }`
- `santri_get_dashboard.missions` → `{ sabaq: Array, sabqi: Array, manzil: Array }` (**`sabaq` berupa array**)
- Skor kompetensi/potensi dihitung dari bobot di `APP_CONFIG.COMPETENCY`
  (Hijau 100 • Kuning 60 • Merah 20) via `appCompetencyLabel()`.

### Mode data
- **Mode Live (default sejak v4.2):** dikirim ke `APP_CONFIG.API_URL` (GAS). **Tidak ada fallback diam-diam**
  ke data demo; kegagalan ditampilkan sebagai error agar data simulasi tidak
  disangka data asli. Mode Demo dapat diaktifkan kapan saja lewat tombol toggle
  di header atau tombol **"Gunakan Mode Demo"** di layar login.
- **Mode Demo:** semua permintaan dilayani `handleMockRequest` di `api.js`.
  Perubahan data (setoran, murojaah, target, riwayat tes) **disimpan ke `localStorage`**
  via `mockSaveState()` (kunci `quran_retention_mock_state`) sehingga bertahan saat
  halaman di-refresh. Untuk mengembalikan ke data contoh: hapus key tersebut
  (DevTools ➔ Application ➔ Local Storage) atau panggil `mockResetState()` di console.

---

## 4. Catatan Perbaikan Bug (v4.1)

| # | Bug | Dampak | Status |
|---|---|---|---|
| 1 | Aplikasi "macet" di Mode Live saat endpoint GAS mati / tidak publik (`302`) → **tidak bisa login** | Blocker total | ✅ Diperbaiki: deteksi respons non-JSON, pesan jelas, banner + tombol **Gunakan Mode Demo** di layar login, validasi nilai mode tersimpan |
| 2 | Tidak ada cara menyalakan server lokal (`npm start` gagal: tanpa `package.json`) | Tidak bisa dijalankan | ✅ Diperbaiki: `package.json` + `tools/serve.cjs` (tanpa dependency, anti path-traversal, auto-ganti port) |
| 3 | `dashboard-santri.js` mendorong `missions.sabaq` (array) sebagai satu unit flashcard | Kartu flashcard gagal disusun di Mode Live | ✅ Diperbaiki: normalisasi array (konsisten dengan `renderMissions`) |
| 4 | `XP menuju Level` bisa negatif bila data XP/level tidak sinkron | Teks aneh di UI | ✅ Diperbaiki dengan `Math.max(0, …)` |
| 5 | `ustaz_save_target` (mock) mengabaikan bulan → target bulan sebelumnya tertimpa | Data target hilang | ✅ Diperbaiki: cocokkan per `idSantri` + `bulan` (sama dengan Code.gs) |
| 6 | Nilai `DATA_MODE` sisa versi lama bisa membuat mode tidak valid | Perilaku tak terduga | ✅ Diperbaiki: hanya `mock`/`api` yang diterima |
| 7 | **Riwayat tes Ortu & target bulanan hilang setiap refresh** (Mode Demo hanya hidup di memori) | Data uji “tidak terekam” | ✅ Diperbaiki: snapshot state demo disimpan ke `localStorage` (`mockSaveState`/`mockLoadState`) & dihidrasi saat halaman dimuat |
| 8 | Menu **atur target** hanya ada di header sehingga sulit ditemukan | Fitur terkesan “tidak ada” | ✅ Diperbaiki: tombol **🎯 Target** di setiap baris matriks santri |
| 9 | Heatmap 30 hari tidak bertambah saat santri murojaah di Mode Demo | Progres terlihat statis | ✅ Diperbaiki: heatmap digabung dengan log murojaah & riwayat tes |
| 10 | Id `interactive-flashcard` dirujuk JS tetapi **tidak ada di HTML** | Reset state flashcard tidak pernah jalan | ✅ Diperbaiki: id ditambahkan pada kartu soal |
| 11 | **Mode Anak** mengubah tampilan Ustaz & Ortu juga | Tampilan dewasa jadi tidak konsisten | ✅ Diperbaiki: CSS Mode Anak dibatasi `body.kid-mode #view-santri` |
| 12 | Audit id JS ↔ HTML & id ganda | Potensi elemen tidak ditemukan | ✅ Bersih setelah perbaikan #10 |
| 13 | **Ayat akhir setoran/target bisa melebihi jumlah ayat surah** (default 20/40) | Setoran & target tidak valid | ✅ Diperbaiki: `syncSurahLimits()` + `validateAyahRange()` di klien, plus `clampAyahToSurah()` di mock |
| 14 | **Backend GAS sering gagal simpan & lambat** | Data gagal dibuat / timeout | ✅ Diperbaiki: cache spreadsheet/sheet/config, batch `setValues`, lock retry + `flush()` (lihat §8) |
| 15 | **`getAyahContent` membaca kolom cache bergeser** — audio terbaca dari kolom `Last_Fetched` (ISO timestamp) dan terjemahan dari kolom kosong | Cache hit = player audio mati & terjemahan selalu kosong | ✅ Diperbaiki: pemetaan kolom `Cache_Ayat` dikoreksi (audio kol. 4, teks Indonesia kol. 6) |
| 16 | **Cache ayat tidak pernah di-refresh** (tidak ada pengecekan umur cache) | Teks/audio lama dipakai selamanya | ✅ Diperbaiki: cache >30 hari, teks kosong, atau CDN mati dianggap miss → fetch ulang ke equran.id |
| 17 | **Fallback `surahNumber = 1`** saat surah tidak dikenali | Surah tak dikenal selalu menampilkan ayat Al-Fatihah | ✅ Diperbaiki: fallback dihapus, permintaan tidak valid ditolak |
| 18 | **`setup_database` via HTTP bisa terpicu dengan kunci default** (jika admin lupa mengganti `SETUP_SECRET`) | 14 sheet bisa terhapus tanpa sengaja | ✅ Diperbaiki: selama kunci masih nilai default, endpoint ditolak total (`SETUP_SECRET_DEFAULT`) |
| 19 | **`ustazSendBroadcast` & `markNotificationRead` tanpa lock** (inkonsisten dengan endpoint tulis lain) | Tulis bisa hilang saat antrean ramai | ✅ Diperbaiki: `LockService` + `flush()` sebelum release |
| 20 | **Cron malam menghapus sesi kedaluwarsa per baris** | Lambat saat sheet Sessions besar | ✅ Diperbaiki: hapus batch `deleteRows` per blok baris kontigu |

---

## 5. Pengembangan per Peran (v4.1)

### 👦 Peran 1 — Santri (UI ramah anak & kemudahan)
- **Mode Anak** (`#btn-toggle-kid-mode`): teks & tombol lebih besar, kontras lebih
  tegas, sudut membulat, dibersihkan untuk mata anak. Preferensi disimpan di
  `localStorage` (`quran_retention_kid_mode`).
- **Papan Progres Hari Ini**: “X dari Y misi selesai”, bar progres, dan **bintang
  ⭐ (0–3)** berdasarkan persentase misi selesai.
- **Bahasa anak**: label misi (“Hafalan baru hari ini ✨”, “Ayo diulang 📚”) dan
  tombol aksi (“▶ Kerjakan”) saat Mode Anak aktif, plus maskot 🧒📖✨.

### 👨‍🏫 Peran 2 — Ustaz (kemudahan target & pengembangan potensi)
- **Peta Potensi Santri** (`#ustaz-potensi-container`): skor 0–100 tiap santri
  (hafalan 60% + istiqomah 25% + XP 15%), diurutkan seperti papan peringkat 🥇🥈🥉.
- **Target lebih mudah**: pemilih **bulan**, panel **target berjalan + hafalan
  terakhir**, dan tombol **“Usulkan Target Lanjutan Otomatis”** yang melanjutkan
  surah hafalan terakhir (pindah surah otomatis bila surah sudah tamat).
- **Kolom “Terakhir”** pada matriks agar Ustaz tahu di ayat berapa anak berhenti.
- **Tombol 🎯 Target pada tiap baris santri** (selain tombol di header) agar pengaturan target langsung terjangkau.
- **Notifikasi Target Bulanan**: baris per santri dengan progres ayat (`covered/total`), status **✅ Tercapai / ⚠️ Mendesak (N hari) / ⏰ Terlewat / 🕒 Berjalan**, diurutkan dari yang paling perlu ditindak.
- Validasi rentang ayat (`mulai ≤ akhir`).

### 👨‍👩‍👦 Peran 3 — Orang Tua (peta kompetensi anak)
- **Peta Kompetensi Ananda** (`#ortu-kompetensi-map`): per surah berisi skor,
  label (**Mahir / Berkembang / Perlu Latihan**), bar, ringkasan unit
  (🟢/🟡/🔴), dan **cakupan surah (%)**.
- **Ringkasan kompetensi keseluruhan** dengan badge skor dan label.
- **Kekuatan Ananda** vs **Fokus Latihan** (3 teratas/terbawah) dengan saran
  tindakan berbahasa orang tua.
- **Filter riwayat tes per bulan**: dropdown bulan yang dibangun otomatis dari
  riwayat, dengan pesan kosong yang jelas untuk bulan tanpa data.

---

## 6. Checklist Pengembangan

### ✅ Selesai
- [x] Autentikasi token + proteksi peran (santri/ortu/ustaz)
- [x] Retention engine SM-2-lite (Sabaq/Sabqi/Manzil) + Recovery Merah→Kuning
- [x] Mode Demo (mock) yang mirror perilaku backend GAS
- [x] Mode Live tanpa fallback diam-diam + pesan error jelas
- [x] Server lokal tanpa dependency (`npm start`)
- [x] Dashboard Santri: misi, konfirmasi murojaah, flashcard, XP/streak/badge, heatmap
- [x] Dashboard Ustaz: matriks, auto-flag, setoran, feedback, broadcast
- [x] Dashboard Ortu: rapor traffic-light, tes acak 1-klik, audio murattal
- [x] Anti-XSS (escapeHTML + event delegation, tanpa `onclick` string dinamis)
- [x] Perbaikan bug v4.1 (lihat §4)
- [x] **Santri:** Mode Anak + papan progres + bahasa ramah anak
- [x] **Ustaz:** peta potensi + target per bulan + usulan target otomatis
- [x] **Ortu:** peta kompetensi + kekuatan/fokus latihan + filter riwayat tes per bulan
- [x] **Ustaz:** notifikasi target bulanan (tercapai/mendesak/terlewat)
- [x] Validasi **ayat akhir sesuai jumlah ayat surah** (modal Setoran & Target) + clamp server-side di mock
- [x] Optimasi workflow backend GAS: cache spreadsheet/sheet/config, batch write, lock retry, `flush()`
- [x] Audit id JS ↔ HTML (tanpa id hilang/ganda)
- [x] **v4.2:** perbaikan kolom cache ayat + stale refetch + guard `SETUP_SECRET` default
- [x] **v4.2:** lock & flush untuk broadcast/notifikasi, batch-delete sesi expired, notifikasi tes ortu di Mode Demo disamakan dengan backend

### 🆕 Perbaikan v4.3 — Keandalan & Anti-Kegagalan-Senyap

| # | Masalah | Dampak | Status |
|---|---|---|---|
| 21 | **Feedback Ustaz tidak sampai ke Santri** — `ustazSendFeedback` menulis ke sheet `Feedback` yang tak pernah dibaca; mock menulis ke `notifications` sehingga Mode Demo tampak berhasil | Fitur komunikasi hilang di Mode Live | ✅ Ditulis ke **Notifikasi** + tetap diarsipkan di `Feedback`; dijaga uji paritas |
| 22 | **Mock `default` = `success:true`** | Aksi yang belum ada tampak berhasil; menutupi bug #21 | ✅ `success:false` + `unknownAction:true` + `console.warn` |
| 23 | **Celah otorisasi:** cek kelompok hanya di `ustazGetSantriDetail` | Ustaz mana pun bisa menulis setoran/target/feedback untuk santri di luar kelompoknya (IDOR) | ✅ Cek kelompok di **setoran, target, feedback**; **broadcast dibatasi kelompok** |
| 24 | **Timeout seragam 8 dtk** padahal lock server bisa 45 dtk | "Putus palsu" hampir pasti saat antrean; user klik ulang | ✅ Timeout per aksi (15/25/12 dtk) + tunggu lock server diturunkan (±10 dtk) |
| 25 | **Satu pesan error untuk semua kegagalan** | Salah diagnosis (timeout dianggap koneksi putus) | ✅ Taksonomi kode error `E_OFFLINE/E_TIMEOUT/E_DEPLOY/E_CONTRACT/E_AUTH/E_FORBIDDEN/E_BUSY/E_UPSTREAM/E_VALIDATION` |
| 26 | **Retry tanpa idempotensi** | Data dobel (XP, baris murojaah/notifikasi) | ✅ `requestId` per niat + `withIdempotency()` (CacheService 10 menit); percobaan ulang otomatis hanya bila backend mendukung |
| 27 | **Status simpan "belum pasti" tidak ditangani** | User mengulang tindakan yang mungkin sudah tersimpan | ✅ `uncertain:true` → modal ditutup + data dimuat ulang + pesan jelas |
| 28 | **Klik ganda pada tombol simpan** | Murojaah/setoran tercatat 2x | ✅ `UI.runOnce()` / `UI.busy` di semua aksi tulis dashboard |
| 29 | **Endpoint tulis tanpa lock** (`ustazSendFeedback`, `ortuSendApresiasi`, `santriSubmitFlashcard`) & cache ayat `appendRow` tanpa lock | Tulisan bisa hilang; baris cache kembar | ✅ `withLock()` + `flush()` + tulis-cache dengan cek ulang |
| 30 | **`installNightlyTrigger()` tidak pernah dipanggil** | `Sessions` tak pernah dibersihkan → `validateSession` makin lambat; downgrade Hijau→Kuning tidak jalan | ✅ `ensureNightlyTrigger()` saat login + lazy cleanup token kedaluwarsa + `healthCheck()` |
| 31 | **Endpoint destruktif `setup_database` via HTTP** | Risiko 14 sheet terhapus | ✅ Dihapus; setup hanya dari editor Apps Script |
| 32 | **`backend/` ikut terbit ke GitHub Pages** | ID spreadsheet & panduan setup publik | ✅ Artifact Pages kini mengecualikan `backend/`, `*.md`, `*.txt` |
| 33 | **CI hanya deploy, tanpa verifikasi** | Regresi lolos ke produksi | ✅ Job `verify`: `npm run check` + `npm test` sebelum deploy |
| 34 | **Tidak bisa memastikan deployment backend terbaru** | "Sudah dibenerin tapi masih error" | ✅ `appVersion` + `capabilities` di setiap respons; frontend memperingatkan backend tertinggal |
| 35 | **Detail error internal dikirim ke klien** (`error.toString()`) | Kebocoran informasi | ✅ Tidak lagi dikirim (aktifkan Script Property `DEBUG_ERRORS=1` bila perlu) |

### 🆕 Perbaikan v4.4 — Performa Baca, Arsip Aman & Diagnostik

| # | Masalah | Dampak | Status |
|---|---|---|---|
| 36 | **Dashboard membaca ulang seluruh sheet per santri** (`ustazGetDashboard` memindai `Master_Hafalan` untuk tiap santri + sekali lagi untuk progres target) | O(santri × baris) → makin lambat seiring bertambahnya santri & setoran | ✅ `buildMasterIndex_()`: satu kali baca lalu diindeks per santri (dipakai Ustaz, Ortu, generator misi, tes acak, detail santri) |
| 37 | **`getDataRange()` 34×** (termasuk seluruh grid kolom kosong) | Kuota & latensi terbuang | ✅ `readSheet_(nama, kolom)` dengan kolom minimal → sisa 3 pemanggilan (hanya sheet `Config`) |
| 38 | **`validateSession` membaca seluruh sheet Sessions di setiap request** (termasuk 3–4 panggilan ayat per kartu flashcard) | Biaya tetap besar per request | ✅ Dilayani `CacheService` (TTL mengikuti masa berlaku token; dihangatkan saat login, dibuang saat logout) + lazy cleanup |
| 39 | **Dashboard selalu dihitung dari nol** | Karena itu dulu terasa lambat saat ramai | ✅ Cache 20–30 dtk + `dashVersion_()` yang naik setiap penulisan berhasil (data setelah menyimpan tetap segar) |
| 40 | **`logoutUser` memakai `deleteRow`** | Mahal (menggeser seluruh baris di bawahnya) | ✅ Token ditandai kedaluwarsa + dibuang dari cache; pembersihan fisik oleh batch malam |
| 41 | **`ARCHIVE_AMBANG_BULAN` tidak pernah dipakai** (PRD §15 menjanjikan arsip; riwayat tumbuh selamanya) | Sheet historis makin besar → pembacaan makin lambat | ✅ `archiveOldRows()` dengan **default uji kering**, verifikasi tulis-baru-hapus, hapus blok dari bawah, dan hanya notifikasi **sudah dibaca** yang diarsipkan |
| 42 | **Tidak ada cara memeriksa kesehatan data** | Duplikat target/unit & sesi menumpuk tidak terdeteksi | ✅ `selfTest()` / `healthCheck()`: trigger, ukuran sheet, header kolom aditif, duplikat, sesi kedaluwarsa, rencana arsip |
| 43 | **Logika retensi diduplikasi tanpa uji** | Bisa "drift" seperti bug feedback v4.2 | ✅ `tools/test-retention.cjs` mengekstrak kedua implementasi dari sumbernya dan membandingkan hasilnya untuk 16 kasus |
| 44 | **CI tidak menjaga performa & keselamatan arsip** | Optimasi/aturan mudah hilang saat pengembangan berikutnya | ✅ Penjaga baru di `check-api-parity.cjs` (8 kelompok pemeriksaan) |
| 45 | **Logika arsip belum pernah diuji pada data nyata** | Salah kolom/hapus dari atas = kehilangan data historis | ✅ `tools/test-archive.cjs` menjalankan fungsi asli `archiveOldRows` di atas **Spreadsheet tiruan** (33 kasus): uji kering tak mengubah sel, verifikasi gagal = penghapusan dibatalkan, notifikasi belum dibaca aman, baris tepat di cutoff tidak ikut |

### 🔜 Rencana Pengembangan Berikutnya (yang akan dikerjakan)

Prioritas dikelompokkan per gelombang kerja. Estimasi relatif: S = kecil,
M = sedang, L = besar.

#### 🌊 Gelombang 1 — Stabilisasi & fondasi data *(sedang dikerjakan)*
- [x] **Uji otomatis lapisan API + paritas mock↔backend** — `npm test`
  (`tools/test-api.cjs`, 24 kasus) & `tools/check-api-parity.cjs` (6 penjaga
  regresi: feedback→Notifikasi, mock default, setup HTTP, idempotency, dll) *(S)*
- [ ] **Uji unit retention engine** — runner `node tools/test-retention.cjs`;
  kasus uji: interval naik/turun, recovery Merah→Kuning 2× Lancar, cap 60 hari,
  streak 1×/hari *(M)*
- [x] **Indeks sekali baca (`buildMasterIndex_`)** — dashboard Ustaz dari
  O(santri × baris) menjadi O(baris): Master_Hafalan dibaca sekali lalu
  dikelompokkan per santri *(M)*
- [x] **Kolom minimal di `readSheet_()`** — jumlah `getDataRange()` turun dari
  34 → 3 (sisanya hanya `Config` yang memang kecil); termasuk di jalur tulis
  (setoran, target, notifikasi, cache ayat) *(S)*
- [x] **Sesi & dashboard berbasis `CacheService`** — `validateSession` dilayani
  cache (TTL mengikuti masa berlaku token), dashboard pakai TTL 20–30 dtk dengan
  versi data yang naik setiap penulisan, jadi tulisan selalu langsung terlihat *(S)*
- [ ] **Idempotensi tingkat bisnis** — upsert murojaah per (santri, jenis, unit,
  tanggal) sebagai pertahanan kedua di luar `requestId` *(M)*
- [ ] **Broadcast & arsip** — tetap N baris (keputusan: skema Notifikasi tidak diubah),
  sehingga penghematannya lewat **arsip/pemangkasan otomatis** riwayat lama *(S)*
- [x] **Uji unit retention engine + paritas Mode Demo** (`tools/test-retention.cjs` — 28 kasus) *(S)*
- [x] **Diagnostik mandiri** `selfTest()` — dijalankan dari editor Apps Script *(S)*
- [x] **Arsip otomatis riwayat lama + simulasi keselamatannya** (`archiveOldRows`, `tools/test-archive.cjs` — 33 kasus) *(M)*
- [ ] **`get_ayah_range`** — 1 fetch untuk banyak ayat + susun flashcard paralel
  (sekarang 3–4 request berurutan per kartu) *(M)*
- [ ] **Idempotensi tingkat bisnis** — upsert murojaah per (santri, jenis, unit, tanggal) *(M)*
- [ ] **Rate limit login** — delay progresif setelah N gagal + sheet `Audit` *(S)*
- [ ] **Arsip otomatis riwayat lama** — pindahkan baris `Hafalan`/`Murojaah`/`Notifikasi`
  lebih tua dari `ARCHIVE_AMBANG_BULAN` ke spreadsheet arsip via cron malam *(M)*
- [ ] **Hardening token & brute-force login** — penundaan progresif setelah N gagal
  login per username + pembersihan sesi per user *(S)*
- [ ] **Lint & format otomatis** (tanpa dependency runtime; cek Konsistensi id JS↔HTML di `npm run check`)*(S)*

#### 🌊 Gelombang 2 — Fitur peran (nilai terbesar untuk pengguna)
- [ ] **Ustaz: ekspor laporan PDF/WhatsApp per santri** — ringkasan retensi + progres
  target yang bisa dibagikan ke grup WhatsApp kelompok *(M)*
- [ ] **Ustaz: target per juz + checklist capaian otomatis** — peta juz 1–30 dari
  `Master_Hafalan`, persentase tamat per juz *(M)*
- [ ] **Ortu: grafik tren kompetensi antar bulan** — visualisasi riwayat skor dari
  `Riwayat_Tes` (sparkline, tanpa library eksternal) *(S)*
- [ ] **Ortu: mode banding antar anak** — dukungan `ID_Terkait` multi-santri untuk
  keluarga dengan >1 hafizh *(S)*
- [ ] **Santri: mode "cerita/audio-first"** untuk anak pra-literasi — misi berbasis
  dengar-dan-tebak tanpa teks Arab *(L)*
- [ ] **Santri: pengingat murojaah** — PWA + Service Worker dengan jadwal harian
  yang bisa dipilih sendiri *(M)*

#### 🌊 Gelombang 3 — Skala & infrastruktur
- [ ] **PWA penuh (installable + offline cache shell)** — manifest, service worker,
  halaman fallback offline *(M)*
- [ ] **Notifikasi WhatsApp/email terjadwal** — ringkasan mingguan ke ortu/ustaz via
  webhook/API eksternal (dipicu cron GAS) *(M)*
- [ ] **Migrasi opsional ke backend lain (Supabase/Firebase)** sebagai alternatif GAS
  bila jumlah santri & tulis harian sudah melebihi kuota nyaman *(L)*
- [ ] **Panel admin multi-ustaz** — pembagian kelompok, statistik lintas kelompok *(L)*

> Konvensi: setiap item yang dikerjakan dipindahkan ke checklist ✅ Selesai beserta
> catatan perubahan di §4, dan nomor versi `APP_VERSION` di `js/config.js` dinaikkan.

---

## 7. Catatan Backend (Google Apps Script)

- Setelah mengubah `backend/Code.gs`, **buat deployment versi baru** di Apps Script
  agar perubahan aktif (Deploy ➔ Manage deployments ➔ Edit ➔ New version).
- Pastikan **Who has access = Anyone** — inilah penyebab respons `302` yang membuat
  Mode Live gagal login.
- Perubahan v4.1 pada `Code.gs`: `ustazGetDashboard` kini mengirim `lastUnit`
  (surah/ayat terakhir) untuk fitur usulan target.
- Perubahan v4.2 pada `Code.gs`:
  - `getAyahContent`: pemetaan kolom `Cache_Ayat` diperbaiki, cache >30 hari /
    teks kosong / CDN mati di-fetch ulang, fallback surah Al-Fatihah dihapus.
  - Guard `SETUP_SECRET_DEFAULT`: setup via HTTP ditolak selama kunci masih default.
  - `ustazSendBroadcast` & `markNotificationRead` memakai lock + `flush()`;
    cron malam menghapus sesi expired secara batch.
- Lihat `backend/SetupGuide.md` untuk langkah setup 14 sheet + akun demo.

---

## 8. Evaluasi Workflow Backend Google Apps Script

### Diagnosis penyebab lambat & “gagal create data”
| # | Akar masalah | Dampak |
|---|---|---|
| 1 | `getSpreadsheet()` memanggil `SpreadsheetApp.openById()` **setiap** `getSheet()` — 6+ kali per request | Setiap panggilan = round-trip mahal → latensi tinggi & timeout |
| 2 | `getConfigMap()` membaca seluruh sheet `Config` berulang kali per request | Overhead I/O ganda |
| 3 | `appendRow()` di dalam loop (broadcast = 1 write/santri; badge = 1 write/badge) | N write terpisah → sangat lambat, rawan timeout |
| 4 | `lock.waitLock(5000)` tanpa retry; `releaseLock()` tanpa `flush()` | Sering “Server sibuk”; request berikutnya bisa membaca data lama |
| 5 | Sheet yang tidak ada dibuat otomatis secara diam-diam | Data terlihat “hilang” (ditulis ke sheet kosong) |

### Perbaikan yang diterapkan
- **Cache per-eksekusi**: `__ssCache`, `__sheetCache`, `__configCache` → 1 kali buka spreadsheet/config per request, bukan berulang.
- **Batch write**: `setValues()` sekali untuk broadcast ke semua santri dan untuk seluruh badge sekaligus.
- **`acquireLock()`**: retry 3× dengan backoff (timeout 15s) menggantikan `waitLock(5000)` sekali coba.
- **`SpreadsheetApp.flush()`** di setiap `finally` ber-lock → tulisan pasti ter-commit sebelum lock dilepas.
- **Log sheet yang dibuat otomatis** agar penyebab data “hilang” mudah ditelusuri.
- **Validasi ayat** di klien + clamp di mock sehingga data tidak pernah di luar rentang surah.

### Rekomendasi operasional (agar makin stabil)
1. **Selalu buat deployment versi baru** setelah mengubah `Code.gs` (kalau tidak, kode lama tetap dipakai).
2. Pastikan akses Web App = **Anyone**, `Execute as: Me`.
3. **Jalankan `setupInitialDatabase()` dari editor Apps Script**, bukan lewat HTTP, agar tidak ada sheet yang dibuat terpisah.
4. Hindari **broadcast/input setoran massal bersamaan** dari banyak perangkat; lock sudah di-retry, tetapi antrean tulis tetap terbatas di GAS.
5. Aktifkan **`installNightlyTrigger()`** agar perhitungan retensi berat berjalan malam, bukan saat orang tua menguji.
6. Pantau **Executions** di Apps Script untuk error berulang (`Service Spreadsheets failed` = transient; retry/backoff membantu).
7. Bila data sudah besar, pertimbangkan arsip (konstanta `ARCHIVE_AMBANG_BULAN`) dan alternatif backend (Supabase/Firebase) untuk penskalaan.

---

## 9. Alur Verifikasi yang Disarankan

1. `npm run check` → semua file JS valid.
2. `npm start` → buka `http://localhost:8080/` (set `HOST=127.0.0.1` bila ingin lokal saja).
3. Login `santri1`/`123456` → cek misi, progres, flashcard, Mode Anak.
4. Login `ustaz1`/`123456` → cek peta potensi, usulan target, simpan target.
5. Login `ortu1`/`123456` → cek peta kompetensi, tes acak, kirim semangat (cek juga
   **inbox santri**: notifikasi “Hasil Tes Ortu” harus muncul).
6. Uji Mode Live (tombol header) → pastikan kegagalan koneksi muncul sebagai
   pesan jelas **dan** tombol “Gunakan Mode Demo” bekerja.
7. Setelah deploy GAS versi baru: login Mode Live dengan akun spreadsheet →
   buka modal Tes Acak Ortu → **audio & terjemahan ayat harus tampil** (verifikasi
   perbaikan kolom `Cache_Ayat` v4.2; ayat yang sebelumnya ter-cache rusak akan
   di-fetch ulang otomatis).
