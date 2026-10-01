/**
 * ============================================================================
 * UJI UNIT RETENTION ENGINE + PARITAS BACKEND ↔ MODE DEMO
 * ============================================================================
 * Logika retensi ada di DUA tempat:
 *   1. backend/Code.gs  → calculateNextRetentionState()  (dipakai Mode Live)
 *   2. js/mock-data.js  → mockApplyRetention()           (dipakai Mode Demo)
 * Karena diduplikasi, keduanya bisa "drift" tanpa disadari — persis kelas bug
 * yang dulu membuat feedback ustaz tampak berhasil di Demo tetapi hilang di Live.
 *
 * Skrip ini (tanpa dependency):
 *   - Mengekstrak KEDUA fungsi dari sumbernya (jadi tidak bisa "lulus" karena
 *     menguji salinan yang berbeda dari kode yang benar-benar dipakai).
 *   - Menguji perilaku yang dikunci PRD: interval naik/turun, cap 60 hari,
 *     recovery Merah→Kuning butuh 2x Lancar berturut-turut, streak tidak di sini.
 *   - Membandingkan hasil kedua implementasi untuk seluruh matriks kasus.
 *
 * Jalankan: `node tools/test-retention.cjs`
 */

const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', 'quran-retention-app');
const CODE_GS = fs.readFileSync(path.join(APP, 'backend', 'Code.gs'), 'utf8');
const MOCK_JS = fs.readFileSync(path.join(APP, 'js', 'mock-data.js'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.error(`  FAIL  ${name}${extra ? ' -> ' + extra : ''}`); }
}

/** Ekstrak satu fungsi utuh dari sumber (dengan pencocokan kurung kurawal). */
function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(`Fungsi ${name} tidak ditemukan`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    const ch = source[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, j + 1);
    }
  }
  throw new Error(`Akhir fungsi ${name} tidak ditemukan`);
}

// --- Konfigurasi retensi (harus sama dengan APP_CONFIG.RETENTION & sheet Config) ---
const RETENTION_CONFIG = {
  AMBANG_SABQI_HARI: 30,
  INTERVAL_MULTIPLIER_LANCAR: 1.5,
  INTERVAL_MULTIPLIER_TERSENDAT: 0.5,
  INTERVAL_CAP_MAKS_HARI: 60,
  INTERVAL_LUPA_HARI: 1,
  RECOVERY_LANCAR_BERUNTUN_DIBUTUHKAN: 2
};

// Stub deterministik: nilai hari tidak diuji di sini (diuji di kasus terpisah).
const addDaysStr = (days) => 'HARI+' + Number(days);
const appDateStrAfter = (days) => 'HARI+' + Number(days);

// --- Bangun kedua implementasi dari sumber aslinya -------------------------
const backendFactory = new Function(
  'addDaysStr', 'config',
  `${extractFunction(CODE_GS, 'calculateNextRetentionState')}
   return calculateNextRetentionState;`
);
const calculateNextRetentionState = backendFactory(addDaysStr, RETENTION_CONFIG);

const mockFactory = new Function(
  'appDateStrAfter', 'APP_CONFIG',
  `${extractFunction(MOCK_JS, 'mockApplyRetention')}
   return mockApplyRetention;`
);
const mockApplyRetention = mockFactory(appDateStrAfter, { RETENTION: RETENTION_CONFIG });

/** Jalankan satu kasus pada implementasi backend. */
function runBackend(c) {
  const r = calculateNextRetentionState(c.status, c.interval, c.lupa, c.lancar, c.quality, RETENTION_CONFIG);
  return {
    status: r.newStatus,
    interval: r.newInterval,
    lupa: r.newConsecutiveLupa,
    lancar: r.newConsecutiveLancar,
    recovery: r.recoveryAchieved,
    nextReview: r.nextReviewStr
  };
}

/** Jalankan satu kasus pada implementasi Mode Demo (objek dimutasi). */
function runMock(c) {
  const unit = {
    retentionStatus: c.status,
    interval: c.interval,
    consecutiveLupa: c.lupa,
    consecutiveLancar: c.lancar
  };
  const r = mockApplyRetention(unit, c.quality);
  return {
    status: unit.retentionStatus,
    interval: unit.interval,
    lupa: unit.consecutiveLupa,
    lancar: unit.consecutiveLancar,
    recovery: !!r.recoveryAchieved,
    nextReview: unit.nextReview
  };
}

