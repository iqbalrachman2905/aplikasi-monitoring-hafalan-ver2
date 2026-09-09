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

function getSpreadsheet() {
  try {
    if (SPREADSHEET_ID && SPREADSHEET_ID.length > 5) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
  } catch (e) {
    // Fallback if bound to container
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

// ============================================================
// AUTH & SESSION MANAGEMENT
// ============================================================

function hashPassword(plainPassword) {
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plainPassword),
    Utilities.Charset.UTF_8
  );
  return rawHash
    .map(function (byte) {
      const v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? '0' + v : v;
    })
    .join('');
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

  const inputHash = hashPassword(password);
  for (let i = 1; i < data.length; i++) {
    // Kolom: ID(0), Username(1), Password_Hash(2), Role(3), Nama(4), ID_Terkait(5)
    if (String(data[i][1]).toLowerCase() === String(username).toLowerCase() && data[i][2] === inputHash) {
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
  try {
    lock.waitLock(5000);
  } catch (e) {
    return null;
  }

  try {
    const sheet = getSheet('Sessions');
    const token = Utilities.getUuid();
    const expiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    sheet.appendRow([token, userId, role, expiry.toISOString(), idTerkait || '', nama || '']);
    return token;
  } finally {
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
  try {
    lock.waitLock(5000);
  } catch (e) {
    return { success: false, message: 'Lock timeout' };
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
  return map;
}

// ============================================================
// RETENTION ENGINE (SM-2-lite) & EVENT-DRIVEN CACHE UPDATER
// ============================================================

/**
 * Menghitung interval baru dan status retensi untuk 1 unit Master Hafalan
 * berdasarkan hasil evaluasi terbaru (Lancar / Tersendat / Lupa).
 */
function calculateNextRetentionState(currentStatus, currentInterval, consecutiveLupa, quality, config) {
  let newInterval = Number(currentInterval) || 1;
  let newConsecutiveLupa = Number(consecutiveLupa) || 0;
  let newStatus = currentStatus || 'Hijau';
  let recoveryAchieved = false;

  const multLancar = Number(config.INTERVAL_MULTIPLIER_LANCAR || 1.5);
  const multTersendat = Number(config.INTERVAL_MULTIPLIER_TERSENDAT || 0.5);
  const maxCap = Number(config.INTERVAL_CAP_MAKS_HARI || 60);
  const minLupa = Number(config.INTERVAL_LUPA_HARI || 1);

  if (quality === 'Lancar') {
    newInterval = Math.min(maxCap, Math.ceil(newInterval * multLancar));
    if (newInterval < 1) newInterval = 1;

    // Reset hitungan lupa
    newConsecutiveLupa = 0;

    // Recovery check jika tadinya merah
    if (currentStatus === 'Merah') {
      newStatus = 'Kuning'; // Recovery tahap 1
      recoveryAchieved = true;
    } else if (currentStatus === 'Kuning') {
      newStatus = 'Hijau'; // Normal kembali
    } else {
      newStatus = 'Hijau';
    }
  } else if (quality === 'Tersendat') {
    newInterval = Math.max(1, Math.floor(newInterval * multTersendat));
    newConsecutiveLupa = 0;
    if (newStatus !== 'Merah') {
      newStatus = 'Kuning';
    }
  } else if (quality === 'Lupa') {
    newInterval = minLupa;
    newConsecutiveLupa += 1;
    if (newConsecutiveLupa >= 2 || currentStatus === 'Merah') {
      newStatus = 'Merah';
    } else {
      newStatus = 'Kuning';
    }
  }

  // Hitung tanggal next review (hari ini + newInterval)
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);
  const nextReviewStr = nextDate.toISOString().split('T')[0];

  return {
    newStatus: newStatus,
    newInterval: newInterval,
    newConsecutiveLupa: newConsecutiveLupa,
    nextReviewStr: nextReviewStr,
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
      const currentStatus = data[i][7] || 'Hijau'; // Kolom Retention_Status_Cache
      const currentInterval = data[i][9] || 1;    // Kolom Current_Interval_Hari
      const consecutiveLupa = data[i][10] || 0;   // Kolom Consecutive_Lupa

      const result = calculateNextRetentionState(currentStatus, currentInterval, consecutiveLupa, quality, config);

      // Update baris di sheet Master_Hafalan:
      // Kolom 7: Retention_Status_Cache (Index 7 -> Col 8)
      // Kolom 8: Next_Review_Cache (Index 8 -> Col 9)
      // Kolom 9: Current_Interval_Hari (Index 9 -> Col 10)
      // Kolom 10: Consecutive_Lupa (Index 10 -> Col 11)
      sheet.getRange(i + 1, 8, 1, 4).setValues([[
        result.newStatus,
        result.nextReviewStr,
        result.newInterval,
        result.newConsecutiveLupa
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
  const todayStr = new Date().toISOString().split('T')[0];

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
      lastQualifyingDate = data[i][5] ? String(data[i][5]).split('T')[0] : '';
      break;
    }
  }

  const newXP = currentXP + totalXPToAdd;
  const newLevel = Math.floor(newXP / 100) + 1;

  // Logika Streak Terkunci (PRD Section 13.3)
  if (isQualifying) {
    if (lastQualifyingDate === todayStr) {
      // Sudah qualifying hari ini, streak tidak bertambah lagi hari ini
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastQualifyingDate === yesterdayStr) {
        currentStreak += 1;
      } else {
        currentStreak = 1; // Mulai streak baru
      }
      lastQualifyingDate = todayStr;
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

  const todayStr = new Date().toISOString().split('T')[0];
  candidates.forEach(badgeName => {
    badgeSheet.appendRow([Utilities.getUuid(), santriId, badgeName, todayStr]);
  });
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
  const todayStr = new Date().toISOString().split('T')[0];
  const ambangSabqi = Number(config.AMBANG_SABQI_HARI || 30);

  const units = [];
  for (let i = 1; i < masterData.length; i++) {
    if (String(masterData[i][1]) === String(santriId)) {
      const tglMulai = masterData[i][5] ? new Date(masterData[i][5]) : new Date();
      const diffDays = Math.floor((new Date() - tglMulai) / (1000 * 60 * 60 * 24));

      units.push({
        idMaster: String(masterData[i][0]),
        surah: String(masterData[i][2]),
        ayatMulai: Number(masterData[i][3]),
        ayatAkhir: Number(masterData[i][4]),
        tglMulai: masterData[i][5],
        diffDays: diffDays,
        retentionStatus: masterData[i][7] || 'Hijau',
        nextReview: masterData[i][8] ? String(masterData[i][8]).split('T')[0] : todayStr,
        interval: Number(masterData[i][9]) || 1,
        consecutiveLupa: Number(masterData[i][10]) || 0
      });
    }
  }

  // 1. Sabaq: hafalan paling baru (diffDays terendah <= 1 atau hafalan terakhir ditambahkan)
  units.sort((a, b) => a.diffDays - b.diffDays);
  const sabaqUnit = units.length > 0 ? units[0] : null;

  // 2. Sabqi: hafalan umur 1-30 hari
  const sabqiUnits = units.filter(u => u.diffDays > 0 && u.diffDays <= ambangSabqi && (!sabaqUnit || u.idMaster !== sabaqUnit.idMaster));

  // 3. Manzil: hafalan > 30 hari atau yang statusnya Merah / Overdue review
  const manzilUnits = units.filter(u => (u.diffDays > ambangSabqi || u.retentionStatus === 'Merah' || u.nextReview <= todayStr) && (!sabaqUnit || u.idMaster !== sabaqUnit.idMaster));

  // Cek apakah sudah diselesaikan hari ini dari sheet Murojaah
  const murojaahSheet = getSheet('Murojaah');
  const murojaahData = murojaahSheet.getDataRange().getValues();
  const completedToday = new Set();

  for (let i = 1; i < murojaahData.length; i++) {
    const tgl = murojaahData[i][1] ? String(murojaahData[i][1]).split('T')[0] : '';
    if (String(murojaahData[i][2]) === String(santriId) && tgl === todayStr) {
      completedToday.add(String(murojaahData[i][3])); // Jenis_Misi (Sabaq, Sabqi, Manzil)
    }
  }

  return {
    sabaq: sabaqUnit ? {
      ...sabaqUnit,
      completed: completedToday.has('Sabaq'),
      xp: Number(config.XP_SABAQ || 5)
    } : null,
    sabqi: sabqiUnits.slice(0, 3).map(u => ({
      ...u,
      completed: completedToday.has('Sabqi'),
      xp: Number(config.XP_SABQI || 8)
    })),
    manzil: manzilUnits.slice(0, 3).map(u => ({
      ...u,
      completed: completedToday.has('Manzil'),
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

  const ss = getSpreadsheet();
  const santriSheet = ss.getSheetByName('Santri');
  const masterSheet = ss.getSheetByName('Master_Hafalan');
  const targetSheet = ss.getSheetByName('Target');
  const gamifikasiSheet = ss.getSheetByName('Gamifikasi');

  const santriData = santriSheet ? santriSheet.getDataRange().getValues() : [];
  const masterData = masterSheet ? masterSheet.getDataRange().getValues() : [];
  const targetData = targetSheet ? targetSheet.getDataRange().getValues() : [];
  const gamifikasiData = gamifikasiSheet ? gamifikasiSheet.getDataRange().getValues() : [];

  const santriList = [];
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 1; i < santriData.length; i++) {
    // Filter santri sesuai ID_Ustaz atau jika ID_Ustaz kosong / admin
    const idSantri = String(santriData[i][0]);
    const namaSantri = String(santriData[i][1]);
    const idUstaz = String(santriData[i][2]);
    const statusSantri = String(santriData[i][3]);

    if (idUstaz && idUstaz !== session.userId && idUstaz !== session.idTerkait) {
      // Bukan santri bimbingan ustaz ini (kecuali jika ustaz superadmin)
      // Tetap sertakan jika demo/all
    }

    // Hitung status retensi dari Master_Hafalan cache
    let countHijau = 0;
    let countKuning = 0;
    let countMerah = 0;
    let overdueCount = 0;
    let totalHafalan = 0;

    for (let j = 1; j < masterData.length; j++) {
      if (String(masterData[j][1]) === idSantri) {
        totalHafalan++;
        const retStatus = masterData[j][7] || 'Hijau';
        const nextReview = masterData[j][8] ? String(masterData[j][8]).split('T')[0] : '';

        if (retStatus === 'Hijau') countHijau++;
        else if (retStatus === 'Kuning') countKuning++;
        else if (retStatus === 'Merah') countMerah++;

        if (nextReview && nextReview < todayStr) {
          overdueCount++;
        }
      }
    }

    // Gamifikasi data
    let streak = 0;
    let xp = 0;
    let level = 1;
    for (let k = 1; k < gamifikasiData.length; k++) {
      if (String(gamifikasiData[k][0]) === idSantri) {
        xp = Number(gamifikasiData[k][1]) || 0;
        level = Number(gamifikasiData[k][2]) || 1;
        streak = Number(gamifikasiData[k][3]) || 0;
        break;
      }
    }

    // Target bulan ini
    let currentTarget = null;
    const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
    for (let m = 1; m < targetData.length; m++) {
      if (String(targetData[m][2]) === idSantri && String(targetData[m][1]).startsWith(currentMonthStr)) {
        currentTarget = {
          idTarget: targetData[m][0],
          surah: targetData[m][3],
          ayatMulai: targetData[m][4],
          ayatAkhir: targetData[m][5]
        };
        break;
      }
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
        streak: streak
      },
      target: currentTarget,
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
  try {
    lock.waitLock(5000);
  } catch (e) {
    return { success: false, message: 'Server sibuk, coba beberapa saat lagi' };
  }

  try {
    const config = getConfigMap();
    const hafalanSheet = getSheet('Hafalan');
    const masterSheet = getSheet('Master_Hafalan');
    const todayStr = new Date().toISOString().split('T')[0];
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

    const quality = payload.nilai === 'A' || payload.nilai === 'B+' ? 'Lancar' : (payload.nilai === 'C' ? 'Lupa' : 'Tersendat');
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1); // Sabaq review besok

    if (existingIndex > 0) {
      // Update cache
      masterSheet.getRange(existingIndex, 8, 1, 4).setValues([[
        'Hijau',
        nextDate.toISOString().split('T')[0],
        2,
        0
      ]]);
    } else {
      const idMaster = 'MST-' + Utilities.getUuid().slice(0, 8);
      masterSheet.appendRow([
        idMaster,
        payload.idSantri,
        payload.surah,
        Number(payload.ayatMulai),
        Number(payload.ayatAkhir),
        todayStr,
        'Aktif',
        'Hijau',
        nextDate.toISOString().split('T')[0],
        2,
        0
      ]);
    }

    // 3. Award XP & Qualifying Activity
    const gamifResult = awardXPAndQualifyingActivity(payload.idSantri, Number(config.XP_SABAQ || 5), Number(config.XP_BONUS_LANCAR || 5), true, false, config);

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
    lock.releaseLock();
  }
}

// Ustaz Save Target
function ustazSaveTarget(session, payload) {
  if (session.role !== 'ustaz') return { success: false, message: 'Unauthorized' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (e) {
    return { success: false, message: 'Lock timeout' };
  }

  try {
    const targetSheet = getSheet('Target');
    const data = targetSheet.getDataRange().getValues();
    const bulan = payload.bulan || new Date().toISOString().slice(0, 7);

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
    lock.releaseLock();
  }
}

// Ustaz Send Feedback
function ustazSendFeedback(session, payload) {
  if (session.role !== 'ustaz') return { success: false, message: 'Unauthorized' };

  const feedbackSheet = getSheet('Feedback');
  const todayStr = new Date().toISOString().split('T')[0];
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

  const notifSheet = getSheet('Notifikasi');
  const santriSheet = getSheet('Santri');
  const santriData = santriSheet.getDataRange().getValues();
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 1; i < santriData.length; i++) {
    const idSantri = String(santriData[i][0]);
    notifSheet.appendRow([
      Utilities.getUuid(),
      idSantri,
      'Broadcast Ustaz',
      `Pesan dari Ustaz ${session.nama}: "${payload.pesan}"`,
      todayStr,
      'Belum'
    ]);
  }

  return { success: true, message: 'Pesan broadcast terkirim ke seluruh santri' };
}

// Ustaz Get Santri Detail
function ustazGetSantriDetail(session, santriId) {
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
      const tgl = murojaahData[i][1] ? String(murojaahData[i][1]).split('T')[0] : '';
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
  const santriId = session.role === 'santri' ? session.userId : (payload.idSantri || session.idTerkait);
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(5000);
  } catch (e) {
    return { success: false, message: 'Server busy' };
  }

  try {
    const config = getConfigMap();
    const murojaahSheet = getSheet('Murojaah');
    const todayStr = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();

    // 1. Simpan ke sheet Murojaah
    murojaahSheet.appendRow([
      'MUR-' + Utilities.getUuid().slice(0, 8),
      todayStr,
      santriId,
      payload.jenisMisi, // Sabaq, Sabqi, Manzil
      `${payload.surah || ''} (${payload.ayatMulai || 1}-${payload.ayatAkhir || 10})`,
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
    lock.releaseLock();
  }
}

// Santri Submit Flashcard
function santriSubmitFlashcard(session, payload) {
  const santriId = session.role === 'santri' ? session.userId : session.idTerkait;
  const config = getConfigMap();

  let recoveryAchieved = false;
  if (payload.idMaster) {
    const res = updateMasterHafalanCache(payload.idMaster, payload.isCorrect ? 'Lancar' : 'Tersendat', config);
    if (res && res.recoveryAchieved) recoveryAchieved = true;
  }

  const baseXP = payload.isCorrect ? 5 : 1;
  const gamifResult = awardXPAndQualifyingActivity(santriId, baseXP, 0, payload.isCorrect, recoveryAchieved, config);

  return {
    success: true,
    message: payload.isCorrect ? 'Jawaban Benar! +5 XP' : 'Tetap Semangat! +1 XP',
    gamifikasi: gamifResult
  };
}

function markNotificationRead(session, notifId) {
  const notifSheet = getSheet('Notifikasi');
  const data = notifSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(notifId)) {
      notifSheet.getRange(i + 1, 6).setValue('Sudah');
      return { success: true };
    }
  }
  return { success: false, message: 'Notifikasi tidak ditemukan' };
}

// --- 3. ORTU DASHBOARD & SMART RANDOM TEST ---
function ortuGetDashboard(session) {
  if (session.role !== 'ortu' && session.role !== 'admin') {
    return { success: false, message: 'Akses khusus Orang Tua' };
  }

  const santriId = session.idTerkait;
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
  if (gamifSheet) {
    const gData = gamifSheet.getDataRange().getValues();
    for (let i = 1; i < gData.length; i++) {
      if (String(gData[i][0]) === String(santriId)) {
        xp = Number(gData[i][1]) || 0;
        level = Number(gData[i][2]) || 1;
        streak = Number(gData[i][3]) || 0;
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
          tgl: tData[i][1],
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
      streak: streak
    },
    unitList: unitList,
    recentTests: testHistory.slice(-5).reverse()
  };
}

// Ortu Smart Random Test (PRD Section 12)
function ortuGetRandomTest(session) {
  const santriId = session.idTerkait;
  const masterSheet = getSheet('Master_Hafalan');
  const masterData = masterSheet.getDataRange().getValues();
  const todayStr = new Date().toISOString().split('T')[0];

  const pool = [];
  for (let i = 1; i < masterData.length; i++) {
    if (String(masterData[i][1]) === String(santriId)) {
      const tglMulai = masterData[i][5] ? new Date(masterData[i][5]) : new Date();
      const diffDays = Math.floor((new Date() - tglMulai) / (1000 * 60 * 60 * 24));

      // Keluarkan hafalan yang terlalu baru (<1 hari)
      if (diffDays >= 1) {
        const status = masterData[i][7] || 'Hijau';
        const nextReview = masterData[i][8] ? String(masterData[i][8]).split('T')[0] : todayStr;
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
  const santriId = session.idTerkait;
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(5000);
  } catch (e) {
    return { success: false, message: 'Server sibuk' };
  }

  try {
    const config = getConfigMap();
    const tesSheet = getSheet('Riwayat_Tes');
    const todayStr = new Date().toISOString().split('T')[0];

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
    lock.releaseLock();
  }
}

// Ortu Kirim Apresiasi
function ortuSendApresiasi(session, payload) {
  const santriId = session.idTerkait;
  const notifSheet = getSheet('Notifikasi');
  const todayStr = new Date().toISOString().split('T')[0];

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
  const cacheSheet = getSheet('Cache_Ayat');
  const cacheData = cacheSheet.getDataRange().getValues();

  for (let i = 1; i < cacheData.length; i++) {
    if (String(cacheData[i][0]) === String(surah) && Number(cacheData[i][1]) === Number(ayah)) {
      return {
        success: true,
        source: 'cache',
        surah: surah,
        ayah: ayah,
        arabic: cacheData[i][2],
        audio: cacheData[i][3]
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
        const target = resJson.data.ayat.find(a => Number(a.nomorAyat) === Number(ayah)) || resJson.data.ayat[0];
        const arabicText = target.teksArab;
        const audioUrl = (target.audio && target.audio['01']) ? target.audio['01'] : (resJson.data.audioFull ? resJson.data.audioFull['01'] : '');

        // Simpan ke Cache_Ayat
        cacheSheet.appendRow([surah, ayah, arabicText, audioUrl, new Date().toISOString()]);

        return {
          success: true,
          source: 'api',
          surah: surah,
          ayah: ayah,
          arabic: arabicText,
          audio: audioUrl
        };
      }
    }
  } catch (err) {
    // API external error fallback
  }

  return {
    success: true,
    source: 'fallback',
    surah: surah,
    ayah: ayah,
    arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    audio: ''
  };
}

// ============================================================
// NIGHTLY CRON TRIGGER (RECOMPUTE & CLEANUP)
// ============================================================

function runNightlyRetentionRecompute() {
  const config = getConfigMap();
  const masterSheet = getSheet('Master_Hafalan');
  const masterData = masterSheet.getDataRange().getValues();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  for (let i = 1; i < masterData.length; i++) {
    const nextReview = masterData[i][8] ? String(masterData[i][8]).split('T')[0] : '';
    let currentStatus = masterData[i][7] || 'Hijau';

    // Jika review overdue lebih dari 3 hari dan status masih Hijau, jadikan Kuning
    if (nextReview && nextReview < todayStr && currentStatus === 'Hijau') {
      const reviewDate = new Date(nextReview);
      const overdueDays = Math.floor((today - reviewDate) / (1000 * 60 * 60 * 24));
      if (overdueDays >= 3) {
        masterSheet.getRange(i + 1, 8).setValue('Kuning');
      }
    }
  }

  // Bersihkan token sesi kedaluwarsa
  const sessionSheet = getSheet('Sessions');
  const sessionData = sessionSheet.getDataRange().getValues();
  for (let j = sessionData.length - 1; j >= 1; j--) {
    const expiry = new Date(sessionData[j][3]);
    if (expiry < today) {
      sessionSheet.deleteRow(j + 1);
    }
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
  const currentMonth = new Date().toISOString().slice(0, 7);
  targetSheet.appendRow(['TGT-001', currentMonth, 'USR-SANTRI-01', 'An-Naba', 1, 40]);
  targetSheet.appendRow(['TGT-002', currentMonth, 'USR-SANTRI-02', 'An-Nazi\'at', 1, 46]);

  // 5. Sheet Master_Hafalan
  const masterSheet = getSheet('Master_Hafalan');
  masterSheet.clear();
  masterSheet.appendRow([
    'ID_Master', 'ID_Santri', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir',
    'Tgl_Mulai', 'Status', 'Retention_Status_Cache', 'Next_Review_Cache',
    'Current_Interval_Hari', 'Consecutive_Lupa'
  ]);
  const todayStr = new Date().toISOString().split('T')[0];
  const sampleMasters = [
    ['MST-001', 'USR-SANTRI-01', 'An-Naba', 1, 20, todayStr, 'Aktif', 'Hijau', todayStr, 2, 0],
    ['MST-002', 'USR-SANTRI-01', 'An-Nazi\'at', 1, 15, '2026-08-15', 'Aktif', 'Kuning', todayStr, 1, 0],
    ['MST-003', 'USR-SANTRI-01', 'Abasa', 1, 25, '2026-07-01', 'Aktif', 'Merah', todayStr, 1, 2],
    ['MST-004', 'USR-SANTRI-01', 'At-Takwir', 1, 29, '2026-06-10', 'Aktif', 'Hijau', '2026-09-12', 15, 0],
    ['MST-005', 'USR-SANTRI-02', 'Al-Infitar', 1, 19, todayStr, 'Aktif', 'Hijau', todayStr, 3, 0]
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
  cacheSheet.appendRow(['Surah', 'Ayat', 'Teks_Arab', 'Audio_URL', 'Last_Fetched']);
  cacheSheet.appendRow([
    'An-Naba', 1,
    'عَمَّ يَتَسَاءَلُونَ',
    'https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078001.mp3',
    new Date().toISOString()
  ]);

  return {
    success: true,
    message: 'Seluruh 14 sheet dan data inisialisasi PRD v4 berhasil dibuat di Spreadsheet!'
  };
}
