# 📖 Aplikasi Monitoring Hafalan Al-Qur'an Berbasis Retensi (PRD v4)

Aplikasi web mobile-first modern bertema Islami dengan arsitektur **Spaced Repetition (SM-2-lite)** untuk mengoptimalkan retensi hafalan santri, memudahkan evaluasi 1-klik bagi orang tua, dan memberikan monitoring terpusat bagi ustaz.

---

## 🌟 Fitur Utama

### 1. 👦 Dashboard Santri (Retention & Motivasi)
- **Misi Murojaah Harian:** Pembagian cerdas hafalan menjadi **Sabaq** (hafalan baru hari ini), **Sabqi** (hafalan 1–30 hari), dan **Manzil** (hafalan >30 hari / status perlu perhatian).
- **Konfirmasi 1-Klik:** Catat kelancaran murojaah (*🟢 Lancar / 🟡 Tersendat / 🔴 Lupa*) dengan perhitungan interval otomatis.
- **Flashcard Tebak Kelanjutan Ayat:** Uji potongan ayat Arab interaktif, fitur audio *"Dengar Dulu Baru Uji"*, tombol lewati, dan reward XP instan.
- **Gamifikasi Positif:** Tingkatan Level, XP, Lencana (Badges), dan Streak 🔥 harian berbasis *qualifying activity*.
- **Heatmap 30 Hari:** Visualisasi konsistensi murojaah bulanan.
- **Inbox Notifikasi & Feedback:** Pesan bimbingan dari Ustaz dan doa/apresiasi dari Orang Tua.

### 2. 👨‍👩‍👦 Dashboard Orang Tua (1-Click Random Testing)
- **Rapor Traffic Light:** Indikator visual instan kesehatan hafalan (*🟢 Hijau: Aman, 🟡 Kuning: Perlu Perhatian, 🔴 Merah: Kritis*).
- **Tes Acak Retensi Pintar (1-Klik):** Randomizer memilih ayat yang perlu diuji secara proporsional (memprioritaskan hafalan overdue dan status Merah/Kuning) tanpa Orang Tua perlu mengetik surah/ayat secara manual.
- **Audio Murattal Bantuan:** Pemutar audio qari merdu dengan visualisasi gelombang suara (*waveform*) sebagai referensi saat menguji anak.
- **Evaluasi 1-Klik:** Tombol evaluasi instan (*🟢 Lancar [+5 XP Bonus], 🟡 Tersendat, 🔴 Lupa [Masuk Recovery]*).
- **Kirim Semangat:** Kirim doa dan kata-kata motivasi instan ke dashboard anak.

### 3. 👨‍🏫 Dashboard Ustaz (Group Monitoring & Auto-Flags)
- **Matriks Kelompok & Traffic Light:** Pantau status retensi seluruh santri dalam satu layar.
- **Auto-Flag Engine:** Peringatan otomatis jika ada santri berstatus Merah, streak terputus, atau jadwal review terlewat.
- **Input Setoran Cepat:** Catat setoran hafalan baru dengan nilai mutu (A/B+/B/C), catatan makhraj/tajwid, dan otomatis masuk ke antrean retensi.
- **Target Bulanan:** Tetapkan target surah dan rentang ayat per santri.
- **Feedback & Broadcast:** Kirim koreksi spesifik per santri atau siarkan pesan motivasi ke seluruh santri.

---

## 📂 Struktur Repositori

```
quran-retention-app/
│
├── index.html                  # File antarmuka utama (Single Page Application)
├── README.md                   # Dokumentasi proyek & panduan deploy
├── DEVELOPMENT.md              # Panduan kerja, catatan bug & checklist pengembangan
│
├── css/                        # Modul CSS Terpisah & Terorganisir
│   ├── variables.css           # Palet warna Islami modern, token desain, shadows
│   ├── base.css                # Reset dasar, tipografi teks Arab & Latin
│   ├── layout.css              # Container responsif, header, navigasi bawah
│   ├── components.css          # Cards, buttons, pills traffic light, modals, forms
│   ├── islamic-theme.css       # Motif geometris Islami, arabesque, ornamen emas
│   └── animations.css          # Animasi api streak, shimmer XP, confetti, waveform
│
├── js/                         # Modul Logika JavaScript Terpisah (No Hardcoding)
│   ├── config.js               # Konfigurasi terpusat (API URL GAS, mode data, storage)
│   ├── quran-data.js           # Database 114 Surah, data ayat Arab, terjemahan & audio
│   ├── mock-data.js            # Simulasi state lokal untuk testing instan & offline
│   ├── api.js                  # Klien HTTP (POST text/plain anti-CORS ke GAS)
│   ├── auth.js                 # Session token management & role auth
│   ├── ui.js                   # Toast, audio player, modal, confetti particle effect
│   ├── dashboard-santri.js     # Kontroler misi, flashcard, gamifikasi santri
│   ├── dashboard-ortu.js       # Kontroler rapor, tes acak 1-klik, kirim semangat
│   ├── dashboard-ustaz.js      # Kontroler monitoring kelompok, setoran, auto-flag
│   └── app.js                  # Bootstrap utama & router navigasi peran
│
└── backend/                    # Backend Google Apps Script
    ├── Code.gs                 # Kode Google Apps Script lengkap (14 Sheet & Retention Engine)
    └── SetupGuide.md           # Panduan inisialisasi database otomatis di Google Sheets
```

