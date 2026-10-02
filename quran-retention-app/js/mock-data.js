/**
 * ============================================================================
 * MOCK DATA & CLIENT-SIDE STATE ENGINE
 * ============================================================================
 * Menyediakan simulasi data lokal yang 100% selaras dengan PRD v4 dan Code.gs.
 * Digunakan saat mode Mock diaktifkan atau jika koneksi backend GAS belum dideploy.
 */

const MOCK_STATE = {
  // Akun ini HANYA dipakai di Mode Demo (mock). Mode Live memakai sheet Users
  // dengan Password_Hash bersalt di backend, bukan data di bawah ini.
  users: [
    { id: 'USR-USTAZ-01', username: 'ustaz1', password: '123456', role: 'ustaz', nama: 'Ustaz Ahmad Fauzi, Al-Hafizh', idTerkait: '' },
    { id: 'USR-SANTRI-01', username: 'santri1', password: '123456', role: 'santri', nama: 'Muhammad Hafizh Al-Fatih', idTerkait: '' },
    { id: 'USR-SANTRI-02', username: 'santri2', password: '123456', role: 'santri', nama: 'Aisyah Humaira', idTerkait: '' },
    { id: 'USR-ORTU-01', username: 'ortu1', password: '123456', role: 'ortu', nama: 'Bapak Ridwan (Ortu Hafizh)', idTerkait: 'USR-SANTRI-01' }
  ],

  santriList: [
    { idSantri: 'USR-SANTRI-01', nama: 'Muhammad Hafizh Al-Fatih', idUstaz: 'USR-USTAZ-01', status: 'Aktif' },
    { idSantri: 'USR-SANTRI-02', nama: 'Aisyah Humaira', idUstaz: 'USR-USTAZ-01', status: 'Aktif' }
  ],

  targetList: [
    { idTarget: 'TGT-001', bulan: appTodayStr().slice(0, 7), idSantri: 'USR-SANTRI-01', surah: 'An-Naba', ayatMulai: 1, ayatAkhir: 40 },
    { idTarget: 'TGT-002', bulan: appTodayStr().slice(0, 7), idSantri: 'USR-SANTRI-02', surah: "An-Nazi'at", ayatMulai: 1, ayatAkhir: 46 }
  ],

  masterHafalan: [
    { idMaster: 'MST-001', idSantri: 'USR-SANTRI-01', surah: "An-Naba'", ayatMulai: 1, ayatAkhir: 20, tglMulai: appTodayStr(), diffDays: 0, status: 'Aktif', retentionStatus: 'Hijau', nextReview: appTodayStr(), interval: 2, consecutiveLupa: 0, consecutiveLancar: 0 },
    { idMaster: 'MST-002', idSantri: 'USR-SANTRI-01', surah: "An-Nazi'at", ayatMulai: 1, ayatAkhir: 15, tglMulai: '2026-08-15', diffDays: 23, status: 'Aktif', retentionStatus: 'Kuning', nextReview: appTodayStr(), interval: 1, consecutiveLupa: 0, consecutiveLancar: 0 },
    { idMaster: 'MST-003', idSantri: 'USR-SANTRI-01', surah: "'Abasa", ayatMulai: 1, ayatAkhir: 25, tglMulai: '2026-07-01', diffDays: 68, status: 'Aktif', retentionStatus: 'Merah', nextReview: appTodayStr(), interval: 1, consecutiveLupa: 2, consecutiveLancar: 0 },
    { idMaster: 'MST-004', idSantri: 'USR-SANTRI-01', surah: "Al-Ikhlas", ayatMulai: 1, ayatAkhir: 4, tglMulai: '2026-06-10', diffDays: 89, status: 'Aktif', retentionStatus: 'Hijau', nextReview: '2026-09-20', interval: 15, consecutiveLupa: 0, consecutiveLancar: 0 },
    { idMaster: 'MST-005', idSantri: 'USR-SANTRI-02', surah: "Al-Infitar", ayatMulai: 1, ayatAkhir: 19, tglMulai: appTodayStr(), diffDays: 0, status: 'Aktif', retentionStatus: 'Hijau', nextReview: appTodayStr(), interval: 3, consecutiveLupa: 0, consecutiveLancar: 0 }
  ],

  gamifikasi: {
    'USR-SANTRI-01': { xp: 345, level: 4, currentStreak: 7, longestStreak: 14, lastQualifyingDate: appTodayStr() },
    'USR-SANTRI-02': { xp: 180, level: 2, currentStreak: 3, longestStreak: 5, lastQualifyingDate: appTodayStr() }
  },

  badges: {
    'USR-SANTRI-01': [
      { idBadge: 'BDG-001', nama: 'Streak 3 Hari 🔥', tgl: '2026-09-03' },
      { idBadge: 'BDG-002', nama: 'Pejuang Istiqomah (7 Hari) 🌟', tgl: appTodayStr() },
      { idBadge: 'BDG-003', nama: 'Level 4: Penjaga Ayat 🛡️', tgl: appTodayStr() }
    ],
    'USR-SANTRI-02': [
      { idBadge: 'BDG-004', nama: 'Streak 3 Hari 🔥', tgl: appTodayStr() }
    ]
  },

  notifications: {
    'USR-SANTRI-01': [
      { idNotif: 'NTF-001', tipe: 'Motivasi', pesan: 'MasyaAllah Hafizh, pertahankan streak murojaah 7 harimu!', tgl: appTodayStr(), dibaca: false },
      { idNotif: 'NTF-002', tipe: 'Apresiasi Ortu', pesan: 'Semangat terus ya nak, Ayah & Bunda sangat bangga!', tgl: appTodayStr(), dibaca: false },
      { idNotif: 'NTF-003', tipe: 'Feedback Ustaz', pesan: 'Perhatikan dengung (ghunnah) pada Surat An-Naba ayat 1-5.', tgl: '2026-09-06', dibaca: true }
    ]
  },

  activityHeatmap: {
    'USR-SANTRI-01': {
      [appDateStrAfter(-6)]: 3,
      [appDateStrAfter(-5)]: 2,
      [appDateStrAfter(-4)]: 1,
      [appDateStrAfter(-3)]: 2,
      [appDateStrAfter(-2)]: 3,
      [appDateStrAfter(-1)]: 1
    }
  },

  // Tanggal contoh bergerak relatif terhadap hari ini agar demo tetap relevan.
  riwayatTes: [
    { idTes: 'TES-001', tgl: appDateStrAfter(-1), idSantri: 'USR-SANTRI-01', surah: "An-Naba'", ayatMulai: 1, ayatAkhir: 10, kualitas: 'Lancar', pelapor: 'Orang Tua: Bapak Ridwan' },
    { idTes: 'TES-002', tgl: appDateStrAfter(-32), idSantri: 'USR-SANTRI-01', surah: "'Abasa", ayatMulai: 1, ayatAkhir: 15, kualitas: 'Lupa', pelapor: 'Orang Tua: Bapak Ridwan' }
  ],

  setoranHistory: [
    { idHafalan: 'HAF-001', tgl: appDateStrAfter(-2), idSantri: 'USR-SANTRI-01', surah: "An-Naba'", ayatMulai: 1, ayatAkhir: 20, nilai: 'A', catatan: 'Makhraj huruf shad dan tho sangat rapi.' },
    { idHafalan: 'HAF-002', tgl: appDateStrAfter(-4), idSantri: 'USR-SANTRI-01', surah: "An-Nazi'at", ayatMulai: 1, ayatAkhir: 15, nilai: 'B+', catatan: 'Lancar, perhatikan mad jaiz munfashil.' }
  ],

  // Log konfirmasi murojaah (mirror sheet Murojaah di Code.gs) — dipakai untuk
  // menandai misi harian "selesai" PER UNIT, bukan per jenis misi.
  murojaahLog: [],

  // Log riwayat setoran yang sudah masuk retention engine
  riwayatTesLog: []
};

