/**
 * ============================================================================
 * APLIKASI MONITORING HAFALAN AL-QUR'AN BERBASIS RETENSI (PRD v4)
 * Google Apps Script Backend (Code.gs)
 * ============================================================================
 * Fitur Utama:
 * 1. Token-Based Auth & Session Management (SHA-256 Hash, Role Protection)
 * 2. Adaptive Retention Engine (SM-2-lite: Sabaq/Sabqi/Manzil, Recovery Policy)
 * 3. Daily Mission Generator (Sabaq, Sabqi, Manzil)
 * 4. Role Dashboards: Ustaz (Monitoring, Setoran, Target), Santri (Misi, Flashcard, Gamifikasi), Ortu (Rapor, Tes Acak 1-Klik)
 * 5. Concurrency Protection (LockService) & Batch I/O for High Performance
 * 6. Quran Ayah & Audio Cache (Cache_Ayat)
 * ============================================================================
 */

// Versi backend. WAJIB dinaikkan bersamaan dengan APP_VERSION di js/config.js
// agar frontend bisa mendeteksi "backend tertinggal" (deployment versi lama).
const APP_VERSION = '4.5.0';

// ID Spreadsheet default. TIDAK perlu diedit lagi di kode: nilai ini hanya
// dipakai bila Script Property 'SPREADSHEET_ID' belum diisi.
// Cara mengisi (disarankan): Apps Script > Project Settings > Script Properties
// > tambah properti SPREADSHEET_ID, lalu boleh ganti spreadsheet tanpa edit kode.
const SPREADSHEET_ID_DEFAULT = '16Bg7EG0NXQZkELkzB1mb8RorIv8ruLVgi6ZiGEDLMLU';
const SPREADSHEET_ID = readScriptProperty_('SPREADSHEET_ID') || SPREADSHEET_ID_DEFAULT;

// Zona waktu aplikasi: dipakai untuk "hari ini", streak, dan jadwal review.
// Menghindari bug batas hari (sebelumnya MTor UTC membuat hari berganti 07:00 WIB).
const APP_TIMEZONE = 'Asia/Jakarta';

// Batas tunggu lock. TOTAL tunggu server HARUS lebih pendek dari timeout klien
// (lihat APP_CONFIG.API_POLICY di js/config.js), supaya server menyerah lebih
// dulu dan user menerima pesan E_BUSY — bukan "koneksi putus" palsu.
const LOCK_WAIT_MS = 5000;   // per percobaan
const LOCK_ATTEMPTS = 2;     // 2 x 5 dtk = maksimal ~10 dtk

// Berapa lama hasil sebuah request tulis disimpan untuk mencegah dobEL saat
// klien mengirim ulang request yang sama (idempotency key).
const IDEMPOTENCY_TTL_SEC = 600;

// Penanda versi skema/trigger yang sudah dipasang.
const PROP_TRIGGER_FLAG = 'trigger_installed_v1';
const PROP_LAST_NIGHTLY_RUN = 'SYNC_STATE_LAST_NIGHTLY_RUN';

/**
 * Capability yang diiklankan ke frontend pada SETIAP respons. Klien memakainya
 * untuk tahu fitur backend mana yang tersedia (mis. idempotency) sehingga
 * perilaku aman-nya tidak menebak-nebak.
 */
const SERVER_CAPABILITIES = {
  appVersion: APP_VERSION,
  idempotency: true,
  errorCodes: true,
  requestId: true,
  feedbackToNotif: true,
  notifMarkRead: true,
  lazySessionCleanup: true,
  selfInstallTrigger: true
};

/**
 * Skema sheet inti: dipakai oleh audit baca-saja dan repair header aditif.
 * Audit dapat membaca sel data hanya untuk menghitung baris yang sepenuhnya
 * kosong; nilainya tidak pernah dimasukkan ke laporan. Urutan header ini harus
 * sesuai dengan fungsi yang membaca data berdasarkan indeks kolom.
 */
const DATABASE_SHEET_SCHEMA = [
  { name: 'Config', headers: ['Key', 'Value', 'Description'], phase: 'Mesin internal', purpose: 'Parameter retention, gamifikasi, sesi, dan arsip. Header-only berarti aplikasi memakai nilai default dari backend.' },
  { name: 'Users', headers: ['ID', 'Username', 'Password_Hash', 'Role', 'Nama', 'ID_Terkait'], phase: 'Fondasi role', purpose: 'Akun dan relasi peran Ustaz, Santri, serta Orang Tua. Tanpa baris pengguna, tidak ada akun live yang dapat login.' },
  { name: 'Santri', headers: ['ID_Santri', 'Nama', 'ID_Ustaz', 'Status'], phase: 'HAFAL / monitoring', purpose: 'Daftar santri dan relasi bimbingan ke Ustaz.' },
  { name: 'Target', headers: ['ID_Target', 'Bulan', 'ID_Santri', 'Target_Surah', 'Ayat_Mulai', 'Ayat_Akhir'], phase: 'LANJUT', purpose: 'Rencana hafalan bulanan yang ditetapkan Ustaz sebagai tindak lanjut/tujuan berikutnya.' },
  { name: 'Master_Hafalan', headers: ['ID_Master', 'ID_Santri', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir', 'Tgl_Mulai', 'Status', 'Retention_Status_Cache', 'Next_Review_Cache', 'Current_Interval_Hari', 'Consecutive_Lupa', 'Consecutive_Lancar'], phase: 'HAFAL → JAGA → PUTUSKAN → LANJUT', purpose: 'Unit hafalan dan state retensi/jadwal review untuk memutuskan apakah unit dijaga, diuji ulang, atau siap dilanjutkan; histori tes tetap tersimpan di Riwayat_Tes.' },
  { name: 'Hafalan', headers: ['ID_Hafalan', 'Tgl', 'ID_Santri', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir', 'Nilai', 'Catatan', 'ID_Target', 'Timestamp'], phase: 'HAFAL', purpose: 'Fakta dan histori setoran, nilai, serta catatan Ustaz.' },
  { name: 'Murojaah', headers: ['ID_Murojaah', 'Tgl', 'ID_Santri', 'Jenis_Misi', 'Detail', 'Pelapor', 'Timestamp'], phase: 'JAGA', purpose: 'Log aktivitas murojaah harian; saat ini header tidak menyediakan kolom kualitas hasil.' },
  { name: 'Riwayat_Tes', headers: ['ID_Tes', 'Tgl', 'ID_Santri', 'ID_Master', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir', 'Kualitas', 'Pelapor'], phase: 'UJI → PUTUSKAN', purpose: 'Histori hasil tes hafalan, termasuk tes Orang Tua; hasil terbaru memicu pembaruan state di Master_Hafalan.' },
  { name: 'Gamifikasi', headers: ['ID_Santri', 'XP_Total', 'Level', 'Streak_Saat_Ini', 'Streak_Terpanjang', 'Last_Qualifying_Date'], phase: 'Pendukung JAGA', purpose: 'Ringkasan XP, level, dan konsistensi; bukan sumber ukuran kualitas retensi.' },
  { name: 'Badge', headers: ['ID_Badge', 'ID_Santri', 'Nama_Badge', 'Tgl_Diperoleh'], phase: 'Pendukung perjalanan', purpose: 'Riwayat lencana yang didapat santri.' },
  { name: 'Notifikasi', headers: ['ID_Notif', 'ID_User', 'Tipe', 'Pesan', 'Tgl_Kirim', 'Status_Baca'], phase: 'Komunikasi lintas tahap', purpose: 'Pesan, feedback, apresiasi, dan pemberitahuan hasil tes.' },
  { name: 'Feedback', headers: ['ID_Feedback', 'ID_Santri', 'ID_Hafalan', 'ID_Ustaz', 'Pesan', 'Tgl', 'Status_Baca'], phase: 'Bimbingan Ustaz', purpose: 'Arsip feedback pedagogis Ustaz yang terkait dengan santri/setoran.' },
  { name: 'Sessions', headers: ['Token', 'ID_User', 'Role', 'Expiry', 'ID_Terkait', 'Nama'], phase: 'Fondasi akses', purpose: 'Sesi login aktif; kosong dapat normal setelah logout atau pembersihan sesi.' },
  { name: 'Cache_Ayat', headers: ['Surah', 'Ayat', 'Teks_Arab', 'Audio_URL', 'Last_Fetched', 'Teks_Indonesia'], phase: 'Pendukung UJI/latihan', purpose: 'Cache teks, audio, dan terjemahan ayat dari provider eksternal; data cache dapat diisi ulang.' }
];

/** Baca Script Property dengan aman (PropertiesService bisa gagal di beberapa konteks). */
function readScriptProperty_(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (e) {
    return '';
  }
}

/** Tulis Script Property dengan aman. */
function writeScriptProperty_(key, value) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, String(value));
    return true;
  } catch (e) {
    Logger.log('gagal menulis properti ' + key + ': ' + e);
    return false;
  }
}

// ============================================================================
// ENTRY POINTS (doGet & doPost)
// ============================================================================

function doGet(e) {
  // Berguna sebagai health check sederhana: versi backend + capability.
  return responseJSON({
    success: true,
    status: 'API Aktif',
    nama: 'Quran Retention Engine API',
    versi: APP_VERSION,
    capabilities: SERVER_CAPABILITIES,
    timestamp: new Date().toISOString()
  });
}

/**
 * Jalur idempotensi: bila klien mengirim requestId yang sudah pernah diproses,
 * kembalikan hasil yang sama TANPA mengeksekusi ulang. Ini yang mencegah data
 * dobel saat request sebenarnya sukses tetapi klien menganggapnya timeout.
 *
 * @param {object} request body JSON dari klien (punya requestId & action)
 * @param {function(): object} work fungsi yang menghasilkan respons JSON
 */
function withIdempotency(request, work) {
  const requestId = request && request.requestId ? String(request.requestId) : '';
  if (!requestId) return work();

  let cache = null;
  try {
    cache = CacheService.getScriptCache();
  } catch (e) {
    return work(); // cache tidak tersedia -> jalankan normal
  }

  const cacheKey = 'idem:' + requestId;
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      parsed.duplicate = true; // penanda: hasil diambil dari pemanggilan sebelumnya
      return parsed;
    }
  } catch (e) {
    Logger.log('idempotency read gagal: ' + e);
  }

  const result = work();

  // Hanya simpan hasil yang benar-benar sukses, supaya request yang gagal
  // (mis. E_BUSY) tetap bisa dicoba ulang oleh klien.
  try {
    if (result && result.success) {
      cache.put(cacheKey, JSON.stringify(result), IDEMPOTENCY_TTL_SEC);
    }
  } catch (e) {
    Logger.log('idempotency write gagal: ' + e);
  }

  return result;
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ success: false, code: 'E_VALIDATION', message: 'Request payload kosong' });
    }

    const request = JSON.parse(e.postData.contents);
    const action = request.action;

    // Public / Non-token action
    if (action === 'login') {
      const loginResult = loginUser(request.username, request.password);
      // Perawatan ringan setelah login sukses: pastikan trigger malam terpasang.
      if (loginResult && loginResult.success) ensureNightlyTrigger();
      return responseJSON(loginResult);
    }
    // CATATAN: endpoint 'setup_database' lewat HTTP sudah DIHAPUS (v4.3).
    // setupInitialDatabase() menghapus isi 14 sheet; jalankan HANYA dari editor
    // Apps Script. Fungsi GAS tidak terkspos via HTTP, jadi ini aman.

    // Token-required actions
    const token = request.token;
    if (!token) {
      return responseJSON({ success: false, code: 'E_AUTH', message: 'Token sesi diperlukan' });
    }

    const session = validateSession(token);
    if (!session) {
      return responseJSON({ success: false, code: 'E_AUTH', unauthorized: true, message: 'Sesi tidak valid atau telah kedaluwarsa' });
    }

    // Route actions
    switch (action) {
      case 'validate_session':
        return responseJSON({ success: true, user: session });

      case 'logout':
        return responseJSON(logoutUser(token));

      case 'get_profile':
        return responseJSON(getUserProfile(session));

      case 'health_check':
        return responseJSON(healthCheck(session));

      // --- USTAZ ENDPOINTS ---
      case 'ustaz_get_dashboard':
        return responseJSON(ustazGetDashboard(session));

      case 'ustaz_get_santri_detail':
        return responseJSON(ustazGetSantriDetail(session, request.santriId));

      case 'ustaz_add_setoran':
        return responseJSON(withIdempotency(request, function () { return ustazAddSetoran(session, request.data); }));

      case 'ustaz_save_target':
        return responseJSON(withIdempotency(request, function () { return ustazSaveTarget(session, request.data); }));

      case 'ustaz_send_feedback':
        return responseJSON(withIdempotency(request, function () { return ustazSendFeedback(session, request.data); }));

      case 'ustaz_send_broadcast':
        return responseJSON(withIdempotency(request, function () { return ustazSendBroadcast(session, request.data); }));

      // --- SANTRI ENDPOINTS ---
      case 'santri_get_dashboard':
        return responseJSON(santriGetDashboard(session));

      case 'santri_confirm_murojaah':
        return responseJSON(withIdempotency(request, function () { return santriConfirmMurojaah(session, request.data); }));

      case 'santri_submit_flashcard_test':
        return responseJSON(withIdempotency(request, function () { return santriSubmitFlashcard(session, request.data); }));

      case 'santri_mark_notif_read':
        return responseJSON(withIdempotency(request, function () { return markNotificationRead(session, request.notifId); }));

      // --- ORTU ENDPOINTS ---
      case 'ortu_get_dashboard':
        return responseJSON(ortuGetDashboard(session));

      case 'ortu_get_random_test':
        return responseJSON(ortuGetRandomTest(session));

      case 'ortu_submit_test_result':
        return responseJSON(withIdempotency(request, function () { return ortuSubmitTestResult(session, request.data); }));

      case 'ortu_send_apresiasi':
        return responseJSON(withIdempotency(request, function () { return ortuSendApresiasi(session, request.data); }));

      // --- QURAN CACHE ENDPOINTS ---
      case 'get_ayah_content':
        return responseJSON(getAyahContent(request.surah, request.ayah));

      default:
        return responseJSON({ success: false, code: 'E_VALIDATION', message: 'Action tidak ditemukan: ' + action });
    }
  } catch (error) {
    // Detail teknis TIDAK dikirim ke klien (mencegah kebocoran internal);
    // aktifkan Script Property DEBUG_ERRORS=1 bila sedang menelusuri masalah.
    Logger.log('doPost error: ' + error + '\n' + (error && error.stack ? error.stack : ''));
    const debug = readScriptProperty_('DEBUG_ERRORS') === '1';
    return responseJSON({
      success: false,
      code: 'E_UNKNOWN',
      message: 'Terjadi kesalahan pada server. Coba lagi sebentar; bila berulang hubungi admin.',
      error: debug ? error.toString() : undefined
    });
  }
}

function responseJSON(data) {
  // Semua respons membawa versi + capability agar frontend selalu tahu
  // apakah deployment backend sudah diperbarui (masalah "sudah dibenerin
  // tapi masih error" biasanya karena deployment versi lama masih dipakai).
  const payload = (data && typeof data === 'object' && !Array.isArray(data)) ? data : { success: true, data: data };
  if (typeof payload.appVersion === 'undefined') payload.appVersion = APP_VERSION;
  if (typeof payload.capabilities === 'undefined') payload.capabilities = SERVER_CAPABILITIES;
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Respons standar saat lock tidak didapat (retryable di sisi klien). */
function busyResponse() {
  return {
    success: false,
    code: 'E_BUSY',
    retryable: true,
    message: 'Server sedang sibuk menyimpan data. Coba lagi sebentar lagi.'
  };
}

/**
 * Jalankan pekerjaan tulis di dalam LockService dengan flush() di akhir.
 * Pola tunggal untuk SEMUA endpoint tulis agar tidak ada lagi endpoint yang
 * lupa memakai lock (sumber duplikasi/persaingan tulis).
 *
 * @param {function(): object} work
 * @returns {object} hasil kerja, atau busyResponse() bila lock gagal didapat
 */
function withLock(work, options) {
  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) return busyResponse();
  try {
    return work();
  } finally {
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    // Setiap penulisan menaikkan versi data -> cache dashboard tidak menyajikan
    // angka lama tepat setelah user menyimpan (cache tetap efektif untuk
    // pembacaan berulang). Penulisan cache ayat boleh melewati ini.
    if (!options || options.bumpDash !== false) bumpDashVersion_();
    lock.releaseLock();
  }
}

// ============================================================
// HELPER GET SPREADSHEET
// ============================================================

// Cache lintas-request (CacheService). Sebelumnya proyek ini TIDAK memakai
// CacheService sama sekali, sehingga setiap request harus membaca sheet dari nol
// — termasuk validasi sesi di SETIAP request. Cache ini yang memutus biaya tetap
// per-request tersebut.
function getCache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

/**
 * Versi data dashboard. Dinaikkan setiap ada penulisan sehingga dashboard yang
 * dibuka tepat setelah menyimpan selalu segar, sementara pembacaan berulang
 * dalam rentang singkat dilayani cache (bukan hitung ulang).
 */
function dashVersion_() {
  const c = getCache_();
  if (!c) return '0';
  try { return c.get('dashgen') || '0'; } catch (e) { return '0'; }
}

function bumpDashVersion_() {
  const c = getCache_();
  if (!c) return;
  try { c.put('dashgen', String(Date.now()), 21600); } catch (e) { /* diabaikan */ }
}

/** TTL (detik) untuk cache payload dashboard. Pendek: cukup meredam trafik berulang. */
const DASH_CACHE_TTL_SEC = 30;
const SANTRI_CACHE_TTL_SEC = 20;

function dashCacheKey_(scope, id) {
  return 'dash:' + scope + ':' + id + ':' + dashVersion_() + ':' + appTodayStr();
}

function dashCacheGet_(key) {
  const c = getCache_();
  if (!c) return null;
  try {
    const raw = c.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function dashCachePut_(key, value, ttlSec) {
  const c = getCache_();
  if (!c) return;
  try { c.put(key, JSON.stringify(value), ttlSec || DASH_CACHE_TTL_SEC); } catch (e) { /* payload bisa terlalu besar -> diabaikan */ }
}

/**
 * Baca satu sheet sebagai array of array dengan jumlah kolom yang dibatasi
 * (tanpa baris pertama/header). Menggantikan getDataRange().getValues() yang
 * selalu membaca seluruh grid termasuk kolom kosong di kanan.
 */
function readSheet_(sheetName, numColumns) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, numColumns).getValues();
}

/**
 * Indeks Master_Hafalan dikelompokkan per ID santri, dibangun SEKALI per request.
 *
 * Sebelum perbaikan ini, dashboard ustaz memindai seluruh Master_Hafalan untuk
 * SETIAP santri (dan sekali lagi untuk menghitung progres target) sehingga
 * kompleksitasnya O(santri x baris). Dengan indeks ini menjadi O(baris) sekali.
 */
function buildMasterIndex_() {
  const rows = readSheet_('Master_Hafalan', 12);
  const bySantri = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idSantri = String(row[1] || '');
    if (!idSantri) continue;
    const unit = {
      idMaster: String(row[0]),
      idSantri: idSantri,
      surah: String(row[2]),
      ayatMulai: Number(row[3]) || 0,
      ayatAkhir: Number(row[4]) || 0,
      tglMulai: row[5],
      status: String(row[6] || ''),
      retentionStatus: String(row[7] || 'Hijau'),
      nextReview: toDateStr(row[8]),
      interval: Number(row[9]) || 1,
      consecutiveLupa: Number(row[10]) || 0,
      consecutiveLancar: Number(row[11]) || 0
    };
    if (!bySantri[idSantri]) bySantri[idSantri] = [];
    bySantri[idSantri].push(unit);
  }
  return bySantri;
}