---

## 💻 Menjalankan di Komputer Lokal

Proyek ini tanpa build step & tanpa dependency. Cukup jalankan dev server statis:

```bash
npm start        # dev server statis, default di http://localhost:8080/
npm run verify   # cek sintaks + paritas mock↔backend + 24 uji lapisan API
```

Atau tanpa Node: `cd quran-retention-app && python -m http.server 8080`.

Halaman login menyediakan akun demo 1-klik. Bila aplikasi sedang di **Mode Live**
dan deployment Google Apps Script tidak dapat dihubungi, akan muncul banner dengan
tombol **“Gunakan Mode Demo”** agar Anda tidak buntu saat mencoba lokal.

> Detail arsitektur, catatan bug, dan checklist pengembangan ada di **`DEVELOPMENT.md`**.

---

## 🚀 Panduan Deploy ke GitHub & GitHub Pages

### 1. Inisialisasi Git & Commit
Jalankan perintah berikut di terminal komputer Anda:
```bash
git init
git add .
git commit -m "feat: inisialisasi aplikasi mutabaah quran retention v4"
```

### 2. Hubungkan ke Repositori GitHub & Push
```bash
git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO_ANDA.git
git branch -M main
git push -u origin main
```

### 3. Aktifkan GitHub Pages via GitHub Actions
Repo ini sudah menyertakan workflow **`.github/workflows/deploy.yml`** yang
men-deploy folder `quran-retention-app/` otomatis setiap push ke `main`.
1. Buka repositori Anda di GitHub.
2. Masuk ke tab **Settings** ➔ **Pages**.
3. Pada bagian *Build and deployment* ➔ *Source*, pilih **GitHub Actions**
   (**bukan** "Deploy from a branch" — agar tidak bentrok dengan workflow).
4. Push ke `main` (atau jalankan manual dari tab **Actions** ➔ *Deploy to GitHub
   Pages* ➔ **Run workflow**).
5. Web app aktif di: `https://USERNAME_ANDA.github.io/NAMA_REPO_ANDA/`

> Pastikan nama repo = `aplikasi-monitoring-hafalan-ver2` (sesuai komentar
> workflow) atau sesuaikan sendiri; URL Pages otomatis mengikuti nama repo.

---

## ⚙️ Menghubungkan Frontend dengan Google Apps Script Anda

File konfigurasi berada di **`js/config.js`**:
```javascript
const APP_CONFIG = {
  // Masukkan Web App URL dari deployment Apps Script Anda di sini:
  API_URL: 'https://script.google.com/macros/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec',
  // 'api'  = Mode Live ke Google Apps Script (default sejak v4.2 — deploy langsung live).
  // 'mock' = simulasi lokal; aktifkan lewat tombol toggle mode di header atau
  //          tombol "Gunakan Mode Demo" di layar login. Tidak ada fallback diam-diam:
  //          bila koneksi gagal, user diberi notifikasi error yang jelas.
  DATA_MODE: 'api',
  ...
};
```

---

## 🔑 Akun Uji Coba Bawaan (Demo)

| Role | Username | Password |
|---|---|---|
| **Santri** | `santri1` | `123456` |
| **Orang Tua** | `ortu1` | `123456` |
| **Ustaz** | `ustaz1` | `123456` |

*Form login juga memvalidasi password (bukan hanya username). Tombol 1-Click Demo Switcher pada halaman login & bilah navigasi tetap tersedia untuk eksplorasi cepat; tombol tersebut otomatis beralih ke Mode Demo agar data spreadsheet asli tidak tercampur data simulasi.*