/**
 * ============================================================================
 * MESIN RETENSI SISI KLIEN (mirror calculateNextRetentionState() di Code.gs)
 * ============================================================================
 * SM-2-lite + Recovery Policy: unit Merah hanya naik ke Kuning setelah
 * RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN kali evaluasi Lancar berturut-turut.
 * @param {object} unit baris MOCK_STATE.masterHafalan (dimutasi di tempat)
 * @param {string} quality 'Lancar' | 'Tersendat' | 'Lupa'
 * @returns {{recoveryAchieved: boolean}}
 */
function mockApplyRetention(unit, quality) {
  if (!unit) return { recoveryAchieved: false };

  const cfg = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.RETENTION) || {};
  const multLancar = Number(cfg.INTERVAL_MULTIPLIER_LANCAR || 1.5);
  const multTersendat = Number(cfg.INTERVAL_MULTIPLIER_TERSENDAT || 0.5);
  const maxCap = Number(cfg.INTERVAL_CAP_MAKS_HARI || 60);
  const minLupa = Number(cfg.INTERVAL_LUPA_HARI || 1);
  const recoveryNeed = Math.max(1, Number(cfg.RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN || 2));

  let interval = Number(unit.interval) || 1;
  let status = unit.retentionStatus || 'Hijau';
  let lupa = Number(unit.consecutiveLupa) || 0;
  let lancar = Number(unit.consecutiveLancar) || 0;
  let recoveryAchieved = false;

  if (quality === 'Lancar') {
    lupa = 0;
    lancar += 1;
    if (status === 'Merah') {
      if (lancar >= recoveryNeed) {
        status = 'Kuning';
        recoveryAchieved = true;
        lancar = 0;
        interval = Math.min(maxCap, Math.max(1, Math.ceil(interval * multLancar)));
      } else {
        status = 'Merah';
        interval = minLupa;
      }
    } else {
      status = 'Hijau';
      lancar = 0;
      interval = Math.min(maxCap, Math.max(1, Math.ceil(interval * multLancar)));
    }
  } else if (quality === 'Tersendat') {
    lancar = 0;
    lupa = 0;
    interval = Math.max(1, Math.floor(interval * multTersendat));
    if (status !== 'Merah') status = 'Kuning';
  } else if (quality === 'Lupa') {
    lancar = 0;
    interval = minLupa;
    lupa += 1;
    status = (lupa >= 2 || status === 'Merah') ? 'Merah' : 'Kuning';
  }

  unit.retentionStatus = status;
  unit.interval = interval;
  unit.consecutiveLupa = lupa;
  unit.consecutiveLancar = lancar;
  unit.nextReview = appDateStrAfter(interval);

  return { recoveryAchieved: recoveryAchieved };
}

