# 📖 Aplikasi Monitoring Hafalan Al-Qur'an — Ver 2

Aplikasi web mobile-first bertema Islami dengan **Retention Engine (SM-2-lite / Spaced Repetition)**
untuk santri, orang tua, dan ustaz. Detail PRD: `uploads/PRD-Aplikasi-Hafalan-Quran-v4.md`.

🌐 **Live demo (GitHub Pages):** https://iqbalrachman2905.github.io/aplikasi-monitoring-hafalan-ver2/

## 📂 Struktur Repo

```
.
├── quran-retention-app/   # <-- aplikasi frontend (folder yang di-deploy ke Pages)
│   ├── index.html
│   ├── css/               # modul CSS (variables, base, layout, components, ...)
│   ├── js/                # modul JS (config, api, auth, dashboard-*, ...)
│   └── backend/           # Google Apps Script (Code.gs + SetupGuide.md)
├── uploads/               # dokumen PRD
└── .github/workflows/     # workflow Deploy to GitHub Pages
```

## 🚀 Deploy / Go-Live

Setiap push ke branch `main` otomatis di-deploy ke GitHub Pages via
`.github/workflows/deploy.yml` (source: **GitHub Actions**, folder `quran-retention-app/`).

Syarat satu kali di GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

## 🔑 Akun Demo

| Role       | Username | Password |
| ---------- | -------- | -------- |
| Santri     | `santri1` | `123456` |
| Orang Tua  | `ortu1`  | `123456` |
| Ustaz      | `ustaz1` | `123456` |

Mode default: `mock` (demo offline instan). Untuk data live dari Google Sheets,
atur `API_URL` & `DATA_MODE` di `quran-retention-app/js/config.js` —
panduan backend ada di `quran-retention-app/backend/SetupGuide.md`.