// Cache per-eksekusi. SpreadsheetApp.openById() dan getSheetByName() adalah
// round-trip mahal; sebelumnya dipanggil berulang (6+ kali per request)
// sehingga request lambat dan rawan timeout/gagal simpan.
var __ssCache = null;
var __sheetCache = {};
var __configCache = null;

function getSpreadsheet() {
  if (__ssCache) return __ssCache;
  try {
    if (SPREADSHEET_ID && SPREADSHEET_ID.length > 5) {
      __ssCache = SpreadsheetApp.openById(SPREADSHEET_ID);
      return __ssCache;
    }
  } catch (e) {
    Logger.log('openById gagal, memakai active spreadsheet: ' + e);
  }
  __ssCache = SpreadsheetApp.getActiveSpreadsheet();
  return __ssCache;
}

function getSheet(sheetName) {
  if (__sheetCache[sheetName]) return __sheetCache[sheetName];
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    // Hanya dibuat bila benar-benar belum ada (mis. setup belum dijalankan).
    sheet = ss.insertSheet(sheetName);
    Logger.log('Sheet "' + sheetName + '" belum ada dan dibuat kosong.');
  }
  __sheetCache[sheetName] = sheet;
  return sheet;
}

/** Cari sheet yang sudah ada tanpa membuat tab bila namanya tidak ditemukan. */
function getExistingSheet_(sheetName) {
  const ss = getSpreadsheet();
  return ss ? ss.getSheetByName(sheetName) : null;
}

/** Membaca baris data hanya dari sheet yang sudah ada; benar-benar read-only. */
function readExistingSheet_(sheetName, numColumns) {
  const sheet = getExistingSheet_(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, numColumns).getValues();
}

/** Hitung baris data yang sepenuhnya kosong tanpa mengembalikan nilai sel. */
function countBlankDataRows_(sheet, lastRow, width) {
  const result = { count: 0, rowNumbers: [], truncated: false };
  const chunkSize = 1000;
  const maxRowNumbers = 100;
  for (let startRow = 2; startRow <= lastRow; startRow += chunkSize) {
    const numRows = Math.min(chunkSize, lastRow - startRow + 1);
    const rows = sheet.getRange(startRow, 1, numRows, width).getValues();
    for (let r = 0; r < rows.length; r++) {
      let hasValue = false;
      for (let c = 0; c < rows[r].length; c++) {
        const value = rows[r][c];
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          hasValue = true;
          break;
        }
      }
      if (!hasValue) {
        result.count++;
        if (result.rowNumbers.length < maxRowNumbers) result.rowNumbers.push(startRow + r);
        else result.truncated = true;
      }
    }
  }
  return result;
}

/**
 * Cari header skema yang mungkin bergeser ke bawah (contohnya baris kosong
 * sebelum header). Hasil ini hanya diagnostik; repair otomatis tidak pernah
 * memindahkan baris.
 */
function findSchemaHeaderRowOffset_(sheet, spec, lastRow, readWidth) {
  const scanEnd = Math.min(lastRow, 20);
  if (scanEnd < 2) return 0;
  const rows = sheet.getRange(2, 1, scanEnd - 1, readWidth).getValues();
  const requiredPrefix = Math.min(3, spec.headers.length);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let prefixLength = 0;
    while (prefixLength < spec.headers.length &&
        prefixLength < readWidth &&
        String(row[prefixLength] || '').trim() === spec.headers[prefixLength]) {
      prefixLength++;
    }
    if (prefixLength < requiredPrefix) continue;

    let hasUnexpectedValue = false;
    for (let c = prefixLength; c < row.length; c++) {
      if (String(row[c] || '').trim() !== '') {
        hasUnexpectedValue = true;
        break;
      }
    }
    if (!hasUnexpectedValue) return r + 2;
  }
  return 0;
}

/**
 * Inspect sheet/header and row counts. Optional blank-row scan returns only
 * counts and row numbers; record values never leave the in-memory audit.
 * Kolom tambahan yang tidak dikenal tidak pernah ditimpa otomatis.
 */
function inspectDatabaseSheet_(spec, sheet, scanBlankRows) {
  if (!sheet) {
    return {
      name: spec.name,
      phase: spec.phase,
      purpose: spec.purpose,
      status: 'missing_sheet',
      lastRow: 0,
      headerRowDetected: 0,
      dataRowsAssumingHeader: 0,
      blankDataRows: scanBlankRows ? 0 : null,
      blankDataRowNumbers: scanBlankRows ? [] : null,
      blankDataRowNumbersTruncated: scanBlankRows ? false : null,
      foundHeaders: [],
      missingHeaders: spec.headers.slice(),
      headerPrefixLength: 0,
      repairable: true
    };
  }

  const lastRow = Math.max(0, Number(sheet.getLastRow()) || 0);
  const maxColumns = Math.max(1, Number(sheet.getMaxColumns ? sheet.getMaxColumns() : spec.headers.length) || 1);
  const lastColumn = Math.max(0, Number(sheet.getLastColumn()) || 0);
  const readWidth = Math.min(maxColumns, Math.max(spec.headers.length, lastColumn));
  const rawHeaders = lastRow > 0
    ? sheet.getRange(1, 1, 1, readWidth).getValues()[0]
    : [];
  const foundHeaders = [];
  for (let i = 0; i < readWidth; i++) foundHeaders.push(String(rawHeaders[i] || '').trim());

  let prefixLength = 0;
  while (prefixLength < spec.headers.length &&
      prefixLength < foundHeaders.length &&
      foundHeaders[prefixLength] === spec.headers[prefixLength]) {
    prefixLength++;
  }
  const hasAnyHeader = foundHeaders.some(function (value) { return value !== ''; });
  const hasUnexpectedHeaders = foundHeaders.slice(spec.headers.length).some(function (value) { return value !== ''; });
  const missingHeaders = spec.headers.slice(prefixLength);
  const shiftedHeaderRow = prefixLength < spec.headers.length
    ? findSchemaHeaderRowOffset_(sheet, spec, lastRow, readWidth)
    : 0;
  let status;
  let repairable = false;

  if (shiftedHeaderRow > 1) {
    // Jangan menulis baris 1 di atas header yang sudah ada di bawahnya.
    // Perlu peninjauan manual sebelum memindahkan atau menghapus baris apa pun.
    status = 'header_row_offset';
  } else if (!hasAnyHeader) {
    status = 'missing_header';
    repairable = true;
  } else if (prefixLength === spec.headers.length && !hasUnexpectedHeaders) {
    status = Math.max(0, lastRow - 1) === 0 ? 'header_only' : 'ready';
  } else if (prefixLength > 0 && !hasUnexpectedHeaders &&
      foundHeaders.slice(prefixLength, spec.headers.length).every(function (value) { return value === ''; })) {
    status = 'missing_trailing_headers';
    repairable = true;
  } else if (prefixLength === spec.headers.length && hasUnexpectedHeaders) {
    status = 'unexpected_extra_headers';
  } else {
    status = 'header_mismatch';
  }

  const blankRows = scanBlankRows && lastRow > 1
    ? countBlankDataRows_(sheet, lastRow, readWidth)
    : (scanBlankRows ? { count: 0, rowNumbers: [], truncated: false } : null);
  const detectedHeaderRow = shiftedHeaderRow || (prefixLength === spec.headers.length ? 1 : 0);

  return {
    name: spec.name,
    phase: spec.phase,
    purpose: spec.purpose,
    status: status,
    lastRow: lastRow,
    headerRowDetected: detectedHeaderRow,
    dataRowsAssumingHeader: Math.max(0, lastRow - (detectedHeaderRow || 1)),
    blankDataRows: blankRows ? blankRows.count : null,
    blankDataRowNumbers: blankRows ? blankRows.rowNumbers : null,
    blankDataRowNumbersTruncated: blankRows ? blankRows.truncated : null,
    foundHeaders: foundHeaders,
    missingHeaders: missingHeaders,
    headerPrefixLength: prefixLength,
    repairable: repairable
  };
}

/**
 * Audit seluruh skema inti dengan operasi baca saja. Default-nya menghitung
 * baris data yang sepenuhnya kosong (nilai sel tidak pernah dikembalikan).
 * Gunakan {scanBlankRows:false} untuk audit header/metadata yang lebih ringan.
 */
function auditDatabaseSchema(options) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false, readOnly: true, error: 'Spreadsheet tidak tersedia.' };
  const scanBlankRows = !(options && options.scanBlankRows === false);

  const sheets = DATABASE_SHEET_SCHEMA.map(function (spec) {
    return inspectDatabaseSheet_(spec, ss.getSheetByName(spec.name), scanBlankRows);
  });
  const report = {
    success: true,
    readOnly: true,
    timestamp: new Date().toISOString(),
    spreadsheetId: SPREADSHEET_ID ? (SPREADSHEET_ID.slice(0, 6) + '…(disembunyikan)') : '(belum diisi)',
    summary: {
      total: sheets.length,
      missingSheets: sheets.filter(function (item) { return item.status === 'missing_sheet'; }).length,
      missingHeaders: sheets.filter(function (item) {
        return ['missing_header', 'missing_trailing_headers'].indexOf(item.status) !== -1;
      }).length,
      headerOnly: sheets.filter(function (item) { return item.status === 'header_only'; }).length,
      shiftedHeaders: sheets.filter(function (item) { return item.status === 'header_row_offset'; }).length,
      mismatchedHeaders: sheets.filter(function (item) {
        return ['header_mismatch', 'unexpected_extra_headers'].indexOf(item.status) !== -1;
      }).length,
      blankDataRows: scanBlankRows
        ? sheets.reduce(function (total, item) { return total + (item.blankDataRows || 0); }, 0)
        : null
    },
    sheets: sheets
  };
  if (!options) Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Audit relasi ID santri dan kardinalitas target tanpa menulis apa pun.
 * Laporan hanya berisi hitungan/status/nomor baris, tidak mengembalikan nama,
 * username, ID mentah, hash, token, atau isi pesan. Kolom Users dibaca terpilah
 * agar Password_Hash tidak ikut dibaca.
 */
function auditStudentDataIntegrity(options) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false, readOnly: true, error: 'Spreadsheet tidak tersedia.' };

  const MAX_REPORTED_ROWS = 100;
  const clean = function (value) {
    return value === null || value === undefined ? '' : String(value).trim();
  };
  const keyOf = function (value) { return clean(value).toLowerCase(); };
  const dataStartRowFor = function (sheetName, sheet, lastRow) {
    const spec = DATABASE_SHEET_SCHEMA.filter(function (item) { return item.name === sheetName; })[0];
    if (!spec || lastRow < 2) return 2;
    const maxColumns = Math.max(1, Number(sheet.getMaxColumns ? sheet.getMaxColumns() : spec.headers.length) || 1);
    const lastColumn = Math.max(0, Number(sheet.getLastColumn()) || 0);
    const width = Math.min(maxColumns, Math.max(spec.headers.length, lastColumn));
    let completeHeader = false;
    if (sheetName === 'Users') {
      // Header check in Users deliberately skips Password_Hash and Nama.
      const idHeader = clean(sheet.getRange(1, 1, 1, 1).getValues()[0][0]);
      const usernameHeader = clean(sheet.getRange(1, 2, 1, 1).getValues()[0][0]);
      const roleHeader = clean(sheet.getRange(1, 4, 1, 1).getValues()[0][0]);
      const relatedHeader = clean(sheet.getRange(1, 6, 1, 1).getValues()[0][0]);
      completeHeader = idHeader === 'ID' && usernameHeader === 'Username' &&
        roleHeader === 'Role' && relatedHeader === 'ID_Terkait';
      // Jika header Users bergeser, baris header akan diabaikan oleh filter Role;
      // jangan membaca kolom sensitif hanya untuk mencari offset.
      if (!completeHeader) return 2;
    } else {
      const top = sheet.getRange(1, 1, 1, width).getValues()[0];
      completeHeader = spec.headers.every(function (header, index) { return clean(top[index]) === header; });
    }
    if (completeHeader) return 2;
    const offset = findSchemaHeaderRowOffset_(sheet, spec, lastRow, width);
    return offset > 1 ? offset + 1 : 2;
  };
  const readColumn = function (sheetName, column) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { exists: false, rows: [], startRow: 2 };
    const lastRow = Math.max(0, Number(sheet.getLastRow()) || 0);
    const startRow = dataStartRowFor(sheetName, sheet, lastRow);
    if (lastRow < startRow) return { exists: true, rows: [], startRow: startRow };
    return {
      exists: true,
      startRow: startRow,
      rows: sheet.getRange(startRow, column, lastRow - startRow + 1, 1).getValues().map(function (row) { return row[0]; })
    };
  };
  const aliasTargets = Object.create(null);
  const canonicalByKey = Object.create(null);
  const canonicalRows = readColumn('Santri', 1);
  const canonicalIds = new Set();
  const canonicalIdCounts = Object.create(null);

  canonicalRows.rows.forEach(function (value) {
    const id = clean(value);
    if (!id) return;
    canonicalIds.add(id);
    const key = keyOf(id);
    if (!canonicalByKey[key]) canonicalByKey[key] = Object.create(null);
    canonicalByKey[key][id] = true;
    canonicalIdCounts[id] = (canonicalIdCounts[id] || 0) + 1;
  });

  const usersSheet = ss.getSheetByName('Users');
  const users = [];
  if (usersSheet) {
    const lastRow = Math.max(0, Number(usersSheet.getLastRow()) || 0);
    const startRow = dataStartRowFor('Users', usersSheet, lastRow);
    const rowCount = Math.max(0, lastRow - startRow + 1);
    if (rowCount > 0) {
      // Baca A, B, D, F saja. Kolom C (Password_Hash) dan E (Nama) dilewati.
      const ids = usersSheet.getRange(startRow, 1, rowCount, 1).getValues();
      const usernames = usersSheet.getRange(startRow, 2, rowCount, 1).getValues();
      const roles = usersSheet.getRange(startRow, 4, rowCount, 1).getValues();
      const related = usersSheet.getRange(startRow, 6, rowCount, 1).getValues();
      for (let i = 0; i < rowCount; i++) {
        users.push({
          row: startRow + i,
          id: clean(ids[i][0]),
          username: clean(usernames[i][0]),
          role: clean(roles[i][0]).toLowerCase(),
          idTerkait: clean(related[i][0])
        });
      }
    }
  }

  const studentAccountRows = users.filter(function (user) { return user.role === 'santri'; });
  const mappedStudentAccountRows = [];
  const unmappedStudentAccountRows = [];
  const ambiguousStudentAccountRows = [];
  studentAccountRows.forEach(function (user) {
    const candidates = Object.create(null);
    [user.username, user.id].forEach(function (value) {
      const matches = canonicalByKey[keyOf(value)] || {};
      Object.keys(matches).forEach(function (canonicalId) { candidates[canonicalId] = true; });
    });
    const candidateIds = Object.keys(candidates);
    if (candidateIds.length === 1) {
      mappedStudentAccountRows.push(user.row);
      [user.id, user.username].forEach(function (alias) {
        const key = keyOf(alias);
        if (!key) return;
        if (!aliasTargets[key]) aliasTargets[key] = Object.create(null);
        aliasTargets[key][candidateIds[0]] = true;
      });
    } else if (candidateIds.length > 1) {
      ambiguousStudentAccountRows.push(user.row);
    } else {
      unmappedStudentAccountRows.push(user.row);
    }
  });

  const resolveReference = function (value) {
    const raw = clean(value);
    if (!raw) return { status: 'blank', canonicalId: '' };
    if (canonicalIds.has(raw)) return { status: 'canonical', canonicalId: raw };

    const normalizedMatches = canonicalByKey[keyOf(raw)] || {};
    const normalizedIds = Object.keys(normalizedMatches);
    if (normalizedIds.length === 1) return { status: 'mapped_alias', canonicalId: normalizedIds[0] };
    if (normalizedIds.length > 1) return { status: 'ambiguous', canonicalId: '' };

    const aliasMatches = Object.keys(aliasTargets[keyOf(raw)] || {});
    if (aliasMatches.length === 1) return { status: 'mapped_alias', canonicalId: aliasMatches[0] };
    if (aliasMatches.length > 1) return { status: 'ambiguous', canonicalId: '' };
    return { status: 'unmapped', canonicalId: '' };
  };

  const referenceSpecs = [
    { name: 'Hafalan', column: 3 },
    { name: 'Master_Hafalan', column: 2 },
    { name: 'Target', column: 3 },
    { name: 'Murojaah', column: 3 },
    { name: 'Riwayat_Tes', column: 3 },
    { name: 'Gamifikasi', column: 1 },
    { name: 'Badge', column: 2 },
    { name: 'Feedback', column: 2 },
    { name: 'Notifikasi', column: 2 }
  ];
  const references = referenceSpecs.map(function (spec) {
    const source = readColumn(spec.name, spec.column);
    const counts = { canonical: 0, mappedAlias: 0, blank: 0, unmapped: 0, ambiguous: 0 };
    const unmappedRows = [];
    const ambiguousRows = [];
    source.rows.forEach(function (value, index) {
      const result = resolveReference(value);
      if (result.status === 'mapped_alias') counts.mappedAlias++;
      else counts[result.status]++;
      const sheetRow = source.startRow + index;
      if (result.status === 'unmapped' && unmappedRows.length < MAX_REPORTED_ROWS) unmappedRows.push(sheetRow);
      if (result.status === 'ambiguous' && ambiguousRows.length < MAX_REPORTED_ROWS) ambiguousRows.push(sheetRow);
    });
    const unmappedTotal = counts.unmapped;
    const ambiguousTotal = counts.ambiguous;
    return {
      sheet: spec.name,
      exists: source.exists,
      dataRows: source.rows.length,
      canonicalMatches: counts.canonical,
      mappedAliases: counts.mappedAlias,
      blankIds: counts.blank,
      unmappedIds: unmappedTotal,
      ambiguousIds: ambiguousTotal,
      unmappedRowNumbers: unmappedRows,
      unmappedRowsTruncated: unmappedTotal > unmappedRows.length,
      ambiguousRowNumbers: ambiguousRows,
      ambiguousRowsTruncated: ambiguousTotal > ambiguousRows.length
    };
  });

  const parentUsers = users.filter(function (user) { return user.role === 'ortu'; });
  const parentLinks = { directCanonical: 0, mappedAlias: 0, blank: 0, unmapped: 0, ambiguous: 0 };
  const parentLinkRows = { unmapped: [], ambiguous: [] };
  parentUsers.forEach(function (user) {
    const result = resolveReference(user.idTerkait);
    if (result.status === 'canonical') parentLinks.directCanonical++;
    else if (result.status === 'mapped_alias') parentLinks.mappedAlias++;
    else parentLinks[result.status]++;
    if (result.status === 'unmapped' && parentLinkRows.unmapped.length < MAX_REPORTED_ROWS) parentLinkRows.unmapped.push(user.row);
    if (result.status === 'ambiguous' && parentLinkRows.ambiguous.length < MAX_REPORTED_ROWS) parentLinkRows.ambiguous.push(user.row);
  });

  const targetSheet = ss.getSheetByName('Target');
  const rawTargetGroups = Object.create(null);
  const canonicalTargetGroups = Object.create(null);
  let targetDataRows = 0;
  if (targetSheet) {
    const targetIds = readColumn('Target', 3);
    const startRow = targetIds.startRow;
    const rowCount = targetIds.rows.length;
    if (rowCount > 0) {
      const months = targetSheet.getRange(startRow, 2, rowCount, 1).getValues();
      for (let i = 0; i < rowCount; i++) {
        const month = months[i][0] === null || months[i][0] === undefined ? '' : String(months[i][0]);
        const rawId = targetIds.rows[i] === null || targetIds.rows[i] === undefined ? '' : String(targetIds.rows[i]);
        if (!clean(month) || !clean(rawId)) continue;
        targetDataRows++;
        const rowNumber = startRow + i;
        const rawGroupKey = JSON.stringify([rawId, month]);
        if (!rawTargetGroups[rawGroupKey]) rawTargetGroups[rawGroupKey] = [];
        rawTargetGroups[rawGroupKey].push(rowNumber);

        const resolved = resolveReference(rawId);
        if (resolved.canonicalId) {
          const canonicalGroupKey = JSON.stringify([keyOf(resolved.canonicalId), month]);
          if (!canonicalTargetGroups[canonicalGroupKey]) {
            canonicalTargetGroups[canonicalGroupKey] = { rowNumbers: [], rawIdKeys: Object.create(null) };
          }
          canonicalTargetGroups[canonicalGroupKey].rowNumbers.push(rowNumber);
          canonicalTargetGroups[canonicalGroupKey].rawIdKeys[rawId] = true;
        }
      }
    }
  }
  const duplicateTargetGroups = [];
  const crosswalkTargetGroups = [];
  let duplicateTargetRowsBeyondFirst = 0;
  Object.keys(rawTargetGroups).forEach(function (key) {
    const rows = rawTargetGroups[key];
    if (rows.length < 2) return;
    duplicateTargetRowsBeyondFirst += rows.length - 1;
    if (duplicateTargetGroups.length < MAX_REPORTED_ROWS) {
      duplicateTargetGroups.push({ rowNumbers: rows.slice(0, MAX_REPORTED_ROWS), rowNumbersTruncated: rows.length > MAX_REPORTED_ROWS });
    }
  });
  Object.keys(canonicalTargetGroups).forEach(function (key) {
    const group = canonicalTargetGroups[key];
    if (group.rowNumbers.length < 2 || Object.keys(group.rawIdKeys).length < 2) return;
    if (crosswalkTargetGroups.length < MAX_REPORTED_ROWS) {
      crosswalkTargetGroups.push({
        rowNumbers: group.rowNumbers.slice(0, MAX_REPORTED_ROWS),
        rowNumbersTruncated: group.rowNumbers.length > MAX_REPORTED_ROWS
      });
    }
  });

  const duplicateRawTargetGroupCount = Object.keys(rawTargetGroups).filter(function (key) { return rawTargetGroups[key].length > 1; }).length;
  const crosswalkTargetGroupCount = Object.keys(canonicalTargetGroups).filter(function (key) {
    const group = canonicalTargetGroups[key];
    return group.rowNumbers.length > 1 && Object.keys(group.rawIdKeys).length > 1;
  }).length;
  const duplicateSantriIds = Object.keys(canonicalIdCounts).filter(function (id) { return canonicalIdCounts[id] > 1; }).length;
  const report = {
    success: true,
    readOnly: true,
    timestamp: new Date().toISOString(),
    summary: {
      santriRosterRows: canonicalRows.rows.length,
      distinctSantriIds: canonicalIds.size,
      duplicateSantriIds: duplicateSantriIds,
      studentAccounts: studentAccountRows.length,
      mappedStudentAccounts: mappedStudentAccountRows.length,
      unmappedStudentAccounts: unmappedStudentAccountRows.length,
      ambiguousStudentAccounts: ambiguousStudentAccountRows.length,
      parentAccounts: parentUsers.length,
      parentLinks: parentLinks,
      targetRowsWithStudentAndMonth: targetDataRows,
      duplicateTargetGroups: duplicateRawTargetGroupCount,
      targetRowsBeyondFirstMatch: duplicateTargetRowsBeyondFirst,
      targetGroupsAcrossIdAliases: crosswalkTargetGroupCount,
      referenceRows: references.reduce(function (sum, item) { return sum + item.dataRows; }, 0),
      unresolvedReferenceRows: references.reduce(function (sum, item) { return sum + item.unmappedIds; }, 0),
      ambiguousReferenceRows: references.reduce(function (sum, item) { return sum + item.ambiguousIds; }, 0)
    },
    studentAccounts: {
      mappedRows: mappedStudentAccountRows.slice(0, MAX_REPORTED_ROWS),
      mappedRowsTruncated: mappedStudentAccountRows.length > MAX_REPORTED_ROWS,
      unmappedRows: unmappedStudentAccountRows.slice(0, MAX_REPORTED_ROWS),
      unmappedRowsTruncated: unmappedStudentAccountRows.length > MAX_REPORTED_ROWS,
      ambiguousRows: ambiguousStudentAccountRows.slice(0, MAX_REPORTED_ROWS),
      ambiguousRowsTruncated: ambiguousStudentAccountRows.length > MAX_REPORTED_ROWS
    },
    parentLinks: {
      counts: parentLinks,
      unmappedUserRows: parentLinkRows.unmapped,
      unmappedRowsTruncated: parentLinks.unmapped > parentLinkRows.unmapped.length,
      ambiguousUserRows: parentLinkRows.ambiguous,
      ambiguousRowsTruncated: parentLinks.ambiguous > parentLinkRows.ambiguous.length
    },
    references: references,
    targets: {
      currentCodeBehavior: 'dashboard memilih target pertama per ID_Santri mentah per bulan; baris berulang dengan ID dan bulan yang sama tidak terpilih',
      duplicateGroups: duplicateTargetGroups,
      duplicateGroupsTruncated: duplicateRawTargetGroupCount > duplicateTargetGroups.length,
      rowsBeyondFirstMatch: duplicateTargetRowsBeyondFirst,
      crosswalkGroupsForReview: crosswalkTargetGroups,
      crosswalkGroupsTruncated: crosswalkTargetGroupCount > crosswalkTargetGroups.length
    }
  };
  if (!options) Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Perbaiki hanya sheet inti yang hilang atau header yang kosong/terpotong di
 * ujung kanan. Default adalah dry-run; gunakan {apply:true} untuk menulis.
 * Header yang tidak cocok atau memiliki kolom tambahan selalu dilewati.
 */