/**
 * Hitung capaian target bulanan: berapa ayat dalam rentang target yang sudah
 * dihafal. Nama surah dinormalisasi (apostrof/spasi) agar "An-Naba" cocok
 * dengan "An-Naba'".
 * @param {{surah:string, ayatMulai:number, ayatAkhir:number}} target
 * @param {Array} masters daftar unit Master_Hafalan santri
 * @returns {{covered:number, total:number, percent:number}}
 */
function mockTargetProgress(target, masters) {
  const norm = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const mulai = Number(target.ayatMulai) || 0;
  const akhir = Number(target.ayatAkhir) || 0;
  const total = Math.max(0, akhir - mulai + 1);
  const covered = new Set();

  (masters || []).forEach(m => {
    if (norm(m.surah) !== norm(target.surah)) return;
    const a = Math.max(mulai, Number(m.ayatMulai) || 0);
    const b = Math.min(akhir, Number(m.ayatAkhir) || 0);
    for (let x = a; x <= b; x++) covered.add(x);
  });

  const done = covered.size;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return { covered: done, total: total, percent: percent };
}

/**
 * Cek apakah misi (jenis + unit) sudah dikonfirmasi hari ini.
 */
function mockIsMurojaahDone(santriId, jenisMisi, unit) {
  const today = appTodayStr();
  const detail = `${unit.surah} (${unit.ayatMulai}-${unit.ayatAkhir})`;
  return MOCK_STATE.murojaahLog.some(l =>
    l.idSantri === santriId &&
    l.tgl === today &&
    l.jenisMisi === jenisMisi &&
    (l.detail === detail || l.detail === unit.surah)
  );
}

/**
 * ============================================================================
 * PERSISTENSI MODE DEMO (localStorage)
 * ============================================================================
 * Sebelumnya perubahan di Mode Demo hanya hidup di memori, sehingga target yang
 * diatur Ustaz dan riwayat tes dari Orang Tua HILANG setiap halaman di-refresh.
 * Snapshot state berikut disimpan agar data demo bertahan antar-refresh.
 * (Mode Live tetap memakai spreadsheet sebagai sumber kebenaran.)
 */
const MOCK_PERSIST_KEY = 'quran_retention_mock_state';

const MOCK_PERSIST_FIELDS = [
  'santriList',
  'targetList',
  'masterHafalan',
  'gamifikasi',
  'badges',
  'notifications',
  'activityHeatmap',
  'riwayatTes',
  'setoranHistory',
  'murojaahLog',
  'riwayatTesLog'
];

/** Simpan snapshot state demo ke localStorage. */
function mockSaveState() {
  try {
    const snapshot = {};
    MOCK_PERSIST_FIELDS.forEach(k => { snapshot[k] = MOCK_STATE[k]; });
    localStorage.setItem(MOCK_PERSIST_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn('[Mock] gagal menyimpan state demo:', e.message);
  }
}

/** Muat snapshot state demo (bila ada) menimpa data contoh. */
function mockLoadState() {
  try {
    const raw = localStorage.getItem(MOCK_PERSIST_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    MOCK_PERSIST_FIELDS.forEach(k => {
      if (saved[k] !== undefined && saved[k] !== null) MOCK_STATE[k] = saved[k];
    });

    // Umur hafalan (diffDays) dihitung ulang dari tanggal mulai agar misi
    // Sabaq/Sabqi/Manzil tetap realistis setelah beberapa hari.
    const today = new Date(appTodayStr() + 'T00:00:00');
    (MOCK_STATE.masterHafalan || []).forEach(u => {
      if (!u || !u.tglMulai) return;
      const mulai = new Date(String(u.tglMulai).slice(0, 10) + 'T00:00:00');
      if (isNaN(mulai.getTime())) return;
      u.diffDays = Math.floor((today - mulai) / 86400000);
    });
  } catch (e) {
    console.warn('[Mock] gagal memuat state demo:', e.message);
  }
}

/** Hapus state demo tersimpan (kembali ke data contoh). */
function mockResetState() {
  try { localStorage.removeItem(MOCK_PERSIST_KEY); } catch (e) { /* diabaikan */ }
}

// Hidrasi state demo dari localStorage saat modul dimuat.
mockLoadState();