---

## 🛡️ Perbaikan v4.3 (Keandalan, Keamanan Data & Anti-Fitur-Hilang)

Fokus rilis ini: **memutus lingkaran "putus–nyambung"** (data besar → request lambat → klien menyerah → user klik ulang → data dobel) dan **menghilangkan kegagalan senyap**.

| Area | Perubahan |
|---|---|
| 🐞 Feedback Ustaz | **Bug lama diperbaiki:** `ustazSendFeedback` menulis ke sheet `Feedback` yang tidak pernah dibaca dashboard Santri, sehingga feedback ustaz HILANG di Mode Live (di Mode Demo tampak berhasil). Kini ditulis ke **Notifikasi** (dibaca Santri) **dan** tetap diarsipkan di `Feedback` |
| 🔐 Otorisasi | Cek kelompok (`isSantriInUstazGroup`) kini juga di **setoran**, **target**, dan **feedback**; **broadcast dibatasi ke kelompok** ustaz (santri tanpa `ID_Ustaz` tetap diikutkan agar data migrasi tidak kehilangan pengumuman) |
| 🔁 Anti data dobel | Setiap request membawa **`requestId`**; server menyimpan hasilnya (CacheService, 10 menit) dan mengembalikan hasil yang sama bila request yang sama datang lagi. Percobaan ulang otomatis hanya dilakukan bila backend mendukung idempotency |
| ⏱️ Timeout & pesan error | Batas waktu **per jenis aksi** (baca 15 dtk, tulis 25 dtk, ayat 12 dtk) + **taksonomi kode error** (`E_OFFLINE`, `E_TIMEOUT`, `E_DEPLOY`, `E_CONTRACT`, `E_AUTH`, `E_BUSY`, `E_QUOTA`, `E_UPSTREAM`, `E_VALIDATION`) sehingga "koneksi putus" tidak lagi dipakai untuk semua masalah |
| 🧭 Status belum pasti | Bila aksi tulis timeout, UI **tidak menyuruh mengulang**: modal ditutup, data dimuat ulang untuk memastikan, dan pesan menjelaskan bahwa data mungkin sudah tersimpan |
| 🔒 Konsistensi lock | `ustazSendFeedback`, `ortuSendApresiasi`, `santriSubmitFlashcard` (penulisan paling sering!), dan penulisan cache ayat kini memakai `withLock()` + `flush()`; waktu tunggu lock server (±10 dtk) dibuat **lebih pendek** dari timeout klien |
| ⏰ Trigger malam | `ensureNightlyTrigger()` memasang trigger otomatis saat login sukses (dulu harus manual — bila lupa, `Sessions` tumbuh tanpa batas dan `validateSession` makin lambat). Token kedaluwarsa juga dibersihkan *lazy* saat ditemukan |
| 🩺 `healthCheck()` | Status sistem: versi, zona waktu, trigger terpasang?, `lastNightlyRun`, jumlah baris sheet kunci, plus daftar peringatan |
| 🚫 Setup via HTTP dihapus | Endpoint `setup_database` + `SETUP_SECRET` **dihapus**. `setupInitialDatabase()` hanya dijalankan dari editor Apps Script (fungsi GAS tidak terkspos HTTP) |
| 🧪 Uji otomatis | `npm run verify` = cek sintaks (10 file JS + `Code.gs`) + **uji paritas mock↔backend** + **24 uji lapisan API** (mock, taksonomi error, retry aman). CI menjalankan ini **sebelum** deploy |
| 🙈 Kebocoran | Folder `backend/` (berisi ID spreadsheet & panduan setup) dan dokumen internal **tidak lagi** ikut terbit ke GitHub Pages |
| 👤 Operator | `SPREADSHEET_ID` bisa dipindahkan ke Script Properties (tanpa edit kode); backend melaporkan versinya sehingga frontend bisa memperingatkan **"backend masih versi lama, buat deployment baru"** |
| ⚡ Performa baca | Dashboard Ustaz dari **O(santri × baris)** menjadi **O(baris)**: `Master_Hafalan` dibaca **sekali** lalu diindeks per santri; jumlah `getDataRange()` turun **34 → 3** (kolom minimal) |
| 🗃️ Cache lintas-request | **Validasi sesi** dilayani `CacheService` (dulu membaca seluruh sheet `Sessions` di SETIAP request); dashboard memakai TTL 20–30 dtk dengan **versi data yang naik setiap penulisan**, sehingga setelah menyimpan data selalu langsung terlihat |
| 🚪 Logout lebih ringan | Tidak lagi `deleteRow` (mahal karena menggeser baris) — token ditandai kedaluwarsa + dibuang dari cache, pembersihan fisik tetap oleh batch malam |

