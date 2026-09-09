/**
 * ============================================================================
 * QURAN RETENTION APP - CONFIGURATION
 * ============================================================================
 * Konfigurasi terpusat agar tidak ada hardcoding URL atau parameter di logic file.
 */

const APP_CONFIG = {
  // URL Google Apps Script Web App Endpoint
  API_URL: 'https://script.google.com/macros/s/AKfycbxoXWMzXhQddeJsEJWy-zTFG8z8qa_5UGUGyL20_rdbSSKAXySdVLb9quqUt2CTaO61/exec',

  // Mode: 'mock' (simulasi lokal cepat / offline) | 'api' (live Google Apps Script)
  // Default 'mock' agar preview instan & lancar saat pertama kali dicoba tanpa menunggu setup spreadsheet
  DATA_MODE: 'mock',

  // Versi Aplikasi
  APP_VERSION: '4.0.0',

  // Keys untuk Local Storage
  STORAGE_KEYS: {
    AUTH_TOKEN: 'quran_retention_token',
    USER_DATA: 'quran_retention_user',
    DATA_MODE: 'quran_retention_data_mode'
  },

  // Parameter Gamifikasi & Retensi Default (Client-side mirror)
  GAMIFICATION: {
    XP_SABAQ: 5,
    XP_SABQI: 8,
    XP_MANZIL: 12,
    XP_BONUS_LANCAR: 5,
    XP_BONUS_RECOVERY: 15,
    LEVEL_XP_STEP: 100
  }
};