function repairMissingSchemaHeaders(options) {
  const apply = !!(options && options.apply === true);
  const ss = getSpreadsheet();
  if (!ss) return { success: false, dryRun: !apply, error: 'Spreadsheet tidak tersedia.' };

  if (!apply) {
    const audit = DATABASE_SHEET_SCHEMA.map(function (spec) {
      return inspectDatabaseSheet_(spec, ss.getSheetByName(spec.name));
    });
    const report = {
      success: true,
      dryRun: true,
      planned: audit.filter(function (item) { return item.repairable; }),
      skipped: audit.filter(function (item) { return !item.repairable; })
    };
    if (!options) Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) return { success: false, dryRun: false, code: 'E_BUSY', message: 'Sistem sedang sibuk; perbaikan skema belum dijalankan.' };

  const repaired = [];
  const skipped = [];
  const errors = [];
  let changed = false;
  try {
    for (let i = 0; i < DATABASE_SHEET_SCHEMA.length; i++) {
      const spec = DATABASE_SHEET_SCHEMA[i];
      const sheetBefore = ss.getSheetByName(spec.name);
      const before = inspectDatabaseSheet_(spec, sheetBefore);
      if (!before.repairable) {
        skipped.push({ name: spec.name, status: before.status });
        continue;
      }

      try {
        let sheet = sheetBefore;
        let action;
        if (!sheet) {
          sheet = ss.insertSheet(spec.name);
          changed = true;
          action = 'created_sheet_and_headers';
        } else if (before.status === 'missing_header') {
          action = 'wrote_missing_header';
        } else {
          action = 'appended_missing_trailing_headers';
        }

        const maxColumns = Math.max(1, Number(sheet.getMaxColumns ? sheet.getMaxColumns() : spec.headers.length) || 1);
        if (maxColumns < spec.headers.length) {
          sheet.insertColumnsAfter(maxColumns, spec.headers.length - maxColumns);
          changed = true;
        }

        changed = true;
        if (action === 'appended_missing_trailing_headers') {
          const headersToWrite = spec.headers.slice(before.headerPrefixLength);
          sheet.getRange(1, before.headerPrefixLength + 1, 1, headersToWrite.length).setValues([headersToWrite]);
        } else {
          sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
        }
        changed = true;

        const after = inspectDatabaseSheet_(spec, sheet);
        const rowsPreserved = after.dataRowsAssumingHeader === before.dataRowsAssumingHeader;
        const verified = ['header_only', 'ready'].indexOf(after.status) !== -1 && rowsPreserved;
        if (!verified) {
          errors.push({ name: spec.name, error: 'Verifikasi header gagal; baris data tidak ditulis atau dihapus oleh repair.' });
        }
        repaired.push({
          name: spec.name,
          action: action,
          statusAfter: after.status,
          dataRowsBefore: before.dataRowsAssumingHeader,
          dataRowsAfter: after.dataRowsAssumingHeader,
          verified: verified
        });
      } catch (e) {
        errors.push({ name: spec.name, error: String(e) });
      }
    }

    if (changed) {
      try { SpreadsheetApp.flush(); } catch (flushError) { errors.push({ name: '(flush)', error: String(flushError) }); }
      try { bumpDashVersion_(); } catch (cacheError) { Logger.log('Invalidasi cache setelah repair skema gagal: ' + cacheError); }
    }
  } finally {
    try { if (changed) SpreadsheetApp.flush(); } catch (flushError) { /* laporkan hasil utama apa adanya */ }
    lock.releaseLock();
  }

  return { success: errors.length === 0, dryRun: false, repaired: repaired, skipped: skipped, errors: errors };
}

/** Entry point eksplisit untuk menjalankan perbaikan setelah dry-run ditinjau. */
function applyMissingSchemaHeaders() {
  const report = repairMissingSchemaHeaders({ apply: true });
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Akuisisi lock dengan retry + backoff singkat.
 * Total tunggu dibatasi (LOCK_ATTEMPTS x LOCK_WAIT_MS) dan SELALU lebih pendek
 * dari timeout klien, supaya user menerima pesan "server sibuk" yang jujur
 * alih-alih "koneksi putus" padahal server masih bekerja.
 */
function acquireLock(lock, timeoutMs) {
  const timeout = Number(timeoutMs) || LOCK_WAIT_MS;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
    try {
      lock.waitLock(timeout);
      return true;
    } catch (e) {
      Utilities.sleep(200 * (attempt + 1));
    }
  }
  return false;
}

// ============================================================
// DATE HELPERS (ZONA WAKTU APLIKASI)
// ============================================================

/** Tanggal "hari ini" (YYYY-MM-DD) pada zona waktu aplikasi. */
function appTodayStr() {
  return Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');
}

/** Tanggal YYYY-MM-DD sejumlah hari dari hari ini (boleh negatif). */
function addDaysStr(days) {
  const ms = Number(days || 0) * 24 * 60 * 60 * 1000;
  return Utilities.formatDate(new Date(Date.now() + ms), APP_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Normalisasi nilai sel menjadi YYYY-MM-DD.
 * Sel tanggal di Sheets terbaca sebagai objek Date (String()-nya bukan ISO),
 * sehingga konversi naif seperti String(v).split('T')[0] merusak logika streak.
 */
function toDateStr(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, APP_TIMEZONE, 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, APP_TIMEZONE, 'yyyy-MM-dd');
  return '';
}

/** Selisih hari (hari ini minus tanggal) pada batas hari zona waktu aplikasi. */
function diffDaysFrom(value) {
  const str = toDateStr(value);
  if (!str) return 0;
  const now = new Date(appTodayStr() + 'T00:00:00Z').getTime();
  const then = new Date(str + 'T00:00:00Z').getTime();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

// ============================================================
// AUTH & SESSION MANAGEMENT
// ============================================================

/**
 * Hash password + salt acak per akun (PRD Section 16).
 * Format kolom Password_Hash: "<salt>$<hash>".
 * Hash SHA-256 lama (tanpa "$") tetap diterima agar akun lama tidak mati.
 */
function hashPassword(plainPassword, salt) {
  const useSalt = salt || Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    useSalt + ':' + String(plainPassword),
    Utilities.Charset.UTF_8
  );
  const digest = rawHash
    .map(function (byte) {
      const v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    })
    .join('');
  return useSalt + '$' + digest;
}

/** Verifikasi password terhadap Password_Hash yang tersimpan. */
function verifyPassword(plainPassword, storedHash) {
  if (!storedHash) return false;
  const stored = String(storedHash);
  const idx = stored.indexOf('$');

  if (idx === -1) {
    // Kompatibilitas dengan hash SHA-256 lama (tanpa salt).
    const legacy = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(plainPassword),
      Utilities.Charset.UTF_8
    ).map(function (byte) {
      const v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
    return legacy === stored;
  }

  return hashPassword(plainPassword, stored.slice(0, idx)) === stored;
}

function loginUser(username, password) {
  if (!username || !password) {
    return { success: false, code: 'E_VALIDATION', message: 'Username dan password wajib diisi' };
  }

  const data = readSheet_('Users', 6);
  const sheet = getSheet('Users');
  if (data.length <= 1) {
    return { success: false, code: 'E_VALIDATION', message: 'Database pengguna kosong. Jalankan setupInitialDatabase() dari editor Apps Script.' };
  }

  for (let i = 0; i < data.length; i++) {
    // Kolom: ID(0), Username(1), Password_Hash(2), Role(3), Nama(4), ID_Terkait(5)
    if (String(data[i][1]).toLowerCase() === String(username).toLowerCase() && verifyPassword(password, data[i][2])) {
      const userId = String(data[i][0]);
      const role = String(data[i][3]).toLowerCase();
      const nama = String(data[i][4]);
      const idTerkait = String(data[i][5] || '');

      const token = saveSession(userId, role, idTerkait, nama);
      if (!token) {
        return { success: false, code: 'E_BUSY', retryable: true, message: 'Server sedang sibuk membuat sesi. Coba lagi sebentar.' };
      }

      return {
        success: true,
        token: token,
        role: role,
        nama: nama,
        userId: userId,
        idTerkait: idTerkait
      };
    }
  }

  return { success: false, code: 'E_AUTH', message: 'Username atau password salah' };
}

function saveSession(userId, role, idTerkait, nama) {
  const config = getConfigMap();
  const expiryHours = Number(config.SESSION_EXPIRY_JAM || 24);

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return null;
  }

  try {
    const sheet = getSheet('Sessions');
    const token = Utilities.getUuid();
    const expiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    // Expiry disimpan sebagai ISO timestamp agar sel tidak diubah menjadi tipe Date.
    sheet.appendRow([token, userId, role, expiry.toISOString(), idTerkait || '', nama || '']);

    // Hangatkan cache agar request pertama setelah login tidak perlu membaca sheet.
    const cache = getCache_();
    if (cache) {
      try {
        cache.put('sess:' + token, JSON.stringify({
          userId: userId, role: role, idTerkait: idTerkait || '', nama: nama || '', _exp: expiry.toISOString()
        }), Math.min(21600, Math.max(60, expiryHours * 3600 - 60)));
      } catch (e) { /* diabaikan */ }
    }
    bumpDashVersion_(); // sesi baru -> dashboard boleh dihitung ulang
    return token;
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

function validateSession(token) {
  // Jalur cepat: sesi yang sudah tervalidasi dilayani cache (tanpa membaca sheet).
  // Ini memutus biaya tetap per-request — dulu SETIAP request (termasuk 3-4
  // panggilan ayat per kartu flashcard) membaca seluruh sheet Sessions.
  const cache = getCache_();
  const cacheKey = 'sess:' + token;
  if (cache) {
    try {
      const cached = cache.get(cacheKey);
      if (cached) {
        const sess = JSON.parse(cached);
        if (sess && sess._exp && new Date(sess._exp).getTime() > Date.now()) return sess;
        cache.remove(cacheKey); // kedaluwarsa -> buang
      }
    } catch (e) { /* cache rusak -> jatuh ke pembacaan sheet */ }
  }

  const sheet = getSheet('Sessions');
  const data = readSheet_('Sessions', 6);
  const now = new Date();

  for (let i = 0; i < data.length; i++) {
    // Kolom: Token(0), ID_User(1), Role(2), Expiry(3), ID_Terkait(4), Nama(5)
    // (readSheet_ tanpa header -> index 0 = baris data pertama)
    if (data[i][0] === token) {
      const expiryDate = new Date(data[i][3]);
      if (expiryDate < now) {
        // Lazy cleanup: hapus token kedaluwarsa yang kebetulan ditemukan.
        // Ini jaring pengaman bila trigger malam belum/tidak pernah terpasang,
        // supaya sheet Sessions tidak tumbuh selamanya. Lock singkat + tidak
        // memblokir request: bila lock tidak didapat, lanjut saja.
        try {
          const lock = LockService.getScriptLock();
          if (lock.tryLock(1500)) {
            try {
              sheet.deleteRow(i + 1);
              SpreadsheetApp.flush();
            } finally {
              lock.releaseLock();
            }
          }
        } catch (cleanupErr) {
          Logger.log('lazy cleanup sesi gagal (diabaikan): ' + cleanupErr);
        }
        return null; // Expired
      }
      const session = {
        userId: String(data[i][1]),
        role: String(data[i][2]),
        idTerkait: String(data[i][4] || ''),
        nama: String(data[i][5] || ''),
        _exp: data[i][3]
      };
      // Simpan ke cache sampai sedikit sebelum masa berlakunya habis.
      if (cache) {
        try {
          const sisaDetik = Math.max(60, Math.floor((expiryDate.getTime() - now.getTime()) / 1000) - 60);
          cache.put(cacheKey, JSON.stringify(session), Math.min(sisaDetik, 21600));
        } catch (e) { /* diabaikan */ }
      }
      return session;
    }
  }
  return null;
}

function logoutUser(token) {
  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return busyResponse();
  }

  try {
    const cache = getCache_();
    if (cache) { try { cache.remove('sess:' + token); } catch (e) { /* diabaikan */ } }

    const sheet = getSheet('Sessions');
    const data = readSheet_('Sessions', 6);
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === token) {
        // Tandai kedaluwarsa (bukan deleteRow): deleteRow menggeser seluruh baris
        // di bawahnya — mahal saat sheet besar. Pembersihan fisik dilakukan batch
        // malam / lazy cleanup di validateSession.
        sheet.getRange(i + 2, 4).setValue(new Date(0).toISOString());
        return { success: true, message: 'Logout berhasil' };
      }
    }
    return { success: true, message: 'Sesi tidak ditemukan' };
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

function getUserProfile(session) {
  return {
    success: true,
    user: {
      userId: session.userId,
      role: session.role,
      nama: session.nama,
      idTerkait: session.idTerkait
    }
  };
}

// ============================================================
// CONFIGURATION HELPER
// ============================================================

function defaultConfigMap_() {
  return {
    AMBANG_SABQI_HARI: 30,
    INTERVAL_MULTIPLIER_LANCAR: 1.5,
    INTERVAL_MULTIPLIER_TERSENDAT: 0.5,
    INTERVAL_CAP_MAKS_HARI: 60,
    INTERVAL_LUPA_HARI: 1,
    RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN: 2,
    XP_SABAQ: 5,
    XP_SABQI: 8,
    XP_MANZIL: 12,
    XP_BONUS_LANCAR: 5,
    XP_BONUS_RECOVERY: 15,
    SESSION_EXPIRY_JAM: 24,
    ARCHIVE_AMBANG_BULAN: 6,
    // 0 = arsip otomatis hanya UJI KERING (aman). Set 1 di sheet Config untuk
    // benar-benar memindahkan riwayat lama ke sheet Arsip_*.
    ARCHIVE_AKTIF: 0
  };
}

function mergeConfigRows_(map, data) {
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    const val = data[i][1];
    if (key && val !== '') {
      map[key] = !isNaN(Number(val)) ? Number(val) : val;
    }
  }
  return map;
}

/** Baca Config untuk alur aplikasi lama; dapat membuat sheet bila setup belum ada. */
function getConfigMap() {
  if (__configCache) return __configCache;
  const sheet = getSheet('Config');
  const map = mergeConfigRows_(defaultConfigMap_(), sheet.getDataRange().getValues());
  __configCache = map;
  return map;
}

/**
 * Baca Config tanpa membuat sheet dan tanpa mengubah cache global.
 * Khusus diagnostik dan uji kering yang wajib benar-benar read-only.
 */
function getConfigMapReadOnly_() {
  const map = defaultConfigMap_();
  const sheet = getExistingSheet_('Config');
  if (!sheet || sheet.getLastRow() < 2) return map;
  const maxColumns = Math.max(1, Number(sheet.getMaxColumns ? sheet.getMaxColumns() : 3) || 1);
  if (maxColumns < 2) return map;
  const width = Math.min(3, maxColumns);
  const data = sheet.getRange(1, 1, sheet.getLastRow(), width).getValues();
  return mergeConfigRows_(map, data);
}

// ============================================================
// RETENTION ENGINE (SM-2-lite) & EVENT-DRIVEN CACHE UPDATER
// ============================================================

/**
 * Menghitung interval baru dan status retensi untuk 1 unit Master Hafalan
 * berdasarkan hasil evaluasi terbaru (Lancar / Tersendat / Lupa).
 */
function calculateNextRetentionState(currentStatus, currentInterval, consecutiveLupa, consecutiveLancar, quality, config) {
  let newInterval = Number(currentInterval) || 1;
  let newConsecutiveLupa = Number(consecutiveLupa) || 0;
  let newConsecutiveLancar = Number(consecutiveLancar) || 0;
  let newStatus = currentStatus || 'Hijau';
  let recoveryAchieved = false;

  const multLancar = Number(config.INTERVAL_MULTIPLIER_LANCAR || 1.5);
  const multTersendat = Number(config.INTERVAL_MULTIPLIER_TERSENDAT || 0.5);
  const maxCap = Number(config.INTERVAL_CAP_MAKS_HARI || 60);
  const minLupa = Number(config.INTERVAL_LUPA_HARI || 1);
  // PRD 7.4: Merah hanya naik ke Kuning setelah N kali Lancar berturut-turut.
  const recoveryNeed = Math.max(1, Number(config.RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN || 2));

  if (quality === 'Lancar') {
    newConsecutiveLupa = 0;
    newConsecutiveLancar += 1;

    if (currentStatus === 'Merah') {
      if (newConsecutiveLancar >= recoveryNeed) {
        newStatus = 'Kuning'; // Recovery tercapai
        recoveryAchieved = true;
        newConsecutiveLancar = 0;
        newInterval = Math.min(maxCap, Math.max(1, Math.ceil(newInterval * multLancar)));
      } else {
        // Masih dalam masa recovery: status tetap Merah dan review dijaga rapat.
        newStatus = 'Merah';
        newInterval = minLupa;
      }
    } else {
      newStatus = 'Hijau';
      newConsecutiveLancar = 0;
      newInterval = Math.min(maxCap, Math.max(1, Math.ceil(newInterval * multLancar)));
    }
  } else if (quality === 'Tersendat') {
    newInterval = Math.max(1, Math.floor(newInterval * multTersendat));
    newConsecutiveLupa = 0;
    newConsecutiveLancar = 0;
    if (newStatus !== 'Merah') {
      newStatus = 'Kuning';
    }
  } else if (quality === 'Lupa') {
    newInterval = minLupa;
    newConsecutiveLancar = 0;
    newConsecutiveLupa += 1;
    if (newConsecutiveLupa >= 2 || currentStatus === 'Merah') {
      newStatus = 'Merah';
    } else {
      newStatus = 'Kuning';
    }
  }

  return {
    newStatus: newStatus,
    newInterval: newInterval,
    newConsecutiveLupa: newConsecutiveLupa,
    newConsecutiveLancar: newConsecutiveLancar,
    nextReviewStr: addDaysStr(newInterval),
    recoveryAchieved: recoveryAchieved
  };
}

/**
 * Update event-driven cache untuk satu unit Master Hafalan
 */
function updateMasterHafalanCache(masterId, quality, config) {
  const sheet = getSheet('Master_Hafalan');
  const data = readSheet_('Master_Hafalan', 12);

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(masterId)) {
      const currentStatus = data[i][7] || 'Hijau';          // Retention_Status_Cache (kolom 8)
      const currentInterval = data[i][9] || 1;              // Current_Interval_Hari (kolom 10)
      const consecutiveLupa = data[i][10] || 0;             // Consecutive_Lupa (kolom 11)
      const consecutiveLancar = data[i][11] || 0;           // Consecutive_Lancar (kolom 12)

      const result = calculateNextRetentionState(currentStatus, currentInterval, consecutiveLupa, consecutiveLancar, quality, config);

      // Update kolom 8-12 Master_Hafalan (Retention_Status_Cache .. Consecutive_Lancar).
      // Baris lama tanpa kolom ke-12 tetap aman: Sheets hanya menulis sel di kanan.
      sheet.getRange(i + 2, 8, 1, 5).setValues([[
        result.newStatus,
        result.nextReviewStr,
        result.newInterval,
        result.newConsecutiveLupa,
        result.newConsecutiveLancar
      ]]);

      return result;
    }
  }
  return null;
}

