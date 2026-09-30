/**
 * ============================================================================
 * QURAN RETENTION APP - CONFIGURATION
 * ============================================================================
 * Konfigurasi terpusat agar tidak ada hardcoding URL atau parameter di logic file.
 */

const APP_CONFIG = {
  // URL Google Apps Script Web App Endpoint
  API_URL: 'https://script.google.com/macros/s/AKfycbyhdkjQedmViYyllKh6MSe2h_mWqcFDp08zS5xzy3BQ1YA-FqWTpZM-0DDzAb22YBoTEg/exec',

  // Mode: 'mock' (simulasi lokal cepat / offline) | 'api' (live Google Apps Script)
  // Default 'api': aplikasi dipakai dengan deployment GAS yang sudah aktif.
  // Bila ingin mencoba tanpa backend, ganti ke 'mock' atau klik tombol toggle
  // mode di header / tombol "Gunakan Mode Demo" di layar login.
  DATA_MODE: 'api',

  // Versi Aplikasi (WAJIB sama dengan APP_VERSION di backend/Code.gs)
  APP_VERSION: '4.3.0',

  // Kebijakan batas waktu & pengulangan request.
  // Penting: waktu tunggu KLIEN harus LEBIH PANJANG dari waktu tunggu lock di
  // server (LOCK_ATTEMPTS x LOCK_WAIT_MS = ~10 dtk) agar pesan "server sibuk"
  // dari server sempat sampai — bukan berubah menjadi "koneksi putus" palsu.
  API_POLICY: {
    TIMEOUT_READ_MS: 15000,   // dashboard, daftar misi, dll
    TIMEOUT_WRITE_MS: 25000,  // setoran, murojaah, target, broadcast
    TIMEOUT_AYAH_MS: 12000,   // get_ayah_content (bisa memicu fetch provider)
    RETRY_ON_TIMEOUT_WRITE: 1, // jumlah percobaan ulang otomatis (aman: idempotency key)
    RETRY_ON_TIMEOUT_READ: 1
  },

  // Keys untuk Local Storage
  STORAGE_KEYS: {
    AUTH_TOKEN: 'quran_retention_token',
    USER_DATA: 'quran_retention_user',
    DATA_MODE: 'quran_retention_data_mode',
    KID_MODE: 'quran_retention_kid_mode'
  },

  // Parameter Gamifikasi & Retensi Default (Client-side mirror)
  GAMIFICATION: {
    XP_SABAQ: 5,
    XP_SABQI: 8,
    XP_MANZIL: 12,
    XP_BONUS_LANCAR: 5,
    XP_BONUS_RECOVERY: 15,
    LEVEL_XP_STEP: 100
  },

  // Parameter Retention Engine (SM-2-lite) — mirror sheet Config di Code.gs
  // agar Mode Demo berperilaku identik dengan Mode Live.
  RETENTION: {
    AMBANG_SABQI_HARI: 30,
    INTERVAL_MULTIPLIER_LANCAR: 1.5,
    INTERVAL_MULTIPLIER_TERSENDAT: 0.5,
    INTERVAL_CAP_MAKS_HARI: 60,
    INTERVAL_LUPA_HARI: 1,
    RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN: 2
  },

  // Bobot untuk "Peta Kompetensi" (Ortu) & "Peta Potensi" (Ustaz).
  // Skor 0-100: Hijau dianggap hafalan sehat (100), Kuning sedang (60),
  // Merah perlu perhatian (20). Dipakai konsisten di mode Demo & Live.
  COMPETENCY: {
    SKOR_HIJAU: 100,
    SKOR_KUNING: 60,
    SKOR_MERAH: 20,
    AMBANG_MAHIR: 80,
    AMBANG_BERKEMBANG: 50
  }
};

/**
 * Tanggal "hari ini" mengikuti zona waktu LOKAL perangkat (bukan UTC),
 * sehingga misi harian, streak, dan heatmap tidak berpindah hari pada 07:00 WIB.
 * @param {Date|string|number} [date] sumber tanggal (default: sekarang)
 * @returns {string} YYYY-MM-DD
 */
function appTodayStr(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

/**
 * Tanggal YYYY-MM-DD sejumlah hari dari hari ini (boleh negatif).
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
function appDateStrAfter(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return appTodayStr(d);
}

/**
 * Label kompetensi dari skor 0-100 (dipakai Peta Kompetensi Ortu &
 * Peta Potensi Ustaz) agar bahasa konsisten di seluruh aplikasi.
 * @param {number} score 0-100
 * @returns {{label: string, tone: string}} tone: 'green' | 'yellow' | 'red'
 */
function appCompetencyLabel(score) {
  const cfg = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.COMPETENCY) || {};
  const mahir = Number(cfg.AMBANG_MAHIR || 80);
  const berkembang = Number(cfg.AMBANG_BERKEMBANG || 50);
  const s = Number(score) || 0;
  if (s >= mahir) return { label: 'Mahir', tone: 'green' };
  if (s >= berkembang) return { label: 'Berkembang', tone: 'yellow' };
  return { label: 'Perlu Latihan', tone: 'red' };
}