> ⚠️ Setelah mengganti `Code.gs`, **wajib buat deployment versi baru** (Deploy ➔ Manage deployments ➔ Edit ➔ New version). Bila belum, aplikasi akan menampilkan peringatan bahwa backend masih versi lama — ini disengaja agar masalah "sudah dibenerin tapi masih error" langsung terlihat.

---

## 🔧 Perbaikan v4.2 (Backend & Sinkronisasi Deploy)

| Area | Perubahan |
|---|---|
| Cache Ayat | **Bug kolom cache diperbaiki** — sebelumnya audio & terjemahan terbaca dari kolom yang salah saat cache hit (player mati, terjemahan selalu kosong) |
| Cache Ayat | Cache kadaluarsa (>30 hari), teks kosong, atau CDN mati kini **diambil ulang otomatis** dari equran.id |
| Keamanan | `setup_database` via HTTP **ditolak total** selama `SETUP_SECRET` masih nilai default — endpoint destruktif tidak bisa terpicu tanpa sengaja |
| Konsistensi | `ustaz_send_broadcast` & `santri_mark_notif_read` kini memakai **LockService + `flush()`** seperti endpoint tulis lain |
| Performa | Cron malam menghapus sesi kedaluwarsa secara **batch** (`deleteRows` per blok), bukan per baris |
| Konfigurasi | Default `DATA_MODE` kini **`'api'`** — setelah deploy, aplikasi langsung terhubung ke GAS (Mode Demo tetap tersedia via toggle) |

> ⚠️ Catatan: nilai mode yang tersimpan di `localStorage` pengguna tetap menang atas
> default baru; default hanya berlaku bagi pengunjung pertama kali.

---

## 🔐 Perbaikan Keamanan & Data (v4.1)

| Area | Perubahan |
|---|---|
| Login | Password wajib benar; tidak ada lagi fallback login tanpa kredensial |
| Backend | Password di-hash dengan **salt acak** (`salt$hash`), hash lama tetap kompatibel |
| Setup DB | `setup_database` lewat HTTP kini memerlukan `SETUP_SECRET` |
| Otorisasi | Ustaz hanya melihat/mengelola kelompoknya; Ortu hanya santri pada `ID_Terkait`; endpoint santri/ortu dibatasi rolenya |
| Anti-XSS | Seluruh nilai dinamis di dashboard di-escape; tombol aksi memakai event delegation (bukan `onclick` inline) |
| Mode Live | Kegagalan API tidak lagi menampilkan data mock sebagai data asli |
| Retensi | Recovery Merah→Kuning butuh **2x Lancar** berturut-turut (kolom `Consecutive_Lancar`) |
| Misi | Tanda "selesai" dihitung **per unit hafalan**, bukan per jenis misi |
| Zona waktu | "Hari ini" memakai `Asia/Jakarta`, bukan UTC (batas hari tidak lagi bergeser pukul 07:00 WIB) |

> Setelah mengganti `Code.gs`, **buat deployment versi baru** di Apps Script agar perbaikan aktif. Lihat `backend/SetupGuide.md`.

---

## 🆕 Baru di v4.1

| Peran | Tambahan |
|---|---|
| 👦 Santri | **Mode Anak** (teks & tombol lebih besar, bahasa sederhana), **Papan Progres Hari Ini** + bintang ⭐ |
| 👨‍🏫 Ustaz | **Peta Potensi Santri** (peringkat), target per **bulan**, panel target berjalan & **usulan target lanjutan otomatis** |
| 👨‍👩‍👦 Ortu | **Peta Kompetensi Ananda** per surah (Mahir/Berkembang/Perlu Latihan), ringkasan skor, & **Kekuatan vs Fokus Latihan** |

Perbaikan penting: aplikasi tidak lagi buntu saat **Mode Live** gagal koneksi
(ada tombol kembali ke Mode Demo), kartu flashcard Mode Live diperbaiki, dan
server lokal resmi tersedia (`npm start`).

---

## 📜 Lisensi & Penggunaan
Dikembangkan untuk mendukung kemajuan pendidikan tahfidz Al-Qur'an dan penguatan retensi hafalan generasi penerus bangsa.