// ============================================================
// GAMIFIKASI & QUALIFYING ACTIVITY (Streak & XP)
// ============================================================

function awardXPAndQualifyingActivity(santriId, baseXP, bonusXP, isQualifying, recoveryAchieved, config) {
  const sheet = getSheet('Gamifikasi');
  const data = readSheet_('Gamifikasi', 6);
  const today = appTodayStr();

  let totalXPToAdd = baseXP + (bonusXP || 0);
  if (recoveryAchieved) {
    totalXPToAdd += Number(config.XP_BONUS_RECOVERY || 15);
  }

  let rowIndex = -1;
  let currentXP = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let lastQualifyingDate = '';

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(santriId)) {
      rowIndex = i + 2;
      currentXP = Number(data[i][1]) || 0;
      currentStreak = Number(data[i][3]) || 0;
      longestStreak = Number(data[i][4]) || 0;
      lastQualifyingDate = toDateStr(data[i][5]); // tahan terhadap sel bertipe Date
      break;
    }
  }

  const newXP = currentXP + totalXPToAdd;
  const newLevel = Math.floor(newXP / 100) + 1;

  // Logika Streak Terkunci (PRD Section 13.3)
  if (isQualifying) {
    if (lastQualifyingDate === today) {
      // Sudah qualifying hari ini, streak tidak bertambah lagi hari ini
    } else {
      const yesterdayStr = addDaysStr(-1);

      if (lastQualifyingDate === yesterdayStr) {
        currentStreak += 1;
      } else {
        currentStreak = 1; // Mulai streak baru
      }
      lastQualifyingDate = today;
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 2, 1, 5).setValues([[
      newXP,
      newLevel,
      currentStreak,
      longestStreak,
      lastQualifyingDate
    ]]);
  } else {
    sheet.appendRow([
      santriId,
      newXP,
      newLevel,
      currentStreak,
      longestStreak,
      lastQualifyingDate
    ]);
  }

  // Cek pencapaian badge
  checkMilestoneBadges(santriId, newXP, newLevel, currentStreak);

  return {
    xpAdded: totalXPToAdd,
    newXP: newXP,
    newLevel: newLevel,
    currentStreak: currentStreak
  };
}

function checkMilestoneBadges(santriId, xp, level, streak) {
  const badgeSheet = getSheet('Badge');
  const badgeData = readSheet_('Badge', 4);
  const existingBadges = new Set();

  for (let i = 0; i < badgeData.length; i++) {
    if (String(badgeData[i][1]) === String(santriId)) {
      existingBadges.add(String(badgeData[i][2]));
    }
  }

  const candidates = [];
  if (streak >= 3 && !existingBadges.has('Streak 3 Hari 🔥')) candidates.push('Streak 3 Hari 🔥');
  if (streak >= 7 && !existingBadges.has('Pejuang Istiqomah (7 Hari) 🌟')) candidates.push('Pejuang Istiqomah (7 Hari) 🌟');
  if (streak >= 30 && !existingBadges.has('Penjaga Kalamullah (30 Hari) 👑')) candidates.push('Penjaga Kalamullah (30 Hari) 👑');
  if (level >= 5 && !existingBadges.has('Level 5: Hafizh Tangguh 🛡️')) candidates.push('Level 5: Hafizh Tangguh 🛡️');
  if (xp >= 500 && !existingBadges.has('Kolektor 500 XP 💎')) candidates.push('Kolektor 500 XP 💎');

  const todayStr = appTodayStr();

  // Batch write: satu setValues untuk semua badge (bukan appendRow per badge).
  if (candidates.length > 0) {
    const rows = candidates.map(badgeName => [Utilities.getUuid(), santriId, badgeName, todayStr]);
    badgeSheet.getRange(badgeSheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  }
}

// ============================================================
// DAILY MISSION GENERATOR
// ============================================================

/**
 * Menghasilkan misi harian (Sabaq, Sabqi, Manzil) berdasarkan cache retention
 */
function generateDailyMissions(santriId, config) {
  const todayStr = appTodayStr();
  const ambangSabqi = Number(config.AMBANG_SABQI_HARI || 30);

  // Unit diambil dari indeks Master_Hafalan yang sudah dikelompokkan per santri
  // (satu kali baca untuk seluruh request, bukan satu kali per santri).
  const indexed = buildMasterIndex_()[santriId] || [];
  const units = indexed.map(function (u) {
    return {
      idMaster: u.idMaster,
      surah: u.surah,
      ayatMulai: u.ayatMulai,
      ayatAkhir: u.ayatAkhir,
      tglMulai: u.tglMulai,
      diffDays: diffDaysFrom(u.tglMulai),
      retentionStatus: u.retentionStatus || 'Hijau',
      nextReview: u.nextReview || todayStr,
      interval: u.interval || 1,
      consecutiveLupa: u.consecutiveLupa || 0,
      consecutiveLancar: u.consecutiveLancar || 0
    };
  });

  // Prioritas: Merah > Kuning > overdue > lebih tua.
  const priorityOf = (u) => {
    let score = 0;
    if (u.retentionStatus === 'Merah') score += 40;
    else if (u.retentionStatus === 'Kuning') score += 20;
    if (u.nextReview && u.nextReview < todayStr) score += 15;
    return score;
  };

  // 1. Sabaq: SEMUA hafalan yang disetorkan hari ini (diffDays <= 0). Jika tidak ada
  //    setoran baru, pakai unit paling baru agar santri tetap punya misi Sabaq.
  //    (Sebelumnya hanya diambil 1 unit dengan diffDays terendah sehingga setoran
  //    kedua/ketiga pada hari yang sama HILANG dari seluruh daftar misi.)
  const sabaqUnits = units
    .filter(u => u.diffDays <= 0)
    .sort((a, b) => priorityOf(b) - priorityOf(a));
  if (sabaqUnits.length === 0 && units.length > 0) {
    sabaqUnits.push(units.slice().sort((a, b) => a.diffDays - b.diffDays)[0]);
  }
  const sabaqIds = new Set(sabaqUnits.map(u => u.idMaster));

  // 2. Sabqi: hafalan umur 1..AMBANG_SABQI_HARI
  const sabqiUnits = units
    .filter(u => u.diffDays > 0 && u.diffDays <= ambangSabqi && !sabaqIds.has(u.idMaster))
    .sort((a, b) => priorityOf(b) - priorityOf(a) || b.diffDays - a.diffDays);

  // 3. Manzil: hafalan > AMBANG_SABQI_HARI, atau Merah/overdue yang belum masuk
  //    Sabaq/Sabqi — dijaga saling eksklusif agar tidak ada kartu misi dobel.
  const sabqiIds = new Set(sabqiUnits.map(u => u.idMaster));
  const manzilUnits = units
    .filter(u => (u.diffDays > ambangSabqi || u.retentionStatus === 'Merah' || (u.nextReview && u.nextReview <= todayStr)))
    .filter(u => !sabaqIds.has(u.idMaster) && !sabqiIds.has(u.idMaster))
    .sort((a, b) => priorityOf(b) - priorityOf(a) || b.diffDays - a.diffDays);

  // Konfirmasi hari ini dibaca dari sheet Murojaah.
  // Kunci = Jenis_Misi + Detail unit ("Surah (1-20)") => selesai PER UNIT.
  const murojaahData = readSheet_('Murojaah', 7);
  const completedKeys = new Set();

  for (let i = 0; i < murojaahData.length; i++) {
    const tgl = toDateStr(murojaahData[i][1]);
    if (String(murojaahData[i][2]) === String(santriId) && tgl === todayStr) {
      completedKeys.add(String(murojaahData[i][3] || '') + '|' + String(murojaahData[i][4] || '').trim());
    }
  }

  const isDone = (jenis, unit) => {
    const detail = unit.surah + ' (' + unit.ayatMulai + '-' + unit.ayatAkhir + ')';
    // Detail eksak, atau kompatibilitas data lama yang hanya menyimpan nama surah.
    return completedKeys.has(jenis + '|' + detail) || completedKeys.has(jenis + '|' + unit.surah);
  };

  return {
    // Sabaq berupa array (beberapa setoran bisa terjadi pada hari yang sama).
    // Klien lama yang hanya membaca objek tunggal tetap aman karena
    // dashboard-santri.js mendukung kedua bentuk.
    sabaq: sabaqUnits.slice(0, 3).map(u => Object.assign({}, u, {
      completed: isDone('Sabaq', u),
      xp: Number(config.XP_SABAQ || 5)
    })),
    sabqi: sabqiUnits.slice(0, 3).map(u => Object.assign({}, u, {
      completed: isDone('Sabqi', u),
      xp: Number(config.XP_SABQI || 8)
    })),
    manzil: manzilUnits.slice(0, 3).map(u => Object.assign({}, u, {
      completed: isDone('Manzil', u),
      xp: Number(config.XP_MANZIL || 12)
    }))
  };
}

// ============================================================
// DASHBOARD ENDPOINTS
// ============================================================

// --- 1. USTAZ DASHBOARD ---
/**
 * Mengurutkan aktivitas lintas sheet tanpa mengubah data sumber.
 * Timestamp lebih presisi daripada tanggal setoran; bila tidak tersedia,
 * tanggal yang dicatat dipakai sebagai fallback.
 */
function activityMillis_(timestamp, dateValue) {
  const candidates = [timestamp, dateValue];
  for (let i = 0; i < candidates.length; i++) {
    const value = candidates[i];
    if (value === null || value === undefined || value === '') continue;
    const parsed = (Object.prototype.toString.call(value) === '[object Date]')
      ? value.getTime()
      : new Date(value).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

/** Indeks setoran terakhir per santri untuk matriks Ustaz (satu kali baca). */
function buildLatestSetoranIndex_(hafalanRows) {
  const latestBySantri = Object.create(null);
  const rows = Array.isArray(hafalanRows) ? hafalanRows : [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const santriId = String(row[2] || '');
    if (!santriId) continue;
    const sortTime = activityMillis_(row[9], row[1]);
    if (latestBySantri[santriId] && latestBySantri[santriId]._sortTime > sortTime) continue;
    latestBySantri[santriId] = {
      tgl: toDateStr(row[1] || row[9]),
      surah: String(row[3] || ''),
      ayatMulai: Number(row[4]) || 0,
      ayatAkhir: Number(row[5]) || 0,
      nilai: String(row[6] || ''),
      _sortTime: sortTime
    };
  }
  Object.keys(latestBySantri).forEach(function (id) { delete latestBySantri[id]._sortTime; });
  return latestBySantri;
}

/**
 * Ringkasan satu aktivitas terakhir dari sumber fakta Hafalan, Murojaah,
 * dan Riwayat_Tes. Hanya menampilkan catatan yang ID-nya cocok persis dengan
 * santri; fungsi ini tidak melakukan mapping atau migrasi ID.
 */
function latestStudentActivity_(santriId, hafalanRows, murojaahRows, testRows) {
  const candidates = [];
  const wantedId = String(santriId || '');
  if (!wantedId) return null;

  function add(rows, studentIndex, dateIndex, timestampIndex, buildEvent) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i];
      if (String(row[studentIndex] || '') !== wantedId) continue;
      const sortTime = activityMillis_(timestampIndex >= 0 ? row[timestampIndex] : '', row[dateIndex]);
      const event = buildEvent(row);
      if (!event || !event.detail) continue;
      event.tgl = toDateStr(row[dateIndex] || (timestampIndex >= 0 ? row[timestampIndex] : ''));
      event._sortTime = sortTime;
      candidates.push(event);
    }
  }

  add(hafalanRows, 2, 1, 9, function (row) {
    const ayat = Number(row[4]) && Number(row[5])
      ? `ayat ${Number(row[4])}-${Number(row[5])}` : '';
    return {
      type: 'Setoran',
      title: 'Setoran hafalan',
      detail: [String(row[3] || ''), ayat].filter(Boolean).join(' • '),
      outcome: row[6] ? `Nilai ${String(row[6])}` : '',
      actor: 'Ustaz'
    };
  });
  add(murojaahRows, 2, 1, 6, function (row) {
    return {
      type: 'Murojaah',
      title: `Murojaah ${String(row[3] || '').trim()}`.trim(),
      detail: String(row[4] || ''),
      outcome: 'Sesi selesai dicatat',
      actor: String(row[5] || 'Santri')
    };
  });
  add(testRows, 2, 1, -1, function (row) {
    const ayat = Number(row[5]) && Number(row[6])
      ? `ayat ${Number(row[5])}-${Number(row[6])}` : '';
    return {
      type: 'Tes',
      title: 'Evaluasi hafalan',
      detail: [String(row[4] || ''), ayat].filter(Boolean).join(' • '),
      outcome: row[7] ? `Hasil ${String(row[7])}` : '',
      actor: String(row[8] || 'Penguji')
    };
  });

  if (!candidates.length) return null;
  candidates.sort(function (a, b) { return b._sortTime - a._sortTime; });
  const latest = candidates[0];
  delete latest._sortTime;
  return latest;
}

/** Ringkasan 7 hari Orang Tua; menghitung fakta histori tanpa mengubah sheet. */
function buildWeeklySummary_(santriId, hafalanRows, murojaahRows, testRows) {
  const endDate = appTodayStr();
  const startDate = addDaysStr(-6);
  const activeDates = Object.create(null);
  const summary = {
    startDate: startDate,
    endDate: endDate,
    activeDays: 0,
    setoran: 0,
    murojaah: 0,
    evaluasi: 0,
    hasilTes: { Lancar: 0, Tersendat: 0, Lupa: 0 },
    totalAktivitas: 0
  };
  const wantedId = String(santriId || '');
  if (!wantedId) return summary;

  function count(rows, dateIndex, kind, resultIndex) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i];
      if (String(row[2] || '') !== wantedId) continue;
      const date = toDateStr(row[dateIndex]);
      if (!date || date < startDate || date > endDate) continue;
      summary[kind]++;
      summary.totalAktivitas++;
      activeDates[date] = true;
      if (kind === 'evaluasi' && resultIndex >= 0) {
        const result = String(row[resultIndex] || '');
        if (Object.prototype.hasOwnProperty.call(summary.hasilTes, result)) summary.hasilTes[result]++;
      }
    }
  }

  count(hafalanRows, 1, 'setoran', -1);
  count(murojaahRows, 1, 'murojaah', -1);
  count(testRows, 1, 'evaluasi', 7);
  summary.activeDays = Object.keys(activeDates).length;
  return summary;
}

