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

// SPREADSHEET ID (Sesuaikan dengan ID Google Spreadsheet Anda)
const SPREADSHEET_ID = '16Bg7EG0NXQZkELkzB1mb8RorIv8ruLVgi6ZiGEDLMLU';

// Zona waktu aplikasi: dipakai untuk "hari ini", streak, dan jadwal review.
// Menghindari bug batas hari (sebelumnya MTor UTC membuat hari berganti 07:00 WIB).
const APP_TIMEZONE = 'Asia/Jakarta';

// Kunci rahasia untuk menjalankan setupInitialDatabase() lewat HTTP request.
// Wahai: fungsi itu MENGHAPUS isi 14 sheet, jadi jangan biarkan publik.
// Paling aman: jalankan setupInitialDatabase() dari editor Apps Script.
// Guard tambahan: selama kunci masih default, endpoint setup via HTTP ditolak
// total (lihat doPost), sehingga kegagalan mengganti kunci tidak menjadi celah.
const SETUP_SECRET = 'GANTI-KUNCI-SETUP-ANDA';
const SETUP_SECRET_DEFAULT = 'GANTI-KUNCI-SETUP-ANDA';

// ============================================================================
// ENTRY POINTS (doGet & doPost)
// ============================================================================

function doGet(e) {
  return responseJSON({
    status: 'API Aktif',
    nama: 'Quran Retention Engine API',
    versi: '4.0.0',
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ success: false, message: 'Request payload kosong' });
    }

    const request = JSON.parse(e.postData.contents);
    const action = request.action;

    // Public / Non-token action
    if (action === 'login') {
      return responseJSON(loginUser(request.username, request.password));
    }
    if (action === 'setup_database') {
      // Endpoint destruktif (clear 14 sheet) -> wajib menyertakan kunci rahasia.
      // Bila kunci masih bawaan repo (belum pernah diganti), endpoint ditolak
      // meskipun pengirim kebetulan mengirim nilai default yang sama.
      if (!SETUP_SECRET || SETUP_SECRET === SETUP_SECRET_DEFAULT || request.setupKey !== SETUP_SECRET) {
        return responseJSON({
          success: false,
          message: 'Akses setup ditolak. Jalankan setupInitialDatabase() langsung dari editor Apps Script.'
        });
      }
      return responseJSON(setupInitialDatabase());
    }

    // Token-required actions
    const token = request.token;
    if (!token) {
      return responseJSON({ success: false, message: 'Token sesi diperlukan' });
    }

    const session = validateSession(token);
    if (!session) {
      return responseJSON({ success: false, message: 'Sesi tidak valid atau telah kedaluwarsa', unauthorized: true });
    }

    // Route actions
    switch (action) {
      case 'validate_session':
        return responseJSON({ success: true, user: session });

      case 'logout':
        return responseJSON(logoutUser(token));

      case 'get_profile':
        return responseJSON(getUserProfile(session));

      // --- USTAZ ENDPOINTS ---
      case 'ustaz_get_dashboard':
        return responseJSON(ustazGetDashboard(session));

      case 'ustaz_get_santri_detail':
        return responseJSON(ustazGetSantriDetail(session, request.santriId));

      case 'ustaz_add_setoran':
        return responseJSON(ustazAddSetoran(session, request.data));

      case 'ustaz_save_target':
        return responseJSON(ustazSaveTarget(session, request.data));

      case 'ustaz_send_feedback':
        return responseJSON(ustazSendFeedback(session, request.data));

      case 'ustaz_send_broadcast':
        return responseJSON(ustazSendBroadcast(session, request.data));

      // --- SANTRI ENDPOINTS ---
      case 'santri_get_dashboard':
        return responseJSON(santriGetDashboard(session));

      case 'santri_confirm_murojaah':
        return responseJSON(santriConfirmMurojaah(session, request.data));

      case 'santri_submit_flashcard_test':
        return responseJSON(santriSubmitFlashcard(session, request.data));

      case 'santri_mark_notif_read':
        return responseJSON(markNotificationRead(session, request.notifId));

      // --- ORTU ENDPOINTS ---
      case 'ortu_get_dashboard':
        return responseJSON(ortuGetDashboard(session));

      case 'ortu_get_random_test':
        return responseJSON(ortuGetRandomTest(session));

      case 'ortu_submit_test_result':
        return responseJSON(ortuSubmitTestResult(session, request.data));

      case 'ortu_send_apresiasi':
        return responseJSON(ortuSendApresiasi(session, request.data));

      // --- QURAN CACHE ENDPOINTS ---
      case 'get_ayah_content':
        return responseJSON(getAyahContent(request.surah, request.ayah));

      default:
        return responseJSON({ success: false, message: 'Action tidak ditemukan: ' + action });
    }
  } catch (error) {
    return responseJSON({
      success: false,
      message: 'Terjadi kesalahan pemrosesan server',
      error: error.toString()
    });
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// HELPER GET SPREADSHEET
// ============================================================

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

/**
 * Akuisisi lock dengan retry + backoff, lalu MENANDai bila gagal.
 * waitLock(5000) terlalu pendek saat antrean tulis menumpuk (penyebab
 * kegagalan "Server sibuk" yang sering dialami pengguna).
 */
function acquireLock(lock, timeoutMs) {
  const timeout = Number(timeoutMs) || 15000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      lock.waitLock(timeout);
      return true;
    } catch (e) {
      Utilities.sleep(250 * (attempt + 1));
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
    return { success: false, message: 'Username dan password wajib diisi' };
  }

  const sheet = getSheet('Users');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: false, message: 'Database pengguna kosong. Silakan setup database terlebih dahulu.' };
  }

  for (let i = 1; i < data.length; i++) {
    // Kolom: ID(0), Username(1), Password_Hash(2), Role(3), Nama(4), ID_Terkait(5)
    if (String(data[i][1]).toLowerCase() === String(username).toLowerCase() && verifyPassword(password, data[i][2])) {
      const userId = String(data[i][0]);
      const role = String(data[i][3]).toLowerCase();
      const nama = String(data[i][4]);
      const idTerkait = String(data[i][5] || '');

      const token = saveSession(userId, role, idTerkait, nama);
      if (!token) {
        return { success: false, message: 'Gagal membuat sesi, server sedang sibuk' };
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

  return { success: false, message: 'Username atau password salah' };
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
    return token;
  } finally {
    // Pastikan tulisan benar-benar ter-commit sebelum lock dilepas, agar
    // request berikutnya tidak membaca data lama.
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

function validateSession(token) {
  const sheet = getSheet('Sessions');
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    // Kolom: Token(0), ID_User(1), Role(2), Expiry(3), ID_Terkait(4), Nama(5)
    if (data[i][0] === token) {
      const expiryDate = new Date(data[i][3]);
      if (expiryDate < now) {
        return null; // Expired
      }
      return {
        userId: String(data[i][1]),
        role: String(data[i][2]),
        idTerkait: String(data[i][4] || ''),
        nama: String(data[i][5] || '')
      };
    }
  }
  return null;
}

function logoutUser(token) {
  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return { success: false, message: 'Server sedang sibuk menyimpan data. Coba lagi sebentar.' };
  }

  try {
    const sheet = getSheet('Sessions');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === token) {
        sheet.deleteRow(i + 1);
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

function getConfigMap() {
  if (__configCache) return __configCache;
  const sheet = getSheet('Config');
  const data = sheet.getDataRange().getValues();
  const map = {
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
    ARCHIVE_AMBANG_BULAN: 6
  };

  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    const val = data[i][1];
    if (key && val !== '') {
      map[key] = !isNaN(Number(val)) ? Number(val) : val;
    }
  }
  __configCache = map;
  return map;
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
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(masterId)) {
      const currentStatus = data[i][7] || 'Hijau';          // Retention_Status_Cache (kolom 8)
      const currentInterval = data[i][9] || 1;              // Current_Interval_Hari (kolom 10)
      const consecutiveLupa = data[i][10] || 0;             // Consecutive_Lupa (kolom 11)
      const consecutiveLancar = data[i][11] || 0;           // Consecutive_Lancar (kolom 12)

      const result = calculateNextRetentionState(currentStatus, currentInterval, consecutiveLupa, consecutiveLancar, quality, config);

      // Update kolom 8-12 Master_Hafalan (Retention_Status_Cache .. Consecutive_Lancar).
      // Baris lama tanpa kolom ke-12 tetap aman: Sheets hanya menulis sel di kanan.
      sheet.getRange(i + 1, 8, 1, 5).setValues([[
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
  const data = sheet.getDataRange().getValues();
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

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(santriId)) {
      rowIndex = i + 1;
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
  const badgeData = badgeSheet.getDataRange().getValues();
  const existingBadges = new Set();

  for (let i = 1; i < badgeData.length; i++) {
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
  const masterSheet = getSheet('Master_Hafalan');
  const masterData = masterSheet.getDataRange().getValues();
  const todayStr = appTodayStr();
  const ambangSabqi = Number(config.AMBANG_SABQI_HARI || 30);

  const units = [];
  for (let i = 1; i < masterData.length; i++) {
    if (String(masterData[i][1]) === String(santriId)) {
      units.push({
        idMaster: String(masterData[i][0]),
        surah: String(masterData[i][2]),
        ayatMulai: Number(masterData[i][3]),
        ayatAkhir: Number(masterData[i][4]),
        tglMulai: masterData[i][5],
        diffDays: diffDaysFrom(masterData[i][5]),
        retentionStatus: masterData[i][7] || 'Hijau',
        nextReview: toDateStr(masterData[i][8]) || todayStr,
        interval: Number(masterData[i][9]) || 1,
        consecutiveLupa: Number(masterData[i][10]) || 0,
        consecutiveLancar: Number(masterData[i][11]) || 0
      });
    }
  }

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
  const murojaahSheet = getSheet('Murojaah');
  const murojaahData = murojaahSheet.getDataRange().getValues();
  const completedKeys = new Set();

  for (let i = 1; i < murojaahData.length; i++) {
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
function ustazGetDashboard(session) {
  if (session.role !== 'ustaz') {
    return { success: false, message: 'Akses khusus Ustaz' };
  }

  const santriSheet = getSheet('Santri');
  const masterSheet = getSheet('Master_Hafalan');
  const targetSheet = getSheet('Target');
  const gamifikasiSheet = getSheet('Gamifikasi');

  const santriData = santriSheet ? santriSheet.getDataRange().getValues() : [];
  const masterData = masterSheet ? masterSheet.getDataRange().getValues() : [];
  const targetData = targetSheet ? targetSheet.getDataRange().getValues() : [];
  const gamifikasiData = gamifikasiSheet ? gamifikasiSheet.getDataRange().getValues() : [];

  const santriList = [];
  const todayStr = appTodayStr();

  for (let i = 1; i < santriData.length; i++) {
    // Filter santri sesuai ID_Ustaz atau jika ID_Ustaz kosong / admin
    const idSantri = String(santriData[i][0]);
    const namaSantri = String(santriData[i][1]);
    const idUstaz = String(santriData[i][2]);
    const statusSantri = String(santriData[i][3]);

    // Filter kelompok: hanya santri bimbingan ustaz ini (PRD Section 16).
    // Santri dengan ID_Ustaz kosong tetap ditampilkan agar data hasil migrasi
    // tidak hilang dari matriks ustaz.
    const isMySantri = !idUstaz || idUstaz === session.userId || (!!session.idTerkait && idUstaz === session.idTerkait);
    if (!isMySantri) continue;

    // Hitung status retensi dari Master_Hafalan cache
    let countHijau = 0;
    let countKuning = 0;
    let countMerah = 0;
    let overdueCount = 0;
    let totalHafalan = 0;
    // Hafalan terakhir (umur paling muda) -> dipakai usulan target 1-klik.
    let lastUnit = null;
    let lastUnitAge = Infinity;

    for (let j = 1; j < masterData.length; j++) {
      if (String(masterData[j][1]) === idSantri) {
        totalHafalan++;
        const retStatus = masterData[j][7] || 'Hijau';
        const nextReview = toDateStr(masterData[j][8]);

        if (retStatus === 'Hijau') countHijau++;
        else if (retStatus === 'Kuning') countKuning++;
        else if (retStatus === 'Merah') countMerah++;

        if (nextReview && nextReview < todayStr) {
          overdueCount++;
        }

        const age = diffDaysFrom(masterData[j][5]);
        if (age < lastUnitAge) {
          lastUnitAge = age;
          lastUnit = {
            surah: String(masterData[j][2]),
            ayatMulai: Number(masterData[j][3]),
            ayatAkhir: Number(masterData[j][4]),
            retentionStatus: retStatus
          };
        }
      }
    }

    // Gamifikasi data
    let streak = 0;
    let xp = 0;
    let level = 1;
    let longestStreak = 0;
    for (let k = 1; k < gamifikasiData.length; k++) {
      if (String(gamifikasiData[k][0]) === idSantri) {
        xp = Number(gamifikasiData[k][1]) || 0;
        level = Number(gamifikasiData[k][2]) || 1;
        streak = Number(gamifikasiData[k][3]) || 0;
        longestStreak = Number(gamifikasiData[k][4]) || 0;
        break;
      }
    }

    // Target bulan ini
    let currentTarget = null;
    const currentMonthStr = appTodayStr().slice(0, 7); // YYYY-MM
    for (let m = 1; m < targetData.length; m++) {
      if (String(targetData[m][2]) === idSantri && String(targetData[m][1]).startsWith(currentMonthStr)) {
        currentTarget = {
          idTarget: targetData[m][0],
          bulan: String(targetData[m][1]),
          surah: targetData[m][3],
          ayatMulai: targetData[m][4],
          ayatAkhir: targetData[m][5]
        };
        break;
      }
    }

    // Progres capaian target bulan ini (untuk Notifikasi Target Ustaz).
    let targetProgress = null;
    if (currentTarget) {
      const norm = function (v) { return String(v || '').replace(/[^a-z0-9]/gi, '').toLowerCase(); };
      const tMulai = Number(currentTarget.ayatMulai) || 0;
      const tAkhir = Number(currentTarget.ayatAkhir) || 0;
      const tTotal = Math.max(0, tAkhir - tMulai + 1);
      const covered = {};
      for (let n = 1; n < masterData.length; n++) {
        if (String(masterData[n][1]) !== idSantri) continue;
        if (norm(masterData[n][2]) !== norm(currentTarget.surah)) continue;
        const a = Math.max(tMulai, Number(masterData[n][3]) || 0);
        const b = Math.min(tAkhir, Number(masterData[n][4]) || 0);
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
    if (countMerah > 0) flags.push(`Kritis: ${countMerah} unit hafalan status Merah`);
    if (overdueCount >= 2) flags.push(`Overdue: ${overdueCount} jadwal review terlewat`);
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
      flags: flags
    });
  }

  return {
    success: true,
    ustazName: session.nama,
    santriList: santriList,
    stats: {
      totalSantri: santriList.length,
      totalMerah: santriList.reduce((acc, s) => acc + s.retention.merah, 0),
      totalKuning: santriList.reduce((acc, s) => acc + s.retention.kuning, 0),
      totalHijau: santriList.reduce((acc, s) => acc + s.retention.hijau, 0),
      flaggedSantri: santriList.filter(s => s.flags.length > 0).length
    }
  };
}

// Ustaz Add Setoran
function ustazAddSetoran(session, payload) {
  if (session.role !== 'ustaz') return { success: false, message: 'Unauthorized' };

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return { success: false, message: 'Server sedang sibuk menyimpan data. Coba lagi sebentar.' };
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
    const masterData = masterSheet.getDataRange().getValues();
    let existingIndex = -1;

    for (let i = 1; i < masterData.length; i++) {
      if (
        String(masterData[i][1]) === String(payload.idSantri) &&
        String(masterData[i][2]).toLowerCase() === String(payload.surah).toLowerCase() &&
        Number(masterData[i][3]) === Number(payload.ayatMulai) &&
        Number(masterData[i][4]) === Number(payload.ayatAkhir)
      ) {
        existingIndex = i + 1;
        break;
      }
    }

    // Nilai setoran (A/B+/B/C) diterjemahkan ke kualitas evaluasi, lalu dipakai
    // oleh retention engine — bukan selalu dipaksa "Hijau" seperti sebelumnya.
    const quality = payload.nilai === 'A' || payload.nilai === 'B+' ? 'Lancar' : (payload.nilai === 'C' ? 'Lupa' : 'Tersendat');

    if (existingIndex > 0) {
      // Update cache unit yang sudah ada memakai rumus SM-2-lite.
      const row = masterData[existingIndex - 1];
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
  if (session.role !== 'ustaz') return { success: false, message: 'Unauthorized' };

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return { success: false, message: 'Server sedang sibuk menyimpan data. Coba lagi sebentar.' };
  }

  try {
    const targetSheet = getSheet('Target');
    const data = targetSheet.getDataRange().getValues();
    const bulan = payload.bulan || appTodayStr().slice(0, 7);

    let updated = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]) === String(payload.idSantri) && String(data[i][1]) === bulan) {
        targetSheet.getRange(i + 1, 4, 1, 3).setValues([[
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
function ustazSendFeedback(session, payload) {
  if (session.role !== 'ustaz') return { success: false, message: 'Unauthorized' };

  const feedbackSheet = getSheet('Feedback');
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

  return { success: true, message: 'Feedback berhasil dikirim ke santri' };
}

// Ustaz Send Broadcast
function ustazSendBroadcast(session, payload) {
  if (session.role !== 'ustaz') return { success: false, message: 'Unauthorized' };
  if (!payload || !payload.pesan) return { success: false, message: 'Pesan broadcast wajib diisi' };

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return { success: false, message: 'Server sedang sibuk. Coba lagi sebentar.' };
  }

  try {
    const notifSheet = getSheet('Notifikasi');
    const santriSheet = getSheet('Santri');
    const santriData = santriSheet.getDataRange().getValues();
    const todayStr = appTodayStr();

    // Batch write: susun semua baris dulu, lalu tulis sekali (setValues).
    // Sebelumnya appendRow dipanggil per santri — penyebab broadcast lambat /
    // timeout ketika jumlah santri banyak.
    const rows = [];
    for (let i = 1; i < santriData.length; i++) {
      const idSantri = String(santriData[i][0]);
      if (!idSantri) continue;
      rows.push([
        Utilities.getUuid(),
        idSantri,
        'Broadcast Ustaz',
        `Pesan dari Ustaz ${session.nama}: "${payload.pesan}"`,
        todayStr,
        'Belum'
      ]);
    }
    if (rows.length > 0) {
      notifSheet.getRange(notifSheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    }

    return { success: true, message: 'Pesan broadcast terkirim ke seluruh santri' };
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
  const data = santriSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(santriId)) {
      const idUstaz = String(data[i][2] || '');
      return !idUstaz || idUstaz === session.userId || (!!session.idTerkait && idUstaz === session.idTerkait);
    }
  }
  return false;
}

// Ustaz Get Santri Detail
function ustazGetSantriDetail(session, santriId) {
  if (!santriId) return { success: false, message: 'ID santri wajib dikirim' };

  // Otorisasi (PRD Section 16): ustaz hanya untuk santri kelompoknya,
  // santri hanya untuk datanya sendiri.
  const isSantriSelf = session.role === 'santri' && String(santriId) === String(session.userId);
  if (!isSantriSelf && session.role !== 'ustaz') {
    return { success: false, message: 'Akses ditolak' };
  }
  if (session.role === 'ustaz' && !isSantriInUstazGroup(session, santriId)) {
    return { success: false, message: 'Santri ini bukan bagian dari kelompok bimbingan Anda' };
  }

  const masterSheet = getSheet('Master_Hafalan');
  const hafalanSheet = getSheet('Hafalan');
  const tesSheet = getSheet('Riwayat_Tes');
  const murojaahSheet = getSheet('Murojaah');

  const masterData = masterSheet.getDataRange().getValues();
  const hafalanData = hafalanSheet.getDataRange().getValues();
  const tesData = tesSheet.getDataRange().getValues();
  const murojaahData = murojaahSheet.getDataRange().getValues();

  const units = [];
  for (let i = 1; i < masterData.length; i++) {
    if (String(masterData[i][1]) === String(santriId)) {
      units.push({
        idMaster: masterData[i][0],
        surah: masterData[i][2],
        ayatMulai: masterData[i][3],
        ayatAkhir: masterData[i][4],
        tglMulai: masterData[i][5],
        status: masterData[i][6],
        retentionStatus: masterData[i][7] || 'Hijau',
        nextReview: masterData[i][8],
        interval: masterData[i][9],
        consecutiveLupa: masterData[i][10]
      });
    }
  }

  const setoranHistory = [];
  for (let i = 1; i < hafalanData.length; i++) {
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
    return { success: false, message: 'Akun ini tidak terhubung dengan data santri (ID_Terkait kosong)' };
  }
  const config = getConfigMap();

  // 1. Daily Missions
  const missions = generateDailyMissions(santriId, config);

  // 2. Gamifikasi
  const gamifikasiSheet = getSheet('Gamifikasi');
  const gamifData = gamifikasiSheet.getDataRange().getValues();
  let gamifikasi = { xp: 0, level: 1, currentStreak: 0, longestStreak: 0, lastQualifyingDate: '' };

  for (let i = 1; i < gamifData.length; i++) {
    if (String(gamifData[i][0]) === String(santriId)) {
      gamifikasi = {
        xp: Number(gamifData[i][1]) || 0,
        level: Number(gamifData[i][2]) || 1,
        currentStreak: Number(gamifData[i][3]) || 0,
        longestStreak: Number(gamifData[i][4]) || 0,
        lastQualifyingDate: gamifData[i][5] || ''
      };
      break;
    }
  }

  // 3. Badges
  const badgeSheet = getSheet('Badge');
  const badgeData = badgeSheet.getDataRange().getValues();
  const badges = [];
  for (let i = 1; i < badgeData.length; i++) {
    if (String(badgeData[i][1]) === String(santriId)) {
      badges.push({
        idBadge: badgeData[i][0],
        nama: badgeData[i][2],
        tgl: badgeData[i][3]
      });
    }
  }

  // 4. Notifications & Feedbacks
  const notifSheet = getSheet('Notifikasi');
  const notifData = notifSheet.getDataRange().getValues();
  const notifications = [];
  for (let i = 1; i < notifData.length; i++) {
    if (String(notifData[i][1]) === String(santriId)) {
      notifications.push({
        idNotif: notifData[i][0],
        tipe: notifData[i][2],
        pesan: notifData[i][3],
        tgl: notifData[i][4],
        dibaca: notifData[i][5] === 'Sudah'
      });
    }
  }

  // 5. Activity Heatmap (Last 30 Days)
  const murojaahSheet = getSheet('Murojaah');
  const murojaahData = murojaahSheet.getDataRange().getValues();
  const activityMap = {};

  for (let i = 1; i < murojaahData.length; i++) {
    if (String(murojaahData[i][2]) === String(santriId)) {
      const tgl = toDateStr(murojaahData[i][1]);
      if (tgl) {
        activityMap[tgl] = (activityMap[tgl] || 0) + 1;
      }
    }
  }

  return {
    success: true,
    nama: session.nama,
    santriId: santriId,
    missions: missions,
    gamifikasi: gamifikasi,
    badges: badges,
    notifications: notifications.slice(-10).reverse(),
    activityMap: activityMap
  };
}

// Santri Confirm Murojaah
function santriConfirmMurojaah(session, payload) {
  // Otorisasi: hanya santri (atau admin) yang boleh mengonfirmasi murojaah.
  if (session.role !== 'santri' && session.role !== 'admin') {
    return { success: false, message: 'Akses khusus Santri' };
  }

  const santriId = session.role === 'santri' ? session.userId : (payload.idSantri || session.idTerkait);
  if (!santriId) {
    return { success: false, message: 'ID santri tidak ditemukan' };
  }  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return { success: false, message: 'Server sedang sibuk menyimpan data. Coba lagi sebentar.' };
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
function santriSubmitFlashcard(session, payload) {
  if (session.role !== 'santri' && session.role !== 'admin') {
    return { success: false, message: 'Akses khusus Santri' };
  }

  const santriId = session.role === 'santri' ? session.userId : session.idTerkait;
  if (!santriId) {
    return { success: false, message: 'ID santri tidak ditemukan' };
  }
  const config = getConfigMap();

  let recoveryAchieved = false;
  if (payload.idMaster) {
    const res = updateMasterHafalanCache(payload.idMaster, payload.isCorrect ? 'Lancar' : 'Tersendat', config);
    if (res && res.recoveryAchieved) recoveryAchieved = true;
  }

  const baseXP = payload.isCorrect ? 5 : 1;
  // isQualifying=false: flashcard bukan misi Sabaq/Sabqi/Manzil, jadi sesuai
  // PRD 13.3 jawaban flashcard menambah XP tetapi TIDAK menambah streak.
  const gamifResult = awardXPAndQualifyingActivity(santriId, baseXP, 0, false, recoveryAchieved, config);

  return {
    success: true,
    message: payload.isCorrect ? 'Jawaban Benar! +5 XP' : 'Tetap Semangat! +1 XP',
    gamifikasi: gamifResult
  };
}

function markNotificationRead(session, notifId) {
  if (!notifId) return { success: false, message: 'ID notifikasi wajib dikirim' };

  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return { success: false, message: 'Server sedang sibuk. Coba lagi sebentar.' };
  }

  try {
    const notifSheet = getSheet('Notifikasi');
    const data = notifSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(notifId)) {
        // Otorisasi: notifikasi hanya boleh ditandai oleh pemiliknya.
        const owner = String(data[i][1]);
        const isOwner = owner === String(session.userId) || (!!session.idTerkait && owner === String(session.idTerkait));
        if (!isOwner) {
          return { success: false, message: 'Notifikasi ini bukan milik akun Anda' };
        }
        notifSheet.getRange(i + 1, 6).setValue('Sudah');
        return { success: true };
      }
    }
    return { success: false, message: 'Notifikasi tidak ditemukan' };
  } finally {
    try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('flush gagal: ' + flushErr); }
    lock.releaseLock();
  }
}

// --- 3. ORTU DASHBOARD & SMART RANDOM TEST ---
function ortuGetDashboard(session) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }

  const ss = getSpreadsheet();
  const santriSheet = ss.getSheetByName('Santri');
  const masterSheet = ss.getSheetByName('Master_Hafalan');
  const gamifSheet = ss.getSheetByName('Gamifikasi');
  const tesSheet = ss.getSheetByName('Riwayat_Tes');

  let santriName = 'Ananda';
  if (santriSheet) {
    const sData = santriSheet.getDataRange().getValues();
    for (let i = 1; i < sData.length; i++) {
      if (String(sData[i][0]) === String(santriId)) {
        santriName = sData[i][1];
        break;
      }
    }
  }

  // Retention breakdown
  const masterData = masterSheet ? masterSheet.getDataRange().getValues() : [];
  let countHijau = 0;
  let countKuning = 0;
  let countMerah = 0;
  const unitList = [];

  for (let i = 1; i < masterData.length; i++) {
    if (String(masterData[i][1]) === String(santriId)) {
      const status = masterData[i][7] || 'Hijau';
      if (status === 'Hijau') countHijau++;
      else if (status === 'Kuning') countKuning++;
      else if (status === 'Merah') countMerah++;

      unitList.push({
        idMaster: masterData[i][0],
        surah: masterData[i][2],
        ayatMulai: masterData[i][3],
        ayatAkhir: masterData[i][4],
        retentionStatus: status,
        nextReview: masterData[i][8]
      });
    }
  }

  // Gamifikasi
  let streak = 0;
  let xp = 0;
  let level = 1;
  let longestStreak = 0;
  if (gamifSheet) {
    const gData = gamifSheet.getDataRange().getValues();
    for (let i = 1; i < gData.length; i++) {
      if (String(gData[i][0]) === String(santriId)) {
        xp = Number(gData[i][1]) || 0;
        level = Number(gData[i][2]) || 1;
        streak = Number(gData[i][3]) || 0;
        longestStreak = Number(gData[i][4]) || 0;
        break;
      }
    }
  }

  // Recent test history
  const testHistory = [];
  if (tesSheet) {
    const tData = tesSheet.getDataRange().getValues();
    for (let i = 1; i < tData.length; i++) {
      if (String(tData[i][2]) === String(santriId)) {
        testHistory.push({
          idTes: tData[i][0],
          tgl: toDateStr(tData[i][1]),
          surah: tData[i][4],
          ayatMulai: tData[i][5],
          ayatAkhir: tData[i][6],
          kualitas: tData[i][7],
          pelapor: tData[i][8]
        });
      }
    }
  }

  return {
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
    // Kirim riwayat lebih banyak agar filter bulan di klien berguna
    // (UI tetap membatasi tampilan). Diurutkan terbaru lebih dulu.
    recentTests: testHistory.slice(-100).reverse()
  };
}

// Ortu Smart Random Test (PRD Section 12)
function ortuGetRandomTest(session) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }

  const masterSheet = getSheet('Master_Hafalan');
  const masterData = masterSheet.getDataRange().getValues();
  const todayStr = appTodayStr();

  const pool = [];
  for (let i = 1; i < masterData.length; i++) {
    if (String(masterData[i][1]) === String(santriId)) {
      const diffDays = diffDaysFrom(masterData[i][5]);

      // Keluarkan hafalan yang terlalu baru (<1 hari)
      if (diffDays >= 1) {
        const status = masterData[i][7] || 'Hijau';
        const nextReview = toDateStr(masterData[i][8]) || todayStr;
        const isOverdue = nextReview <= todayStr;

        // Weighting: Merah / Overdue prioritas paling tinggi
        let weight = 1;
        if (status === 'Merah') weight = 5;
        else if (status === 'Kuning') weight = 3;
        if (isOverdue) weight += 2;

        pool.push({
          idMaster: masterData[i][0],
          surah: masterData[i][2],
          ayatMulai: masterData[i][3],
          ayatAkhir: masterData[i][4],
          retentionStatus: status,
          weight: weight
        });
      }
    }
  }

  if (pool.length === 0) {
    return {
      success: false,
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
    return { success: false, message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }  const lock = LockService.getScriptLock();
  if (!acquireLock(lock)) {
    return { success: false, message: 'Server sedang sibuk menyimpan data. Coba lagi sebentar.' };
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
function ortuSendApresiasi(session, payload) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
  if (!santriId) {
    return { success: false, message: 'Akun ini belum terhubung ke data santri (ID_Terkait kosong)' };
  }

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
}

// ============================================================
// QURAN API & AYAH CACHE
// ============================================================

function getAyahContent(surah, ayah) {
  const ayahNum = Number(ayah);
  if (!ayahNum || ayahNum < 1) {
    return { success: false, message: 'Nomor ayat tidak valid' };
  }  const cacheSheet = getSheet('Cache_Ayat');
  const cacheData = cacheSheet.getDataRange().getValues();

  for (let i = 1; i < cacheData.length; i++) {
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

        // Simpan ke Cache_Ayat (kolom 6: Teks_Indonesia, opsional).
        cacheSheet.appendRow([surah, ayahNum, arabicText, audioUrl, new Date().toISOString(), translationText]);

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
    message: 'Teks ayat belum tersedia (cache kosong & provider eksternal tidak merespons)'
  };
}

// ============================================================
// NIGHTLY CRON TRIGGER (RECOMPUTE & CLEANUP)
// ============================================================

function runNightlyRetentionRecompute() {
  const masterSheet = getSheet('Master_Hafalan');
  const masterData = masterSheet.getDataRange().getValues();
  const todayDateStr = appTodayStr();

  // Downgrade terjadwal: unit Hijau yang jadwal reviewnya terlewat >= 3 hari -> Kuning.
  // Ditulis sekali (batch setValues) agar tidak memanggil setValue per baris (NFR Performance).
  const statusColumn = [];
  let changed = false;

  for (let i = 1; i < masterData.length; i++) {
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
  const sessionData = sessionSheet.getDataRange().getValues();
  const now = new Date();
  let blockStart = -1;
  let blockEnd = -1;
  for (let j = sessionData.length - 1; j >= 1; j--) {
    const expiry = new Date(sessionData[j][3]);
    const expired = !isNaN(expiry.getTime()) && expiry < now;
    if (expired) {
      const row = j + 1;
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
    ['ARCHIVE_AMBANG_BULAN', 6, 'Ambang waktu arsip riwayat']
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