// --- Matriks kasus: [status, interval, lupa, lancar, kualitas, harapan] -----
const CASES = [
  // Lancar dari status sehat
  { n: 'Hijau + Lancar → Hijau, interval ×1.5', c: { status: 'Hijau', interval: 2, lupa: 0, lancar: 0, quality: 'Lancar' }, e: { status: 'Hijau', interval: 3, lupa: 0, lancar: 0, recovery: false } },
  { n: 'Kuning + Lancar → Hijau (pulih)', c: { status: 'Kuning', interval: 4, lupa: 0, lancar: 0, quality: 'Lancar' }, e: { status: 'Hijau', interval: 6, lupa: 0, lancar: 0, recovery: false } },
  { n: 'Lancar membatalkan hitungan Lupa', c: { status: 'Kuning', interval: 1, lupa: 1, lancar: 0, quality: 'Lancar' }, e: { status: 'Hijau', interval: 2, lupa: 0, lancar: 0, recovery: false } },

  // Cap interval (PRD 7.2)
  { n: 'Interval dibatasi 60 hari (bukan 75)', c: { status: 'Hijau', interval: 50, lupa: 0, lancar: 0, quality: 'Lancar' }, e: { status: 'Hijau', interval: 60, lupa: 0, lancar: 0, recovery: false } },

  // Tersendat
  { n: 'Hijau + Tersendat → Kuning, interval ×0.5', c: { status: 'Hijau', interval: 10, lupa: 0, lancar: 0, quality: 'Tersendat' }, e: { status: 'Kuning', interval: 5, lupa: 0, lancar: 0, recovery: false } },
  { n: 'Tersendat tidak pernah < 1 hari', c: { status: 'Hijau', interval: 1, lupa: 0, lancar: 0, quality: 'Tersendat' }, e: { status: 'Kuning', interval: 1, lupa: 0, lancar: 0, recovery: false } },
  { n: 'Merah + Tersendat tetap Merah', c: { status: 'Merah', interval: 1, lupa: 2, lancar: 0, quality: 'Tersendat' }, e: { status: 'Merah', interval: 1, lupa: 0, lancar: 0, recovery: false } },

  // Lupa
  { n: 'Hijau + Lupa (1x) → Kuning, interval 1', c: { status: 'Hijau', interval: 20, lupa: 0, lancar: 0, quality: 'Lupa' }, e: { status: 'Kuning', interval: 1, lupa: 1, lancar: 0, recovery: false } },
  { n: 'Kuning + Lupa (2x berturut) → Merah', c: { status: 'Kuning', interval: 1, lupa: 1, lancar: 0, quality: 'Lupa' }, e: { status: 'Merah', interval: 1, lupa: 2, lancar: 0, recovery: false } },
  { n: 'Merah + Lupa tetap Merah', c: { status: 'Merah', interval: 1, lupa: 2, lancar: 0, quality: 'Lupa' }, e: { status: 'Merah', interval: 1, lupa: 3, lancar: 0, recovery: false } },

  // Recovery Merah → Kuning (PRD 7.4): butuh 2x Lancar berturut-turut
  { n: 'Merah + Lancar ke-1 → tetap Merah, review 1 hari', c: { status: 'Merah', interval: 1, lupa: 2, lancar: 0, quality: 'Lancar' }, e: { status: 'Merah', interval: 1, lupa: 0, lancar: 1, recovery: false } },
  { n: 'Merah + Lancar ke-2 → Kuning + recoveryAchieved', c: { status: 'Merah', interval: 1, lupa: 0, lancar: 1, quality: 'Lancar' }, e: { status: 'Kuning', interval: 2, lupa: 0, lancar: 0, recovery: true } },
  { n: 'Merah + Tersendat memutus rantai Lancar', c: { status: 'Merah', interval: 1, lupa: 0, lancar: 1, quality: 'Tersendat' }, e: { status: 'Merah', interval: 1, lupa: 0, lancar: 0, recovery: false } },
  { n: 'Merah + Lupa memutus rantai Lancar', c: { status: 'Merah', interval: 1, lupa: 0, lancar: 1, quality: 'Lupa' }, e: { status: 'Merah', interval: 1, lupa: 1, lancar: 0, recovery: false } },

  // Data rusak / kosong (hasil impor spreadsheet) tidak boleh meledak
  { n: 'Interval kosong diperlakukan 1 hari', c: { status: 'Hijau', interval: 0, lupa: 0, lancar: 0, quality: 'Lancar' }, e: { status: 'Hijau', interval: 2, lupa: 0, lancar: 0, recovery: false } },
  { n: 'Status kosong dianggap Hijau', c: { status: '', interval: 2, lupa: 0, lancar: 0, quality: 'Lancar' }, e: { status: 'Hijau', interval: 3, lupa: 0, lancar: 0, recovery: false } }
];