function ustazGetDashboard(session) {
  if (session.role !== 'ustaz') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Ustaz' };
  }

  // Cache pendek (30 dtk) + versi data: pembacaan berulang tidak dihitung ulang,
  // tetapi setiap penulisan menaikkan versi sehingga data selalu segar.
  const cacheKey = dashCacheKey_('ustaz', session.userId);
  const cached = dashCacheGet_(cacheKey);
  if (cached) return cached;

  // Setiap sumber data dibaca SEKALI dengan jumlah kolom minimal (dulu: 4 kali
  // getDataRange() penuh + pemindaian Master_Hafalan per santri).
  const santriRows = readSheet_('Santri', 4);
  const masterIndex = buildMasterIndex_();
  const targetRows = readSheet_('Target', 6);
  const gamifRows = readSheet_('Gamifikasi', 6);
  const hafalanRows = readSheet_('Hafalan', 10);
  const lastSetoranBySantri = buildLatestSetoranIndex_(hafalanRows);

  const todayStr = appTodayStr();
  const currentMonthStr = todayStr.slice(0, 7);

  // Indeks gamifikasi & target bulan berjalan (O(baris) sekali).
  const gamifBySantri = {};
  for (let i = 0; i < gamifRows.length; i++) {
    const r = gamifRows[i];
    const id = String(r[0] || '');
    if (!id) continue;
    gamifBySantri[id] = {
      xp: Number(r[1]) || 0,
      level: Number(r[2]) || 1,
      currentStreak: Number(r[3]) || 0,
      longestStreak: Number(r[4]) || 0
    };
  }

  const targetBySantri = {};
  for (let i = 0; i < targetRows.length; i++) {
    const r = targetRows[i];
    const id = String(r[2] || '');
    if (!id) continue;
    const bulan = String(r[1] || '');
    if (!bulan.startsWith(currentMonthStr)) continue;
    if (targetBySantri[id]) continue; // target pertama bulan ini (perilaku lama)
    targetBySantri[id] = {
      idTarget: String(r[0]),
      bulan: bulan,
      surah: String(r[3]),
      ayatMulai: Number(r[4]) || 0,
      ayatAkhir: Number(r[5]) || 0
    };
  }

  // Pencocokan nama surah yang toleran tanda baca/apostrof (dipakai progres target).
  const norm = function (v) { return String(v || '').replace(/[^a-z0-9]/gi, '').toLowerCase(); };

  const santriList = [];

  for (let i = 0; i < santriRows.length; i++) {
    const idSantri = String(santriRows[i][0] || '');
    if (!idSantri) continue;
    const namaSantri = String(santriRows[i][1] || '');
    const idUstaz = String(santriRows[i][2] || '');
    const statusSantri = String(santriRows[i][3] || '');

    // Filter kelompok: hanya santri bimbingan ustaz ini (PRD Section 16).
    // Santri dengan ID_Ustaz kosong tetap ditampilkan agar data hasil migrasi
    // tidak hilang dari matriks ustaz.
    const isMySantri = !idUstaz || idUstaz === session.userId || (!!session.idTerkait && idUstaz === session.idTerkait);
    if (!isMySantri) continue;

    const units = masterIndex[idSantri] || [];
    let countHijau = 0;
    let countKuning = 0;
    let countMerah = 0;
    let overdueCount = 0;
    let lastUnit = null;
    let lastUnitAge = Infinity;

    for (let j = 0; j < units.length; j++) {
      const u = units[j];
      if (u.retentionStatus === 'Hijau') countHijau++;
      else if (u.retentionStatus === 'Kuning') countKuning++;
      else if (u.retentionStatus === 'Merah') countMerah++;

      if (u.nextReview && u.nextReview < todayStr) overdueCount++;

      const age = diffDaysFrom(u.tglMulai);
      if (age < lastUnitAge) {
        lastUnitAge = age;
        lastUnit = {
          surah: u.surah,
          ayatMulai: u.ayatMulai,
          ayatAkhir: u.ayatAkhir,
          tglMulai: toDateStr(u.tglMulai),
          retentionStatus: u.retentionStatus
        };
      }
    }

    const totalHafalan = units.length;
    const gamif = gamifBySantri[idSantri] || { xp: 0, level: 1, currentStreak: 0, longestStreak: 0 };
    const xp = gamif.xp;
    const level = gamif.level;
    const streak = gamif.currentStreak;
    const longestStreak = gamif.longestStreak;

    const currentTarget = targetBySantri[idSantri] || null;

    // Progres capaian target bulan ini (untuk Notifikasi Target Ustaz).
    let targetProgress = null;
    if (currentTarget) {
      const tMulai = Number(currentTarget.ayatMulai) || 0;
      const tAkhir = Number(currentTarget.ayatAkhir) || 0;
      const tTotal = Math.max(0, tAkhir - tMulai + 1);
      const covered = {};
      for (let n = 0; n < units.length; n++) {
        if (norm(units[n].surah) !== norm(currentTarget.surah)) continue;
        const a = Math.max(tMulai, Number(units[n].ayatMulai) || 0);
        const b = Math.min(tAkhir, Number(units[n].ayatAkhir) || 0);
        for (let x = a; x <= b; x++) covered[x] = true;
      }
      const doneCount = Object.keys(covered).length;
      targetProgress = {
        covered: doneCount,
        total: tTotal,
        percent: tTotal ? Math.min(100, Math.round((doneCount / tTotal) * 100)) : 0
      };
    }

    // Auto-flag detection
    const flags = [];
    if (countMerah > 0) flags.push('Kritis: ' + countMerah + ' unit hafalan status Merah');
    if (overdueCount >= 2) flags.push('Overdue: ' + overdueCount + ' jadwal review terlewat');
    if (streak === 0 && totalHafalan > 0) flags.push('Streak terputus');

    santriList.push({
      idSantri: idSantri,
      nama: namaSantri,
      status: statusSantri,
      totalHafalan: totalHafalan,
      retention: {
        hijau: countHijau,
        kuning: countKuning,
        merah: countMerah,
        overdue: overdueCount
      },
      gamifikasi: {
        xp: xp,
        level: level,
        // currentStreak adalah nama field yang dibaca dashboard-ustaz.js;
        // "streak" tetap dikirim agar klien versi lama tidak menampilkan 0.
        currentStreak: streak,
        longestStreak: longestStreak,
        streak: streak
      },
      target: currentTarget,
      targetProgress: targetProgress,
      lastUnit: lastUnit,
      lastSetoran: lastSetoranBySantri[idSantri] || null,
      flags: flags
    });
  }

  const result = {
    success: true,
    ustazName: session.nama,
    santriList: santriList,
    stats: {
      totalSantri: santriList.length,
      totalMerah: santriList.reduce(function (acc, s) { return acc + s.retention.merah; }, 0),
      totalKuning: santriList.reduce(function (acc, s) { return acc + s.retention.kuning; }, 0),
      totalHijau: santriList.reduce(function (acc, s) { return acc + s.retention.hijau; }, 0),
      flaggedSantri: santriList.filter(function (s) { return s.flags.length > 0; }).length
    }
  };

  dashCachePut_(cacheKey, result, DASH_CACHE_TTL_SEC);
  return result;
}

// Ustaz Add Setoran
function ustazAddSetoran(session, payload) {
  if (session.role !== 'ustaz') return { success: false, code: 'E_FORBIDDEN', message: 'Unauthorized' };

  // Otorisasi (PRD Section 16): ustaz hanya boleh mencatat setoran untuk santri
  // kelompoknya. Sebelumnya cek ini hanya ada di ustazGetSantriDetail sehingga
  // ID santri mana pun bisa dikirim dari klien (celah IDOR).
  if (!payload || !isSantriInUstazGroup(session, payload.idSantri)) {
    return { success: false, code: 'E_FORBIDDEN', message: 'Santri ini bukan bagian dari kelompok bimbingan Anda' };
  }

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return busyResponse();
  }

  try {
    const config = getConfigMap();
    const hafalanSheet = getSheet('Hafalan');
    const masterSheet = getSheet('Master_Hafalan');
    const todayStr = appTodayStr();
    const timestamp = new Date().toISOString();
    const idHafalan = 'HAF-' + Utilities.getUuid().slice(0, 8);

    // 1. Simpan ke sheet Hafalan
    hafalanSheet.appendRow([
      idHafalan,
      payload.tgl || todayStr,
      payload.idSantri,
      payload.surah,
      Number(payload.ayatMulai),
      Number(payload.ayatAkhir),
      payload.nilai || 'A',
      payload.catatan || '',
      payload.idTarget || '',
      timestamp
    ]);

    // 2. Tambah / Update Master_Hafalan
    const masterData = readSheet_('Master_Hafalan', 12); // kolom minimal; index 0 = baris sheet ke-2
    let existingIndex = -1;

    for (let i = 0; i < masterData.length; i++) {
      if (
        String(masterData[i][1]) === String(payload.idSantri) &&
        String(masterData[i][2]).toLowerCase() === String(payload.surah).toLowerCase() &&
        Number(masterData[i][3]) === Number(payload.ayatMulai) &&
        Number(masterData[i][4]) === Number(payload.ayatAkhir)
      ) {
        existingIndex = i + 2; // +2: readSheet_ tanpa header, getRange 1-based
        break;
      }
    }

    // Nilai setoran (A/B+/B/C) diterjemahkan ke kualitas evaluasi, lalu dipakai
    // oleh retention engine — bukan selalu dipaksa "Hijau" seperti sebelumnya.
    const quality = payload.nilai === 'A' || payload.nilai === 'B+' ? 'Lancar' : (payload.nilai === 'C' ? 'Lupa' : 'Tersendat');

    if (existingIndex > 0) {
      // Update cache unit yang sudah ada memakai rumus SM-2-lite.
      const row = masterData[existingIndex - 2];
      const state = calculateNextRetentionState(
        row[7] || 'Hijau',
        row[9] || 1,
        row[10] || 0,
        row[11] || 0,
        quality,
        config
      );
      masterSheet.getRange(existingIndex, 8, 1, 5).setValues([[
        state.newStatus,
        state.nextReviewStr,
        state.newInterval,
        state.newConsecutiveLupa,
        state.newConsecutiveLancar
      ]]);
    } else {
      const idMaster = 'MST-' + Utilities.getUuid().slice(0, 8);
      const initialState = (quality === 'Lancar')
        ? { newStatus: 'Hijau', newInterval: 2, newConsecutiveLupa: 0, newConsecutiveLancar: 0, nextReviewStr: addDaysStr(2) }
        : calculateNextRetentionState('Hijau', 2, 0, 0, quality, config);
      masterSheet.appendRow([
        idMaster,
        payload.idSantri,
        payload.surah,
        Number(payload.ayatMulai),
        Number(payload.ayatAkhir),
        todayStr,
        'Aktif',
        initialState.newStatus,
        initialState.nextReviewStr,
        initialState.newInterval,
        initialState.newConsecutiveLupa,
        initialState.newConsecutiveLancar
      ]);
    }

    // 3. Award XP (base Sabaq + bonus bila Lancar).
    //    isQualifying=false: PRD 13.3 hanya menghitung misi murojaah yang
    //    dikonfirmasi santri sebagai qualifying activity, bukan input ustaz.
    const bonusXP = quality === 'Lancar' ? Number(config.XP_BONUS_LANCAR || 5) : 0;
    const gamifResult = awardXPAndQualifyingActivity(payload.idSantri, Number(config.XP_SABAQ || 5), bonusXP, false, false, config);

    // 4. Catat notifikasi untuk Santri
    const notifSheet = getSheet('Notifikasi');
    notifSheet.appendRow([
      Utilities.getUuid(),
      payload.idSantri,
      'Setoran Baru',
      `Ustaz ${session.nama} mencatat setoran baru: ${payload.surah} (${payload.ayatMulai}-${payload.ayatAkhir}) dengan nilai ${payload.nilai}`,
      todayStr,
      'Belum'
    ]);

    return {
      success: true,
      message: 'Setoran berhasil dicatat!',
      gamifikasi: gamifResult
    };
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

// Ustaz Save Target
function ustazSaveTarget(session, payload) {
  if (session.role !== 'ustaz') return { success: false, code: 'E_FORBIDDEN', message: 'Unauthorized' };

  // Otorisasi (PRD Section 16): target hanya untuk santri kelompok ustaz ini.
  if (!payload || !isSantriInUstazGroup(session, payload.idSantri)) {
    return { success: false, code: 'E_FORBIDDEN', message: 'Santri ini bukan bagian dari kelompok bimbingan Anda' };
  }

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return busyResponse();
  }

  try {
    const targetSheet = getSheet('Target');
    const data = readSheet_('Target', 6);
    const bulan = payload.bulan || appTodayStr().slice(0, 7);

    let updated = false;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][2]) === String(payload.idSantri) && String(data[i][1]) === bulan) {
        targetSheet.getRange(i + 2, 4, 1, 3).setValues([[
          payload.surah,
          Number(payload.ayatMulai),
          Number(payload.ayatAkhir)
        ]]);
        updated = true;
        break;
      }
    }

    if (!updated) {
      targetSheet.appendRow([
        'TGT-' + Utilities.getUuid().slice(0, 8),
        bulan,
        payload.idSantri,
        payload.surah,
        Number(payload.ayatMulai),
        Number(payload.ayatAkhir)
      ]);
    }

    return { success: true, message: 'Target bulanan berhasil disimpan' };
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

// Ustaz Send Feedback
// Temuan v4.2: fungsi ini menulis ke sheet 'Feedback' yang TIDAK PERNAH dibaca
// oleh dashboard Santri, sehingga feedback ustaz "hilang" (di Mode Demo tampak
// berhasil karena mock menulis ke notifications). Sejak v4.3 feedback ditulis
// ke DUA tempat: sheet Feedback (arsip pedagogis per setoran) DAN sheet
// Notifikasi (yang benar-benar dibaca dashboard Santri) — sama seperti
// ortuSendApresiasi.
function ustazSendFeedback(session, payload) {
  if (session.role !== 'ustaz') return { success: false, code: 'E_FORBIDDEN', message: 'Unauthorized' };
  if (!payload || !payload.pesan) {
    return { success: false, code: 'E_VALIDATION', message: 'Pesan feedback wajib diisi' };
  }

  // Otorisasi (PRD Section 16): ustaz hanya untuk santri kelompoknya.
  if (!isSantriInUstazGroup(session, payload.idSantri)) {
    return { success: false, code: 'E_FORBIDDEN', message: 'Santri ini bukan bagian dari kelompok bimbingan Anda' };
  }

  return withLock(function () {
    const feedbackSheet = getSheet('Feedback');
    const notifSheet = getSheet('Notifikasi');
    const todayStr = appTodayStr();

    feedbackSheet.appendRow([
      Utilities.getUuid(),
      payload.idSantri,
      payload.idHafalan || '',
      session.userId,
      payload.pesan,
      todayStr,
      'Belum'
    ]);

    // Baris inilah yang dibaca santriGetDashboard(). Tipe memakai awalan
    // 'Feedback Ustaz' agar ikon 📖 di dashboard santri otomatis terpakai.
    notifSheet.appendRow([
      Utilities.getUuid(),
      payload.idSantri,
      'Feedback Ustaz',
      `Ustaz ${session.nama}: "${payload.pesan}"`,
      todayStr,
      'Belum'
    ]);

    return { success: true, message: 'Feedback berhasil dikirim ke santri' };
  });
}

// Ustaz Send Broadcast
function ustazSendBroadcast(session, payload) {
  if (session.role !== 'ustaz') return { success: false, code: 'E_FORBIDDEN', message: 'Unauthorized' };
  if (!payload || !payload.pesan) return { success: false, message: 'Pesan broadcast wajib diisi' };

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return busyResponse();
  }

  try {
    const notifSheet = getSheet('Notifikasi');
    const santriData = readSheet_('Santri', 4);
    const todayStr = appTodayStr();

    // Batch write: susun semua baris dulu, lalu tulis sekali (setValues).
    // Sebelumnya appendRow dipanggil per santri — penyebab broadcast lambat /
    // timeout ketika jumlah santri banyak.
    const rows = [];
    let skipped = 0;
    for (let i = 0; i < santriData.length; i++) {
      const idSantri = String(santriData[i][0]);
      if (!idSantri) continue;

      // v4.3: broadcast dibatasi ke kelompok bimbingan ustaz ini (PRD Section 16).
      // Santri dengan ID_Ustaz kosong tetap diikutkan (aturan sama dengan
      // isSantriInUstazGroup) supaya data migrasi tidak kehilangan pengumuman.
      const idUstazSantri = String(santriData[i][2] || '');
      const inGroup = !idUstazSantri || idUstazSantri === session.userId ||
        (!!session.idTerkait && idUstazSantri === session.idTerkait);
      if (!inGroup) { skipped++; continue; }

      rows.push([
        Utilities.getUuid(),
        idSantri,
        'Broadcast Ustaz',
        `Pesan dari Ustaz ${session.nama}: "${payload.pesan}"`,
        todayStr,
        'Belum'
      ]);
    }
    if (rows.length === 0) {
      return { success: false, code: 'E_VALIDATION', message: 'Tidak ada santri dalam kelompok bimbingan Anda untuk dikirimi pesan.' };
    }
    if (rows.length > 0) {
      notifSheet.getRange(notifSheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    }

    return { success: true, message: 'Pesan broadcast terkirim ke ' + rows.length + ' santri bimbingan Anda' + (skipped > 0 ? ' (' + skipped + ' santri di luar kelompok dilewati)' : '') };
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

/**
 * Cek relasi kepemilikan santri terhadap ustaz — satu sumber kebenaran untuk
 * semua endpoint yang menerima idSantri dari client (mencegah IDOR).
 * Santri dengan ID_Ustaz kosong dianggap belum dibagi (tetap boleh dibuka
 * ustaz agar data hasil migrasi tidak tersembunyi).
 */
function isSantriInUstazGroup(session, santriId) {
  const santriSheet = getSpreadsheet().getSheetByName('Santri');
  if (!santriSheet) return false;
  const lastRow = santriSheet.getLastRow();
  if (lastRow < 2) return false;
  // 4 kolom saja (bukan seluruh grid) — fungsi ini dipanggil di setiap aksi tulis.
  const data = santriSheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(santriId)) {
      const idUstaz = String(data[i][2] || '');
      return !idUstaz || idUstaz === session.userId || (!!session.idTerkait && idUstaz === session.idTerkait);
    }
  }
  return false;
}

