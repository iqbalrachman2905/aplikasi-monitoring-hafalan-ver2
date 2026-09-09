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

### 3. Aktifkan GitHub Pages (Gratis)
1. Buka repositori Anda di GitHub.
2. Masuk ke tab **Settings** ➔ **Pages**.
3. Pada bagian *Build and deployment* ➔ *Source*, pilih **Deploy from a branch**.
4. Pilih branch **`main`** dan folder **`/ (root)`**, lalu klik **Save**.
5. Tunggu 1–2 menit, web app Anda akan aktif di URL:
   `https://USERNAME_ANDA.github.io/NAMA_REPO_ANDA/`

---

## ⚙️ Menghubungkan Frontend dengan Google Apps Script Anda

File konfigurasi berada di **`js/config.js`**:
```javascript
const APP_CONFIG = {
  // Masukkan Web App URL dari deployment Apps Script Anda di sini:
  API_URL: 'https://script.google.com/macros/s/AKfycbxoXWMzXhQddeJsEJWy-zTFG8z8qa_5UGUGyL20_rdbSSKAXySdVLb9quqUt2CTaO61/exec',
  DATA_MODE: 'auto', // 'auto' mencoba API GAS, jika offline fallback ke mock interaktif
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

*Tersedia juga tombol 1-Click Demo Switcher pada halaman login dan bilah navigasi.*

---

## 📜 Lisensi & Penggunaan
Dikembangkan untuk mendukung kemajuan pendidikan tahfidz Al-Qur'an dan penguatan retensi hafalan generasi penerus bangsa.