console.log('Perilaku retention engine (backend/Code.gs):');
CASES.forEach(t => {
  const got = runBackend(t.c);
  const ok = got.status === t.e.status && got.interval === t.e.interval &&
    got.lupa === t.e.lupa && got.lancar === t.e.lancar && got.recovery === t.e.recovery;
  check(t.n, ok, `dapat ${JSON.stringify(got)}`);
});

console.log('\nParitas Mode Live ↔ Mode Demo (Code.gs vs mock-data.js):');
let parityFail = 0;
CASES.forEach(t => {
  const a = runBackend(t.c);
  const b = runMock(t.c);
  const same = a.status === b.status && a.interval === b.interval &&
    a.lupa === b.lupa && a.lancar === b.lancar && a.recovery === b.recovery &&
    a.nextReview === b.nextReview;
  if (!same) {
    parityFail++;
    console.error(`  FAIL  ${t.n}\n         backend=${JSON.stringify(a)}\n         mock   =${JSON.stringify(b)}`);
  }
});
check(`seluruh ${CASES.length} kasus menghasilkan hasil identik`, parityFail === 0, `${parityFail} berbeda`);

console.log('\nPerhitungan tanggal batas arsip (monthsAgoFrom_):');
const monthsAgoFrom = new Function(
  `${extractFunction(CODE_GS, 'monthsAgoFrom_')}
   return monthsAgoFrom_;`
)();

check('6 bulan sebelum 2026-10-01 → 2026-04-01', monthsAgoFrom('2026-10-01', 6) === '2026-04-01', monthsAgoFrom('2026-10-01', 6));
check('1 bulan sebelum 2026-01-15 → 2025-12-01 (lintas tahun)', monthsAgoFrom('2026-01-15', 1) === '2025-12-01', monthsAgoFrom('2026-01-15', 1));
check('12 bulan sebelum 2026-03-31 → 2025-03-01', monthsAgoFrom('2026-03-31', 12) === '2025-03-01', monthsAgoFrom('2026-03-31', 12));
check('0 bulan → awal bulan yang sama', monthsAgoFrom('2026-10-27', 0) === '2026-10-01', monthsAgoFrom('2026-10-27', 0));
check('tanggal tidak valid → string kosong (arsip dibatalkan, aman)', monthsAgoFrom('', 6) === '', monthsAgoFrom('', 6));
check('nilai bukan tanggal → string kosong', monthsAgoFrom('entah', 6) === '', monthsAgoFrom('entah', 6));

console.log('\nSpesifikasi arsip (kolom & aturan aman):');
const specSource = (CODE_GS.match(/ARCHIVE_SHEET_SPECS = (\[[\s\S]*?\n\]);/) || [])[1];
let specs = null;
try {
  specs = new Function(`return ${specSource};`)();
} catch (e) {
  check('ARCHIVE_SHEET_SPECS bisa dibaca', false, String(e));
}
if (specs) {
  const byName = {};
  specs.forEach(s => { byName[s.name] = s; });
  check('Murojaah: 7 kolom, tanggal kolom 2', !!byName.Murojaah && byName.Murojaah.cols === 7 && byName.Murojaah.dateIndex === 1);
  check('Riwayat_Tes: 9 kolom, tanggal kolom 2', !!byName.Riwayat_Tes && byName.Riwayat_Tes.cols === 9 && byName.Riwayat_Tes.dateIndex === 1);
  check('Notifikasi: tanggal kolom 5 (Timestamp)', !!byName.Notifikasi && byName.Notifikasi.dateIndex === 4);
  check('Notifikasi: hanya yang SUDAH DIBACA diarsipkan', !!byName.Notifikasi && byName.Notifikasi.onlyRead === true && byName.Notifikasi.readIndex === 5);
  check('Tidak ada sheet yang diarsipkan tanpa spesifikasi tanggal', specs.every(s => typeof s.dateIndex === 'number'));
}

console.log(`\n${pass} lulus, ${fail} gagal.`);
process.exit(fail === 0 ? 0 : 1);