// Ustaz Get Santri Detail
function ustazGetSantriDetail(session, santriId) {
  if (!santriId) return { success: false, code: 'E_VALIDATION', message: 'ID santri wajib dikirim' };

  // Otorisasi (PRD Section 16): ustaz hanya untuk santri kelompoknya,
  // santri hanya untuk datanya sendiri.
  const isSantriSelf = session.role === 'santri' && String(santriId) === String(session.userId);
  if (!isSantriSelf && session.role !== 'ustaz') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses ditolak' };
  }
  if (session.role === 'ustaz' && !isSantriInUstazGroup(session, santriId)) {
    return { success: false, code: 'E_FORBIDDEN', message: 'Santri ini bukan bagian dari kelompok bimbingan Anda' };
  }

  // Kolom minimal + indeks Master_Hafalan (satu kali baca per request).
  // Hanya setoran yang dibutuhkan di sini; Riwayat_Tes & Murojaah tidak dibaca
  // agar endpoint ini tidak memuat I/O yang tak terpakai.
  const hafalanData = readSheet_('Hafalan', 10);

  const units = (buildMasterIndex_()[santriId] || []).map(function (u) {
    return {
      idMaster: u.idMaster,
      surah: u.surah,
      ayatMulai: u.ayatMulai,
      ayatAkhir: u.ayatAkhir,
      tglMulai: u.tglMulai,
      status: u.status,
      retentionStatus: u.retentionStatus || 'Hijau',
      nextReview: u.nextReview,
      interval: u.interval,
      consecutiveLupa: u.consecutiveLupa
    };
  });

  const setoranHistory = [];
  for (let i = 0; i < hafalanData.length; i++) {
    if (String(hafalanData[i][2]) === String(santriId)) {
      setoranHistory.push({
        idHafalan: hafalanData[i][0],
        tgl: hafalanData[i][1],
        surah: hafalanData[i][3],
        ayatMulai: hafalanData[i][4],
        ayatAkhir: hafalanData[i][5],
        nilai: hafalanData[i][6],
        catatan: hafalanData[i][7]
      });
    }
  }

  return {
    success: true,
    santriId: santriId,
    units: units,
    setoranHistory: setoranHistory.slice(-15).reverse()
  };
}

// --- 2. SANTRI DASHBOARD ---
function santriGetDashboard(session) {
  const santriId = session.role === 'santri' ? session.userId : session.idTerkait;
  if (!santriId) {
    return { success: false, code: 'E_VALIDATION', message: 'Akun ini tidak terhubung dengan data santri (ID_Terkait kosong)' };
  }

  // Cache pendek + versi data: flashcard/aksi tulis menaikkan versi, sehingga
  // pemuatan berulang tidak dihitung ulang dari nol.
  const cacheKey = dashCacheKey_('santri', santriId);
  const cached = dashCacheGet_(cacheKey);
  if (cached) return cached;

  const config = getConfigMap();

  // 1. Daily Missions (memakai indeks Master_Hafalan, sekali baca)
  const missions = generateDailyMissions(santriId, config);

  // 2. Gamifikasi
  let gamifikasi = { xp: 0, level: 1, currentStreak: 0, longestStreak: 0, lastQualifyingDate: '' };
  const gamifRows = readSheet_('Gamifikasi', 6);
  for (let i = 0; i < gamifRows.length; i++) {
    if (String(gamifRows[i][0]) === String(santriId)) {
      gamifikasi = {
        xp: Number(gamifRows[i][1]) || 0,
        level: Number(gamifRows[i][2]) || 1,
        currentStreak: Number(gamifRows[i][3]) || 0,
        longestStreak: Number(gamifRows[i][4]) || 0,
        lastQualifyingDate: gamifRows[i][5] || ''
      };
      break;
    }
  }

  // 3. Badges
  const badgeRows = readSheet_('Badge', 4);
  const badges = [];
  for (let i = 0; i < badgeRows.length; i++) {
    if (String(badgeRows[i][1]) === String(santriId)) {
      badges.push({ idBadge: badgeRows[i][0], nama: badgeRows[i][2], tgl: badgeRows[i][3] });
    }
  }

  // 4. Notifications & Feedbacks
  const notifRows = readSheet_('Notifikasi', 6);
  const notifications = [];
  for (let i = 0; i < notifRows.length; i++) {
    if (String(notifRows[i][1]) === String(santriId)) {
      notifications.push({
        idNotif: notifRows[i][0],
        tipe: notifRows[i][2],
        pesan: notifRows[i][3],
        tgl: notifRows[i][4],
        dibaca: notifRows[i][5] === 'Sudah'
      });
    }
  }

  // 5. Activity Heatmap (30 hari terakhir) — dari log Murojaah.
  const murojaahRows = readSheet_('Murojaah', 7);
  const activityMap = {};
  for (let i = 0; i < murojaahRows.length; i++) {
    if (String(murojaahRows[i][2]) === String(santriId)) {
      const tgl = toDateStr(murojaahRows[i][1]);
      if (tgl) activityMap[tgl] = (activityMap[tgl] || 0) + 1;
    }
  }

  // Ringkasan aktivitas faktual untuk menjawab "apa yang terakhir dilakukan?".
  // Sumber setoran, murojaah, dan tes tetap histori terpisah di sheet masing-masing.
  const hafalanRows = readSheet_('Hafalan', 10);
  const testRows = readSheet_('Riwayat_Tes', 9);
  const lastActivity = latestStudentActivity_(santriId, hafalanRows, murojaahRows, testRows);

  const result = {
    success: true,
    nama: session.nama,
    santriId: santriId,
    missions: missions,
    gamifikasi: gamifikasi,
    badges: badges,
    notifications: notifications.slice(-10).reverse(),
    activityMap: activityMap,
    lastActivity: lastActivity
  };

  dashCachePut_(cacheKey, result, SANTRI_CACHE_TTL_SEC);
  return result;
}

// Santri Confirm Murojaah
function santriConfirmMurojaah(session, payload) {
  // Otorisasi: hanya santri (atau admin) yang boleh mengonfirmasi murojaah.
  if (session.role !== 'santri' && session.role !== 'admin') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Santri' };
  }

  const santriId = session.role === 'santri' ? session.userId : (payload.idSantri || session.idTerkait);
  if (!santriId) {
    return { success: false, message: 'ID santri tidak ditemukan' };
  }  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return busyResponse();
  }

  try {
    const config = getConfigMap();
    const murojaahSheet = getSheet('Murojaah');
    const todayStr = appTodayStr();
    const timestamp = new Date().toISOString();

    // 1. Simpan ke sheet Murojaah.
    //    Detail memakai rentang ayat dari client (bukan default 1-10) karena
    //    kolom Detail dipakai untuk menandai misi selesai PER UNIT.
    const ayatMulai = Number(payload.ayatMulai) || 1;
    const ayatAkhir = Number(payload.ayatAkhir) || ayatMulai;
    murojaahSheet.appendRow([
      'MUR-' + Utilities.getUuid().slice(0, 8),
      todayStr,
      santriId,
      payload.jenisMisi, // Sabaq, Sabqi, Manzil
      `${payload.surah || ''} (${ayatMulai}-${ayatAkhir})`,
      session.nama,
      timestamp
    ]);

    // 2. Update retention cache untuk unit terkait jika ada idMaster
    let recoveryAchieved = false;
    if (payload.idMaster) {
      const cacheRes = updateMasterHafalanCache(payload.idMaster, payload.kualitas || 'Lancar', config);
      if (cacheRes && cacheRes.recoveryAchieved) {
        recoveryAchieved = true;
      }
    }

    // 3. Award XP & Qualifying Streak
    let baseXP = Number(config.XP_SABAQ || 5);
    if (payload.jenisMisi === 'Sabqi') baseXP = Number(config.XP_SABQI || 8);
    if (payload.jenisMisi === 'Manzil') baseXP = Number(config.XP_MANZIL || 12);

    const bonusXP = payload.kualitas === 'Lancar' ? Number(config.XP_BONUS_LANCAR || 5) : 0;
    const gamifResult = awardXPAndQualifyingActivity(santriId, baseXP, bonusXP, true, recoveryAchieved, config);

    return {
      success: true,
      message: `Alhamdulillah! Murojaah ${payload.jenisMisi} selesai (+${gamifResult.xpAdded} XP)`,
      gamifikasi: gamifResult
    };
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

// Santri Submit Flashcard
// v4.3: dibungkus withLock(). Ini penulisan PALING SERING di aplikasi (1x per
// kartu flashcard) dan menyentuh Master_Hafalan + Gamifikasi + Badge, sehingga
// tanpa lock bisa saling menimpa / menghasilkan XP tidak konsisten.
function santriSubmitFlashcard(session, payload) {
  if (session.role !== 'santri' && session.role !== 'admin') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Santri' };
  }

  const santriId = session.role === 'santri' ? session.userId : session.idTerkait;
  if (!santriId) {
    return { success: false, code: 'E_VALIDATION', message: 'ID santri tidak ditemukan' };
  }

  return withLock(function () {
    const config = getConfigMap();

    let recoveryAchieved = false;
    if (payload && payload.idMaster) {
      const res = updateMasterHafalanCache(payload.idMaster, payload.isCorrect ? 'Lancar' : 'Tersendat', config);
      if (res && res.recoveryAchieved) recoveryAchieved = true;
    }

    const baseXP = (payload && payload.isCorrect) ? 5 : 1;
    // isQualifying=false: flashcard bukan misi Sabaq/Sabqi/Manzil, jadi sesuai
    // PRD 13.3 jawaban flashcard menambah XP tetapi TIDAK menambah streak.
    const gamifResult = awardXPAndQualifyingActivity(santriId, baseXP, 0, false, recoveryAchieved, config);

    return {
      success: true,
      message: (payload && payload.isCorrect) ? 'Jawaban Benar! +5 XP' : 'Tetap Semangat! +1 XP',
      gamifikasi: gamifResult
    };
  });
}

function markNotificationRead(session, notifId) {
  if (!notifId) return { success: false, code: 'E_VALIDATION', message: 'ID notifikasi wajib dikirim' };

  return withLock(function () {
    const notifSheet = getSheet('Notifikasi');
    const data = readSheet_('Notifikasi', 6);

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(notifId)) {
        // Otorisasi: notifikasi hanya boleh ditandai oleh pemiliknya.
        const owner = String(data[i][1]);
        const isOwner = owner === String(session.userId) || (!!session.idTerkait && owner === String(session.idTerkait));
        if (!isOwner) {
          return { success: false, code: 'E_FORBIDDEN', message: 'Notifikasi ini bukan milik akun Anda' };
        }
        notifSheet.getRange(i + 2, 6).setValue('Sudah');
        return { success: true };
      }
    }
    return { success: false, code: 'E_VALIDATION', message: 'Notifikasi tidak ditemukan' };
  });
}

// --- 3. ORTU DASHBOARD & SMART RANDOM TEST ---

function ortuGetDashboard(session) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, code: 'E_VALIDATION', message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }

  const cacheKey = dashCacheKey_('ortu', session.userId + ':' + santriId);
  const cached = dashCacheGet_(cacheKey);
  if (cached) return cached;

  // Nama ananda
  let santriName = 'Ananda';
  const santriRows = readSheet_('Santri', 4);
  for (let i = 0; i < santriRows.length; i++) {
    if (String(santriRows[i][0]) === String(santriId)) {
      santriName = String(santriRows[i][1] || 'Ananda');
      break;
    }
  }

  // Retention breakdown + daftar unit (dari indeks: Master_Hafalan dibaca sekali)
  const units = buildMasterIndex_()[santriId] || [];
  let countHijau = 0;
  let countKuning = 0;
  let countMerah = 0;
  const unitList = [];
  let eligibleTestCount = 0;

  for (let i = 0; i < units.length; i++) {
    const status = units[i].retentionStatus || 'Hijau';
    const testEligible = diffDaysFrom(units[i].tglMulai) >= 1;
    if (testEligible) eligibleTestCount++;
    if (status === 'Hijau') countHijau++;
    else if (status === 'Kuning') countKuning++;
    else if (status === 'Merah') countMerah++;

    unitList.push({
      idMaster: units[i].idMaster,
      surah: units[i].surah,
      ayatMulai: units[i].ayatMulai,
      ayatAkhir: units[i].ayatAkhir,
      tglMulai: toDateStr(units[i].tglMulai),
      retentionStatus: status,
      nextReview: units[i].nextReview,
      testEligible: testEligible
    });
  }

  // Gamifikasi
  let streak = 0;
  let xp = 0;
  let level = 1;
  let longestStreak = 0;
  const gamifRows = readSheet_('Gamifikasi', 6);
  for (let i = 0; i < gamifRows.length; i++) {
    if (String(gamifRows[i][0]) === String(santriId)) {
      xp = Number(gamifRows[i][1]) || 0;
      level = Number(gamifRows[i][2]) || 1;
      streak = Number(gamifRows[i][3]) || 0;
      longestStreak = Number(gamifRows[i][4]) || 0;
      break;
    }
  }

  // Riwayat tes (maks 100 terbaru, urut terbaru lebih dahulu)
  const testHistory = [];
  const tesRows = readSheet_('Riwayat_Tes', 9);
  for (let i = 0; i < tesRows.length; i++) {
    if (String(tesRows[i][2]) === String(santriId)) {
      testHistory.push({
        idTes: tesRows[i][0],
        tgl: toDateStr(tesRows[i][1]),
        surah: tesRows[i][4],
        ayatMulai: tesRows[i][5],
        ayatAkhir: tesRows[i][6],
        kualitas: tesRows[i][7],
        pelapor: tesRows[i][8]
      });
    }
  }

  const hafalanRows = readSheet_('Hafalan', 10);
  const murojaahRows = readSheet_('Murojaah', 7);
  const lastActivity = latestStudentActivity_(santriId, hafalanRows, murojaahRows, tesRows);
  const weeklySummary = buildWeeklySummary_(santriId, hafalanRows, murojaahRows, tesRows);

  const result = {
    success: true,
    ortuName: session.nama,
    santriId: santriId,
    santriName: santriName,
    retention: {
      hijau: countHijau,
      kuning: countKuning,
      merah: countMerah,
      total: unitList.length
    },
    gamifikasi: {
      xp: xp,
      level: level,
      // currentStreak dibaca dashboard-ortu.js; "streak" tetap dikirim
      // untuk kompatibilitas dengan klien versi lama.
      currentStreak: streak,
      longestStreak: longestStreak,
      streak: streak
    },
    unitList: unitList,
    eligibleTestCount: eligibleTestCount,
    lastActivity: lastActivity,
    weeklySummary: weeklySummary,
    recentTests: testHistory.slice(-100).reverse()
  };

  dashCachePut_(cacheKey, result, DASH_CACHE_TTL_SEC);
  return result;
}

// Ortu Smart Random Test (PRD Section 12)
function ortuGetRandomTest(session) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }

  const todayStr = appTodayStr();
  const indexedUnits = buildMasterIndex_()[santriId] || [];

  const pool = [];
  for (let i = 0; i < indexedUnits.length; i++) {
    const unitRow = indexedUnits[i];
      const diffDays = diffDaysFrom(unitRow.tglMulai);

      // Keluarkan hafalan yang terlalu baru (<1 hari)
      if (diffDays >= 1) {
        const status = unitRow.retentionStatus || 'Hijau';
        const nextReview = unitRow.nextReview || todayStr;
        const isOverdue = nextReview <= todayStr;

        // Weighting: Merah / Overdue prioritas paling tinggi
        let weight = 1;
        if (status === 'Merah') weight = 5;
        else if (status === 'Kuning') weight = 3;
        if (isOverdue) weight += 2;

        pool.push({
          idMaster: unitRow.idMaster,
          surah: unitRow.surah,
          ayatMulai: unitRow.ayatMulai,
          ayatAkhir: unitRow.ayatAkhir,
          retentionStatus: status,
          weight: weight
        });
      }
  }

  if (pool.length === 0) {
    return {
      success: false,
      code: 'E_VALIDATION',
      message: 'Belum ada hafalan yang memenuhi syarat untuk diuji (minimal berumur 1 hari).'
    };
  }

  // Weighted random selection
  const totalWeight = pool.reduce((acc, item) => acc + item.weight, 0);
  let randomVal = Math.random() * totalWeight;
  let selected = pool[0];

  for (let item of pool) {
    randomVal -= item.weight;
    if (randomVal <= 0) {
      selected = item;
      break;
    }
  }

  // Pilih 1 ayat spesifik di dalam rentang
  const randomAyat = Math.floor(Math.random() * (selected.ayatAkhir - selected.ayatMulai + 1)) + selected.ayatMulai;

  return {
    success: true,
    test: {
      idMaster: selected.idMaster,
      surah: selected.surah,
      ayatMulai: selected.ayatMulai,
      ayatAkhir: selected.ayatAkhir,
      targetAyat: randomAyat,
      retentionStatus: selected.retentionStatus
    }
  };
}

// Ortu Submit Test Result (1-Click Evaluation)
function ortuSubmitTestResult(session, payload) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return busyResponse();
  }

  try {
    const config = getConfigMap();
    const tesSheet = getSheet('Riwayat_Tes');
    const todayStr = appTodayStr();

    // 1. Simpan Riwayat_Tes
    tesSheet.appendRow([
      'TES-' + Utilities.getUuid().slice(0, 8),
      todayStr,
      santriId,
      payload.idMaster || '',
      payload.surah,
      Number(payload.ayatMulai || payload.targetAyat),
      Number(payload.ayatAkhir || payload.targetAyat),
      payload.kualitas, // Lancar, Tersendat, Lupa
      'Orang Tua: ' + session.nama
    ]);

    // 2. Event-driven update Master_Hafalan cache
    let recoveryAchieved = false;
    if (payload.idMaster) {
      const cacheRes = updateMasterHafalanCache(payload.idMaster, payload.kualitas, config);
      if (cacheRes && cacheRes.recoveryAchieved) {
        recoveryAchieved = true;
      }
    }

    // 3. Award XP & Qualifying Streak
    const bonusXP = payload.kualitas === 'Lancar' ? Number(config.XP_BONUS_LANCAR || 5) : 0;
    const gamifResult = awardXPAndQualifyingActivity(santriId, 5, bonusXP, true, recoveryAchieved, config);

    // 4. Catat notifikasi untuk santri
    const notifSheet = getSheet('Notifikasi');
    notifSheet.appendRow([
      Utilities.getUuid(),
      santriId,
      'Hasil Tes Ortu',
      `Orang tua menguji ${payload.surah} ayat ${payload.targetAyat || payload.ayatMulai}: Hasil "${payload.kualitas}" (+${gamifResult.xpAdded} XP)`,
      todayStr,
      'Belum'
    ]);

    return {
      success: true,
      message: `Evaluasi ${payload.kualitas} berhasil dicatat! Ananda mendapat +${gamifResult.xpAdded} XP`,
      gamifikasi: gamifResult
    };
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

// Ortu Kirim Apresiasi
// v4.3: memakai withLock() — sebelumnya endpoint tulis ini tanpa lock,
// tidak konsisten dengan endpoint tulis lain (risiko tulis hilang saat ramai).
function ortuSendApresiasi(session, payload) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, code: 'E_VALIDATION', message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }

  return withLock(function () {
    const notifSheet = getSheet('Notifikasi');
    const todayStr = appTodayStr();

    notifSheet.appendRow([
      Utilities.getUuid(),
      santriId,
      'Apresiasi Ortu',
      `Pesan Semangat dari Orang Tua (${session.nama}): "${payload.pesan || 'Semangat terus menghafal ya Ananda, Ayah & Bunda selalu mendoakan!'}" ❤️`,
      todayStr,
      'Belum'
    ]);

    return { success: true, message: 'Pesan apresiasi berhasil dikirim ke Ananda!' };
  });
}

// ============================================================
// QURAN API & AYAH CACHE
// ============================================================

/**
 * Tulis 1 baris cache ayat bila belum ada — dijalankan di dalam lock singkat.
 * Lock hanya membungkus "cek + tulis" (bukan fetch jaringan) agar antrean tulis
 * tidak tertahan oleh lamanya respons provider eksternal.
 */
function appendAyahCacheIfMissing(cacheSheet, surah, ayahNum, arabicText, audioUrl, translationText) {
  return withLock(function () {
    const rows = cacheSheet.getRange(1, 1, Math.max(1, cacheSheet.getLastRow()), 6).getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(surah) && Number(rows[i][1]) === Number(ayahNum)) {
        return { success: true, skipped: true }; // sudah ada -> tidak menulis ulang
      }
    }
    cacheSheet.appendRow([surah, ayahNum, arabicText, audioUrl, new Date().toISOString(), translationText]);
    return { success: true };
  });
}

function getAyahContent(surah, ayah) {
  const ayahNum = Number(ayah);
  if (!ayahNum || ayahNum < 1) {
    return { success: false, code: 'E_VALIDATION', message: 'Nomor ayat tidak valid' };
  }
  const cacheSheet = getSheet('Cache_Ayat');
  const cacheData = readSheet_('Cache_Ayat', 6);
  const cacheRowOffset = 2; // readSheet_ mulai dari baris 2 (setelah header)

  for (let i = 0; i < cacheData.length; i++) {
    if (String(cacheData[i][0]) === String(surah) && Number(cacheData[i][1]) === ayahNum) {
      const cachedArabic = cacheData[i][2] || '';
      const cachedAudio = cacheData[i][3] || '';
      const cachedTranslation = cacheData[i][5] || '';
      const staleAt = toDateStr(cacheData[i][4]);

      // Sel CDN mati (equran.nos.wjv-1.*) dianggap cache tidak layak pakai.
      const deadCdn = String(cachedAudio).indexOf('equran.nos.wjv-1.neo.id') !== -1;
      // Cache tidak lengkap (teks arab kosong) atau terlalu tua (>30 hari)
      // dianggap miss: diambil ulang dari provider lalu cache diperbarui.
      const isStale = !cachedArabic ||
        (staleAt !== '' && diffDaysFrom(staleAt) > 30);

      if (deadCdn || isStale) break;

      return {
        success: true,
        source: 'cache',
        surah: surah,
        ayah: ayahNum,
        arabic: cachedArabic,
        audio: cachedAudio,
        translation: cachedTranslation
      };
    }
  }

  // Jika tidak ada di cache sheet, coba fetch dari equran API
  try {
    // Cari nomor surah jika surah diberikan sebagai string
    const surahNumber = !isNaN(Number(surah)) ? Number(surah) : 1;
    const url = `https://equran.id/api/v2/surat/${surahNumber}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    if (response.getResponseCode() === 200) {
      const resJson = JSON.parse(response.getContentText());
      if (resJson && resJson.data && resJson.data.ayat) {
        // PENTING: jangan pakai ayat[0] sebagai fallback. Ayat yang tidak ada
        // di surah ini harus dilaporkan gagal, bukan ditampilkan sebagai ayat lain.
        const target = resJson.data.ayat.find(a => Number(a.nomorAyat) === ayahNum);
        if (!target) {
          return {
            success: false,
            code: 'E_VALIDATION',
            message: `Ayat ${ayahNum} tidak ditemukan pada surah ${surahNumber}`
          };
        }

        const arabicText = target.teksArab || '';
        const translationText = target.teksIndonesia || '';
        // equran.id memakai "01".."06" sebagai KODE QARI pada tiap ayat
        // (bukan audio full surah): 01 = Abdullah-Al-Juhany, dst.
        // audioFull['01'] hanya dipakai sebagai fallback terakhir.
        const audioUrl = (target.audio && target.audio['01'])
          ? target.audio['01']
          : (resJson.data.audioFull ? resJson.data.audioFull['01'] : '');

        // Simpan ke Cache_Ayat di dalam lock singkat + cek ulang, supaya dua
        // request bersamaan untuk ayat yang sama tidak menghasilkan baris cache
        // kembar (dulu appendRow langsung tanpa lock).
        appendAyahCacheIfMissing(cacheSheet, surah, ayahNum, arabicText, audioUrl, translationText);

        return {
          success: true,
          source: 'api',
          surah: surah,
          ayah: ayahNum,
          arabic: arabicText,
          audio: audioUrl,
          translation: translationText
        };
      }
    }
  } catch (err) {
    Logger.log('getAyahContent gagal fetch provider: ' + err);
  }

  // Tidak ada teks valid: laporkan gagal agar UI menampilkan pesan jujur
  // (PRD Section 17: sistem tidak boleh gagal total, tapi juga tidak boleh
  // menampilkan ayat yang salah).
  return {
    success: false,
    surah: surah,
    ayah: ayahNum,
    code: 'E_UPSTREAM',
    message: 'Teks ayat belum tersedia (cache kosong & provider eksternal tidak merespons)'
  };
}

// ============================================================
// ARSIP OTOMATIS RIWAYAT LAMA (PRD Section 15 & 17)
// ============================================================
// Sheet histori (Murojaah, Riwayat_Tes, Notifikasi) tumbuh selamanya. Karena
// setiap pembacaan memakai getRange, ukuran sheet = ongkos. Arsip memindahkan
// baris lama ke sheet 'Arsip_<nama>' (atau spreadsheet arsip terpisah) sehingga
// sheet aktif tetap ramping.
//
// Aturan keselamatan (penting — jangan diubah tanpa alasan):
//   1) DEFAULT = UJI KERING. Tanpa argumen, fungsi ini hanya MELAPORKAN apa yang
//      akan dipindahkan; tidak menulis dan tidak menghapus apa pun.
//   2) Penghapusan hanya dilakukan SETELAH penulisan arsip terverifikasi
//      (jumlah baris bertambah tepat sebanyak data yang ditulis).
//   3) Notifikasi hanya diarsipkan bila Status_Baca = 'Sudah' — yang belum dibaca
//      tidak boleh hilang dari pandangan santri.
//   4) Seluruh operasi tulis berjalan di dalam withLock() + flush().
//   5) Arsip otomatis pada batch malam tetap uji kering sampai pemilik sistem
//      menyalakan Config ARCHIVE_AKTIF = 1.

const PROP_LAST_ARCHIVE_RUN = 'SYNC_STATE_LAST_ARCHIVE_RUN';

const ARCHIVE_SHEET_SPECS = [
  { name: 'Murojaah', cols: 7, dateIndex: 1 },
  { name: 'Riwayat_Tes', cols: 9, dateIndex: 1 },
  // Notifikasi: hanya yang sudah dibaca (readIndex = kolom Status_Baca).
  { name: 'Notifikasi', cols: 6, dateIndex: 4, onlyRead: true, readIndex: 5 }
];

/**
 * Tanggal awal bulan N bulan sebelum sebuah tanggal (YYYY-MM-DD).
 * Dipakai sebagai batas arsip: baris dengan tanggal < batas dianggap lama.
 * Fungsi ini MURNI (tanpa API Google) sehingga bisa diuji unit di luar GAS.
 *
 * @param {string} dateStr tanggal sumber (YYYY-MM-DD)
 * @param {number} months jumlah bulan ke belakang
 * @returns {string} YYYY-MM-01, atau '' bila tanggal tidak valid
 */
function monthsAgoFrom_(dateStr, months) {
  const m = String(dateStr || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  let tahun = Number(m[1]);
  let bulan = Number(m[2]) - (Number(months) || 0);
  while (bulan <= 0) { bulan += 12; tahun -= 1; }
  const bulanStr = (bulan < 10 ? '0' : '') + bulan;
  return tahun + '-' + bulanStr + '-01';
}

/**
 * Tentukan tujuan arsip. Bila Script Property SPREADSHEET_ID_ARSIP diisi,
 * arsip ditulis ke spreadsheet terpisah; bila tidak, ke sheet 'Arsip_*' di
 * spreadsheet yang sama (tidak perlu konfigurasi tambahan).
 */
function getArchiveTarget_() {
  const id = readScriptProperty_('SPREADSHEET_ID_ARSIP');
  if (id && id.length > 5) {
    try {
      return { ss: SpreadsheetApp.openById(id), label: 'Spreadsheet arsip terpisah (SPREADSHEET_ID_ARSIP)', external: true };
    } catch (e) {
      Logger.log('Spreadsheet arsip tidak bisa dibuka, memakai sheets Arsip_* lokal: ' + e);
    }
  }
  return { ss: getSpreadsheet(), label: 'Sheet Arsip_* di spreadsheet yang sama', external: false };
}

/** Pastikan sheet arsip ada dan berheader sama dengan sheet sumber. */
function ensureArchiveSheet_(ss, sourceName, cols) {
  const archiveName = 'Arsip_' + sourceName;
  const header = getSheet(sourceName).getRange(1, 1, 1, cols).getValues()[0];
  let sheet = ss.getSheetByName(archiveName);
  if (!sheet) {
    sheet = ss.insertSheet(archiveName);
    sheet.getRange(1, 1, 1, cols).setValues([header]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, cols).setValues([header]);
  }
  return sheet;
}

/**
 * Hapus baris dari BAWAH ke atas dalam blok kontigu. Menghapus dari atas akan
 * menggeser nomor baris berikutnya; urutan ini mencegah baris salah terhapus.
 * @param {Sheet} sheet
 * @param {number[]} rowNumbers nomor baris sheet (1-based), urut menaik
 */
function deleteRowBlocks_(sheet, rowNumbers) {
  let i = rowNumbers.length - 1;
  while (i >= 0) {
    const end = rowNumbers[i];
    let start = end;
    while (i - 1 >= 0 && rowNumbers[i - 1] === start - 1) {
      i--;
      start = rowNumbers[i];
    }
    sheet.deleteRows(start, end - start + 1);
    i--;
  }
}

/**
 * Pintu masuk arsip. TANPA argumen = uji kering (aman, read-only).
 * Pemakaian:
 *   archiveOldRows()                          → laporan uji kering
 *   archiveOldRows({ dryRun: false })          → benar-benar memindahkan
 *   archiveOldRows({ bulan: 3 })               → batas arsip 3 bulan
 */
function archiveOldRows(options) {
  const opts = options || {};
  if (opts.dryRun !== false) return archiveOldRowsRun_(opts, true);
  return withLock(function () { return archiveOldRowsRun_(opts, false); });
}

/** Implementasi inti arsip (dipanggil dari archiveOldRows). */
function archiveOldRowsRun_(opts, dryRun) {
  const config = dryRun ? getConfigMapReadOnly_() : getConfigMap();
  const bulan = Number(opts.bulan || config.ARCHIVE_AMBANG_BULAN || 6);
  const cutoff = monthsAgoFrom_(appTodayStr(), bulan);
  if (!cutoff) {
    return { success: false, code: 'E_UNKNOWN', message: 'Batas arsip tidak bisa dihitung dari tanggal hari ini.' };
  }

  const target = getArchiveTarget_();
  const report = {
    success: true,
    dryRun: dryRun,
    bulan: bulan,
    cutoff: cutoff,
    target: target.label,
    sheets: {},
    totalDitemukan: 0,
    totalDiarsipkan: 0,
    totalDihapus: 0,
    warnings: []
  };

  for (let s = 0; s < ARCHIVE_SHEET_SPECS.length; s++) {
    const spec = ARCHIVE_SHEET_SPECS[s];
    let sheet;
    try {
      // Uji kering harus benar-benar baca-saja: jangan membuat sheet sumber yang hilang.
      sheet = dryRun ? getExistingSheet_(spec.name) : getSheet(spec.name);
    } catch (e) {
      // Sheet tidak tersedia di instalasi ini → lewati, jangan gagalkan seluruh arsip.
      report.warnings.push('Sheet ' + spec.name + ' tidak ditemukan — dilewati.');
      report.sheets[spec.name] = { ditemukan: 0, diarsipkan: 0, dihapus: 0, catatan: 'sheet tidak ditemukan' };
      continue;
    }
    if (!sheet) {
      report.warnings.push('Sheet ' + spec.name + ' tidak ditemukan — dilewati.');
      report.sheets[spec.name] = { ditemukan: 0, diarsipkan: 0, dihapus: 0, catatan: 'sheet tidak ditemukan' };
      continue;
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      report.sheets[spec.name] = { ditemukan: 0, diarsipkan: 0, dihapus: 0, catatan: 'sheet kosong' };
      continue;
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, spec.cols).getValues();
    const kandidat = [];
    for (let i = 0; i < rows.length; i++) {
      const tgl = toDateStr(rows[i][spec.dateIndex]);
      if (!tgl || tgl >= cutoff) continue; // tanggal kosong / masih periode aktif
      if (spec.onlyRead && String(rows[i][spec.readIndex] || '') !== 'Sudah') continue;
      kandidat.push({ rowNumber: i + 2, values: rows[i] });
    }

    report.totalDitemukan += kandidat.length;
    if (kandidat.length === 0) {
      report.sheets[spec.name] = { ditemukan: 0, diarsipkan: 0, dihapus: 0 };
      continue;
    }

    if (dryRun) {
      report.sheets[spec.name] = { ditemukan: kandidat.length, diarsipkan: 0, dihapus: 0, catatan: 'uji kering — tidak ada yang diubah' };
      continue;
    }

    let archSheet;
    try {
      archSheet = ensureArchiveSheet_(target.ss, spec.name, spec.cols);
    } catch (e) {
      report.warnings.push('Gagal menyiapkan arsip ' + spec.name + ': ' + e);
      report.sheets[spec.name] = { ditemukan: kandidat.length, diarsipkan: 0, dihapus: 0, catatan: 'dibatalkan' };
      continue;
    }

    const values = kandidat.map(function (k) { return k.values; });
    const sebelum = archSheet.getLastRow();
    try {
      archSheet.getRange(sebelum + 1, 1, values.length, spec.cols).setValues(values);
      SpreadsheetApp.flush();
    } catch (e) {
      report.warnings.push('Gagal menulis arsip ' + spec.name + ': ' + e);
      report.sheets[spec.name] = { ditemukan: kandidat.length, diarsipkan: 0, dihapus: 0, catatan: 'dibatalkan' };
      continue;
    }

    // Verifikasi sebelum menghapus — bila tidak cocok, TIDAK ada yang dihapus.
    const sesudah = archSheet.getLastRow();
    if (sesudah - sebelum !== values.length) {
      report.warnings.push('Arsip ' + spec.name + ' tidak terverifikasi (' + (sesudah - sebelum) + ' dari ' + values.length + ' baris) — penghapusan dibatalkan.');
      report.sheets[spec.name] = { ditemukan: kandidat.length, diarsipkan: sesudah - sebelum, dihapus: 0, catatan: 'dibatalkan' };
      continue;
    }

    const rowNumbers = kandidat.map(function (k) { return k.rowNumber; });
    deleteRowBlocks_(sheet, rowNumbers);
    SpreadsheetApp.flush();

    report.sheets[spec.name] = { ditemukan: kandidat.length, diarsipkan: values.length, dihapus: rowNumbers.length };
    report.totalDiarsipkan += values.length;
    report.totalDihapus += rowNumbers.length;
  }

  // Uji kering tidak menulis Script Property apa pun.
  if (!dryRun) {
    writeScriptProperty_(PROP_LAST_ARCHIVE_RUN, JSON.stringify({
      at: new Date().toISOString(),
      dryRun: dryRun,
      cutoff: cutoff,
      ditemukan: report.totalDitemukan,
      dihapus: report.totalDihapus
    }));
  }

  if (!dryRun && report.totalDihapus > 0) bumpDashVersion_();
  return report;
}

// ============================================================
// DIAGNOSTIK SISTEM (read-only) — selfTest() & health_check
// ============================================================

/**
 * Kumpulkan status sistem tanpa mengubah apa pun. Dipakai oleh selfTest()
 * (dijalankan dari editor Apps Script) dan health_check (lewat HTTP, ustaz).
 */
function systemDiagnostics_() {
  const out = {
    appVersion: APP_VERSION,
    timezone: APP_TIMEZONE,
    spreadsheetId: SPREADSHEET_ID ? (SPREADSHEET_ID.slice(0, 6) + '…(disembunyikan)') : '(belum diisi)',
    archiveTarget: getArchiveTarget_().label,
    trigger: { installed: false, handler: 'runNightlyRetentionRecompute' },
    lastNightlyRun: readScriptProperty_(PROP_LAST_NIGHTLY_RUN) || '(belum pernah)',
    lastArchiveRun: readScriptProperty_(PROP_LAST_ARCHIVE_RUN) || '(belum pernah)',
    config: {},
    sheets: {},
    duplikat: {},
    warnings: []
  };

  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'runNightlyRetentionRecompute') out.trigger.installed = true;
    }
  } catch (e) {
    out.warnings.push('Tidak bisa membaca daftar trigger: ' + e);
  }
  if (!out.trigger.installed) {
    out.warnings.push('Trigger malam TIDAK terpasang: pembersihan sesi, downgrade retensi, dan arsip tidak berjalan. Jalankan installNightlyTrigger() dari editor (atau login sekali agar dipasang otomatis).');
  }
  if (out.lastNightlyRun === '(belum pernah)') {
    out.warnings.push('Batch malam belum pernah tercatat berjalan.');
  }

  // Config efektif (nilai penting saja)
  try {
    const cfg = getConfigMapReadOnly_();
    ['ARCHIVE_AMBANG_BULAN', 'ARCHIVE_AKTIF', 'SESSION_EXPIRY_JAM', 'AMBANG_SABQI_HARI',
      'INTERVAL_CAP_MAKS_HARI', 'RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN'].forEach(function (k) {
        out.config[k] = cfg[k];
      });
  } catch (e) {
    out.warnings.push('Config tidak bisa dibaca: ' + e);
  }

  // Audit semua sheet dan header dalam mode baca-saja.
  try {
    out.schema = auditDatabaseSchema({ scanBlankRows: false });
    if (out.schema.success) {
      out.schema.sheets.forEach(function (item) {
        if (item.status === 'missing_sheet') {
          out.warnings.push('Sheet ' + item.name + ' belum ada; buat sheet dan header sebelum fitur terkait dipakai.');
        } else if (item.status === 'missing_header' || item.status === 'missing_trailing_headers') {
          out.warnings.push('Header sheet ' + item.name + ' belum lengkap (' + item.status + '); audit/perbaikan skema dapat dijalankan.');
        } else if (item.status === 'header_mismatch' || item.status === 'unexpected_extra_headers') {
          out.warnings.push('Header sheet ' + item.name + ' berbeda dari skema; dilewati otomatis agar kolom/data yang mungkin kustom tidak tertimpa.');
        }
      });
    } else {
      out.warnings.push('Audit skema gagal: ' + (out.schema.error || 'Spreadsheet tidak tersedia.'));
    }
  } catch (e) {
    out.warnings.push('Pemeriksaan skema gagal: ' + e);
  }

  // Jumlah baris sheet kunci; sheet hilang dilaporkan, bukan dibuat otomatis.
  ['Users', 'Santri', 'Target', 'Hafalan', 'Master_Hafalan', 'Murojaah', 'Riwayat_Tes',
    'Gamifikasi', 'Badge', 'Notifikasi', 'Feedback', 'Sessions', 'Cache_Ayat'].forEach(function (name) {
      try {
        const sheet = getExistingSheet_(name);
        out.sheets[name] = sheet ? Math.max(0, sheet.getLastRow() - 1) : -1;
      } catch (e) { out.sheets[name] = -1; }
    });

  // Duplikat data (sumber bug "data dobel" dari versi lama)
  try {
    const targetRows = readExistingSheet_('Target', 6);
    const seenTarget = {};
    let dupTarget = 0;
    for (let i = 0; i < targetRows.length; i++) {
      const key = String(targetRows[i][2]) + '|' + String(targetRows[i][1]);
      if (seenTarget[key]) dupTarget++; else seenTarget[key] = true;
    }
    out.duplikat.target_santri_bulan = dupTarget;
    if (dupTarget > 0) out.warnings.push('Ada ' + dupTarget + ' baris Target kembar (santri+bulan sama) — target bisa tampil tidak konsisten.');

    const masterRows = readExistingSheet_('Master_Hafalan', 12);
    const seenUnit = {};
    let dupUnit = 0;
    for (let i = 0; i < masterRows.length; i++) {
      const key = String(masterRows[i][1]) + '|' + String(masterRows[i][2]).replace(/[^a-z0-9]/gi, '').toLowerCase() +
        '|' + String(masterRows[i][3]) + '|' + String(masterRows[i][4]);
      if (seenUnit[key]) dupUnit++; else seenUnit[key] = true;
    }
    out.duplikat.unit_hafalan = dupUnit;
    if (dupUnit > 0) out.warnings.push('Ada ' + dupUnit + ' unit Master_Hafalan kembar (santri+surah+ayat sama) — pertimbangkan penggabungan.');

    const userRows = readExistingSheet_('Users', 6);
    const seenUser = {};
    let dupUser = 0;
    for (let i = 0; i < userRows.length; i++) {
      const key = String(userRows[i][1] || '').toLowerCase();
      if (!key) continue;
      if (seenUser[key]) dupUser++; else seenUser[key] = true;
    }
    out.duplikat.username = dupUser;
    if (dupUser > 0) out.warnings.push('Ada ' + dupUser + ' username kembar di sheet Users.');
  } catch (e) {
    out.warnings.push('Pemeriksaan duplikat gagal: ' + e);
  }

  // Kesehatan sheet Sessions (paling sering jadi sumber perlambatan)
  try {
    const sessionRows = readExistingSheet_('Sessions', 6);
    const now = Date.now();
    let expired = 0;
    const seenToken = {};
    let dupToken = 0;
    for (let i = 0; i < sessionRows.length; i++) {
      const exp = new Date(sessionRows[i][3]);
      if (!isNaN(exp.getTime()) && exp.getTime() < now) expired++;
      const t = String(sessionRows[i][0] || '');
      if (t) { if (seenToken[t]) dupToken++; else seenToken[t] = true; }
    }
    out.sessionsExpired = expired;
    out.duplikat.token_sesi = dupToken;
    if (expired > 0) {
      out.warnings.push('Ada ' + expired + ' sesi kedaluwarsa yang belum dibersihkan (dibersihkan otomatis oleh trigger malam / saat token dipakai).');
    }
    if (sessionRows.length > 500) {
      out.warnings.push('Sheet Sessions berisi ' + sessionRows.length + ' baris — periksa apakah trigger malam berjalan.');
    }
  } catch (e) {
    out.warnings.push('Pemeriksaan sesi gagal: ' + e);
  }

  // Ukuran sheet histori → sarankan arsip
  const besar = Object.keys(out.sheets).filter(function (k) {
    return ['Murojaah', 'Riwayat_Tes', 'Notifikasi', 'Cache_Ayat'].indexOf(k) !== -1 && out.sheets[k] > 5000;
  });
  if (besar.length > 0) {
    out.warnings.push('Sheet histori besar (' + besar.join(', ') + ' > 5.000 baris). Jalankan archiveOldRows() untuk melihat rencana arsip (uji kering).');
  }

  return out;
}

/**
 * Uji mandiri sistem — jalankan dari editor Apps Script (dropdown fungsi →
 * selfTest → Run). Tidak mengubah data apa pun, aman dijalankan kapan saja.
 * Hasil lengkap (termasuk rencana arsip) dicatat ke Executions log.
 */
function selfTest() {
  const report = systemDiagnostics_();
  report.arsipRencana = archiveOldRows({ dryRun: true });
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

// ============================================================
// NIGHTLY CRON TRIGGER (RECOMPUTE & CLEANUP)
// ============================================================

function runNightlyRetentionRecompute() {
  const masterSheet = getSheet('Master_Hafalan');
  const masterData = readSheet_('Master_Hafalan', 12);
  const todayDateStr = appTodayStr();

  // Downgrade terjadwal: unit Hijau yang jadwal reviewnya terlewat >= 3 hari -> Kuning.
  // Ditulis sekali (batch setValues) agar tidak memanggil setValue per baris (NFR Performance).
  const statusColumn = [];
  let changed = false;

  for (let i = 0; i < masterData.length; i++) {
    const nextReview = toDateStr(masterData[i][8]);
    const currentStatus = masterData[i][7] || 'Hijau';
    let newStatus = currentStatus;

    if (nextReview && nextReview < todayDateStr && currentStatus === 'Hijau') {
      if (diffDaysFrom(nextReview) >= 3) {
        newStatus = 'Kuning';
        changed = true;
      }
    }
    statusColumn.push([newStatus]);
  }

  if (changed && statusColumn.length > 0) {
    masterSheet.getRange(2, 8, statusColumn.length, 1).setValues(statusColumn);
  }

  // Bersihkan token sesi kedaluwarsa — batch: kumpulkan blok baris kontigu,
  // lalu hapus sekali deleteRows per blok (bukan deleteRow per baris).
  const sessionSheet = getSheet('Sessions');
  const sessionData = readSheet_('Sessions', 6);
  const now = new Date();
  let blockStart = -1;
  let blockEnd = -1;
  // Index 0 = baris sheet ke-2 -> nomor baris = j + 2.
  for (let j = sessionData.length - 1; j >= 0; j--) {
    const expiry = new Date(sessionData[j][3]);
    const expired = !isNaN(expiry.getTime()) && expiry < now;
    if (expired) {
      const row = j + 2;
      if (blockEnd === -1) {
        blockStart = row;
        blockEnd = row;
      } else if (row === blockStart - 1) {
        blockStart = row;
      } else {
        sessionSheet.deleteRows(blockStart, blockEnd - blockStart + 1);
        blockStart = row;
        blockEnd = row;
      }
    }
  }
  if (blockEnd !== -1) {
    sessionSheet.deleteRows(blockStart, blockEnd - blockStart + 1);
  }
  bumpDashVersion_(); // data berubah -> cache dashboard dibuang

  // Arsip riwayat lama. Aman secara default: hanya UJI KERING sampai pemilik
  // sistem menyetel Config ARCHIVE_AKTIF = 1 (lihat komentar archiveOldRows).
  let archiveInfo = null;
  try {
    const cfgArsip = getConfigMap();
    const arsipAktif = String(cfgArsip.ARCHIVE_AKTIF || '0') === '1';
    const hasilArsip = archiveOldRows({ dryRun: !arsipAktif });
    archiveInfo = (hasilArsip && hasilArsip.success === false)
      ? { error: hasilArsip.code || 'E_BUSY' } // mis. lock dipakai user: coba lagi malam berikutnya
      : {
        dryRun: hasilArsip.dryRun,
        cutoff: hasilArsip.cutoff,
        ditemukan: hasilArsip.totalDitemukan,
        dihapus: hasilArsip.totalDihapus
      };
  } catch (e) {
    Logger.log('arsip otomatis gagal (diabaikan): ' + e);
    archiveInfo = { error: String(e) };
  }

  // Catat jejak eksekusi agar healthCheck() bisa membuktikan batch benar-benar
  // berjalan (dulu tidak ada jejak apa pun, sehingga "trigger lupa dipasang"
  // tidak terdeteksi sampai sistem terasa lambat).
  writeScriptProperty_(PROP_LAST_NIGHTLY_RUN, new Date().toISOString());
  return { success: true, ranAt: readScriptProperty_(PROP_LAST_NIGHTLY_RUN), archive: archiveInfo };
}

// Install Trigger otomatis setiap jam 01:00 malam
function installNightlyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runNightlyRetentionRecompute') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('runNightlyRetentionRecompute')
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .create();

  writeScriptProperty_(PROP_TRIGGER_FLAG, new Date().toISOString());
  return { success: true, message: 'Trigger malam tiap 01:00 terpasang.' };
}

/**
 * Pastikan trigger malam terpasang TANPA perlu langkah manual di editor.
 * Dipanggil setiap login sukses (frekuensi rendah) dan idempoten:
 * bila penanda sudah ada, fungsi ini tidak melakukan apa-apa.
 *
 * Latar belakang: sebelumnya installNightlyTrigger() tidak dipanggil dari mana
 * pun, sehingga sheet Sessions tak pernah dibersihkan dan validateSession makin
 * lambat — salah satu pemicu lingkaran "putus/nyambung".
 */
function ensureNightlyTrigger() {
  try {
    if (readScriptProperty_(PROP_TRIGGER_FLAG)) return false; // sudah pernah dipasang

    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'runNightlyRetentionRecompute') {
        writeScriptProperty_(PROP_TRIGGER_FLAG, new Date().toISOString());
        return false;
      }
    }

    installNightlyTrigger();
    Logger.log('Trigger malam otomatis dipasang (ensureNightlyTrigger).');
    return true;
  } catch (e) {
    // Jangan pernah menggagalkan login hanya karena trigger tidak bisa dipasang.
    Logger.log('ensureNightlyTrigger gagal (diabaikan): ' + e);
    return false;
  }
}

/**
 * Status kesehatan sistem — untuk menjawab "kenapa lambat / data tidak terlihat".
 * Panggil dari editor Apps Script, atau lewat action 'health_check' (khusus ustaz).
 */
function healthCheck(session) {
  // Satu sumber diagnostik dengan selfTest(): versi, trigger, ukuran sheet,
  // duplikat data, dan peringatan tindakan yang perlu dilakukan.
  if (session && session.role !== 'ustaz' && session.role !== 'admin') {
    return { success: false, code: 'E_FORBIDDEN', message: 'Akses khusus Ustaz' };
  }
  const report = systemDiagnostics_();
  report.success = true;
  return report;
}

// ============================================================
// INITIAL DATABASE SETUP & SEED DATA
// ============================================================

function setupInitialDatabase() {
  const ss = getSpreadsheet();

  // 1. Sheet Config
  const configSheet = getSheet('Config');
  configSheet.clear();
  configSheet.appendRow(['Key', 'Value', 'Description']);
  const configs = [
    ['AMBANG_SABQI_HARI', 30, 'Ambang batas sabqi (hari)'],
    ['INTERVAL_MULTIPLIER_LANCAR', 1.5, 'Pengali interval saat lancar'],
    ['INTERVAL_MULTIPLIER_TERSENDAT', 0.5, 'Pengali interval saat tersendat'],
    ['INTERVAL_CAP_MAKS_HARI', 60, 'Maksimal interval pengulangan'],
    ['INTERVAL_LUPA_HARI', 1, 'Interval ulang saat lupa'],
    ['RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN', 2, 'Jumlah lancar berturut untuk pemulihan dari merah'],
    ['XP_SABAQ', 5, 'XP untuk review sabaq'],
    ['XP_SABQI', 8, 'XP untuk review sabqi'],
    ['XP_MANZIL', 12, 'XP untuk review manzil'],
    ['XP_BONUS_LANCAR', 5, 'Bonus XP hasil lancar'],
    ['XP_BONUS_RECOVERY', 15, 'Bonus XP pemulihan merah ke kuning'],
    ['SESSION_EXPIRY_JAM', 24, 'Masa berlaku token sesi (jam)'],
    ['ARCHIVE_AMBANG_BULAN', 6, 'Ambang waktu arsip riwayat'],
    ['ARCHIVE_AKTIF', 0, '1 = arsip otomatis aktif; 0 = uji kering saja'],
  ];
  configs.forEach(row => configSheet.appendRow(row));

  // 2. Sheet Users
  const usersSheet = getSheet('Users');
  usersSheet.clear();
  usersSheet.appendRow(['ID', 'Username', 'Password_Hash', 'Role', 'Nama', 'ID_Terkait']);
  const sampleUsers = [
    ['USR-USTAZ-01', 'ustaz1', hashPassword('123456'), 'ustaz', 'Ustaz Ahmad Fauzi, Al-Hafizh', ''],
    ['USR-SANTRI-01', 'santri1', hashPassword('123456'), 'santri', 'Muhammad Hafizh Al-Fatih', ''],
    ['USR-SANTRI-02', 'santri2', hashPassword('123456'), 'santri', 'Aisyah Humaira', ''],
    ['USR-ORTU-01', 'ortu1', hashPassword('123456'), 'ortu', 'Bapak Ridwan (Ortu Hafizh)', 'USR-SANTRI-01']
  ];
  sampleUsers.forEach(row => usersSheet.appendRow(row));

  // 3. Sheet Santri
  const santriSheet = getSheet('Santri');
  santriSheet.clear();
  santriSheet.appendRow(['ID_Santri', 'Nama', 'ID_Ustaz', 'Status']);
  santriSheet.appendRow(['USR-SANTRI-01', 'Muhammad Hafizh Al-Fatih', 'USR-USTAZ-01', 'Aktif']);
  santriSheet.appendRow(['USR-SANTRI-02', 'Aisyah Humaira', 'USR-USTAZ-01', 'Aktif']);

  // 4. Sheet Target
  const targetSheet = getSheet('Target');
  targetSheet.clear();
  targetSheet.appendRow(['ID_Target', 'Bulan', 'ID_Santri', 'Target_Surah', 'Ayat_Mulai', 'Ayat_Akhir']);
  const currentMonth = appTodayStr().slice(0, 7);
  targetSheet.appendRow(['TGT-001', currentMonth, 'USR-SANTRI-01', 'An-Naba', 1, 40]);
  targetSheet.appendRow(['TGT-002', currentMonth, 'USR-SANTRI-02', 'An-Nazi\'at', 1, 46]);

  // 5. Sheet Master_Hafalan
  const masterSheet = getSheet('Master_Hafalan');
  masterSheet.clear();
  masterSheet.appendRow([
    'ID_Master', 'ID_Santri', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir',
    'Tgl_Mulai', 'Status', 'Retention_Status_Cache', 'Next_Review_Cache',
    'Current_Interval_Hari', 'Consecutive_Lupa', 'Consecutive_Lancar'
  ]);
  const todayStr = appTodayStr();
  const sampleMasters = [
    ['MST-001', 'USR-SANTRI-01', "An-Naba'", 1, 20, todayStr, 'Aktif', 'Hijau', addDaysStr(2), 2, 0, 0],
    ['MST-002', 'USR-SANTRI-01', "An-Nazi'at", 1, 15, '2026-08-15', 'Aktif', 'Kuning', todayStr, 1, 0, 0],
    ['MST-003', 'USR-SANTRI-01', "'Abasa", 1, 25, '2026-07-01', 'Aktif', 'Merah', todayStr, 1, 2, 0],
    ['MST-004', 'USR-SANTRI-01', 'Al-Ikhlas', 1, 4, '2026-06-10', 'Aktif', 'Hijau', addDaysStr(15), 15, 0, 0],
    ['MST-005', 'USR-SANTRI-02', 'Al-Infitar', 1, 19, todayStr, 'Aktif', 'Hijau', addDaysStr(3), 3, 0, 0]
  ];
  sampleMasters.forEach(row => masterSheet.appendRow(row));

  // 6. Sheet Hafalan (History Setoran)
  const hafalanSheet = getSheet('Hafalan');
  hafalanSheet.clear();
  hafalanSheet.appendRow(['ID_Hafalan', 'Tgl', 'ID_Santri', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir', 'Nilai', 'Catatan', 'ID_Target', 'Timestamp']);
  hafalanSheet.appendRow(['HAF-001', todayStr, 'USR-SANTRI-01', 'An-Naba', 1, 20, 'A', 'Makhraj dan tajwid sangat baik', 'TGT-001', new Date().toISOString()]);

  // 7. Sheet Murojaah
  const murojaahSheet = getSheet('Murojaah');
  murojaahSheet.clear();
  murojaahSheet.appendRow(['ID_Murojaah', 'Tgl', 'ID_Santri', 'Jenis_Misi', 'Detail', 'Pelapor', 'Timestamp']);
  murojaahSheet.appendRow(['MUR-001', todayStr, 'USR-SANTRI-01', 'Sabaq', 'An-Naba (1-20)', 'Muhammad Hafizh Al-Fatih', new Date().toISOString()]);

  // 8. Sheet Riwayat_Tes
  const tesSheet = getSheet('Riwayat_Tes');
  tesSheet.clear();
  tesSheet.appendRow(['ID_Tes', 'Tgl', 'ID_Santri', 'ID_Master', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir', 'Kualitas', 'Pelapor']);
  tesSheet.appendRow(['TES-001', todayStr, 'USR-SANTRI-01', 'MST-001', 'An-Naba', 1, 10, 'Lancar', 'Orang Tua: Bapak Ridwan']);

  // 9. Sheet Gamifikasi
  const gamifSheet = getSheet('Gamifikasi');
  gamifSheet.clear();
  gamifSheet.appendRow(['ID_Santri', 'XP_Total', 'Level', 'Streak_Saat_Ini', 'Streak_Terpanjang', 'Last_Qualifying_Date']);
  gamifSheet.appendRow(['USR-SANTRI-01', 345, 4, 7, 14, todayStr]);
  gamifSheet.appendRow(['USR-SANTRI-02', 180, 2, 3, 5, todayStr]);

  // 10. Sheet Badge
  const badgeSheet = getSheet('Badge');
  badgeSheet.clear();
  badgeSheet.appendRow(['ID_Badge', 'ID_Santri', 'Nama_Badge', 'Tgl_Diperoleh']);
  badgeSheet.appendRow(['BDG-001', 'USR-SANTRI-01', 'Streak 3 Hari 🔥', '2026-09-03']);
  badgeSheet.appendRow(['BDG-002', 'USR-SANTRI-01', 'Pejuang Istiqomah (7 Hari) 🌟', todayStr]);

  // 11. Sheet Notifikasi
  const notifSheet = getSheet('Notifikasi');
  notifSheet.clear();
  notifSheet.appendRow(['ID_Notif', 'ID_User', 'Tipe', 'Pesan', 'Tgl_Kirim', 'Status_Baca']);
  notifSheet.appendRow(['NTF-001', 'USR-SANTRI-01', 'Motivasi', 'Bagus sekali Hafizh! Pertahankan streak 7 harimu!', todayStr, 'Belum']);

  // 12. Sheet Feedback
  const feedbackSheet = getSheet('Feedback');
  feedbackSheet.clear();
  feedbackSheet.appendRow(['ID_Feedback', 'ID_Santri', 'ID_Hafalan', 'ID_Ustaz', 'Pesan', 'Tgl', 'Status_Baca']);
  feedbackSheet.appendRow(['FDB-001', 'USR-SANTRI-01', 'HAF-001', 'USR-USTAZ-01', 'Perhatikan hukum ikhfa pada ayat 14 ya.', todayStr, 'Belum']);

  // 13. Sheet Sessions
  const sessionSheet = getSheet('Sessions');
  sessionSheet.clear();
  sessionSheet.appendRow(['Token', 'ID_User', 'Role', 'Expiry', 'ID_Terkait', 'Nama']);

  // 14. Sheet Cache_Ayat
  const cacheSheet = getSheet('Cache_Ayat');
  cacheSheet.clear();
  // Kolom 6 (Teks_Indonesia) bersifat opsional/aditif: data lama tetap terbaca.
  cacheSheet.appendRow(['Surah', 'Ayat', 'Teks_Arab', 'Audio_URL', 'Last_Fetched', 'Teks_Indonesia']);
  cacheSheet.appendRow([
    78, 1,
    'عَمَّ يَتَسَاءَلُونَ',
    'https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078001.mp3',
    new Date().toISOString(),
    'Tentang apakah mereka saling bertanya-tanya?'
  ]);

  return {
    success: true,
    message: 'Seluruh 14 sheet dan data inisialisasi PRD v4 berhasil dibuat di Spreadsheet!',
    // Catatan: kolom Master_Hafalan.Consecutive_Lancar & Cache_Ayat.Teks_Indonesia
    // adalah kolom aditif untuk Recovery Policy (PRD 7.4) dan terjemahan ayat.
  };
}
