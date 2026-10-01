/**
 * ============================================================================
 * UJI SIMULASI ARSIP (archiveOldRows) DENGAN SPREADSHEET TIRUAN
 * ============================================================================
 * Arsip menyentuh data historis milik pengguna, jadi kesalahannya mahal.
 * Skrip ini menjalankan fungsi ASLI dari backend/Code.gs
 * (`archiveOldRows` → `archiveOldRowsRun_` → `deleteRowBlocks_`) di atas
 * Spreadsheet tiruan di memori, lalu memeriksa bahwa:
 *
 *   1. Tanpa argumen = UJI KERING: melaporkan rencana, TIDAK mengubah data.
 *   2. Baris lama benar-benar pindah, dan baris yang TIDAK diarsipkan tetap utuh
 *      (menghapus dari bawah ke atas tidak menggeser baris lain).
 *   3. Bila penulisan arsip tidak terverifikasi, penghapusan DIBATALKAN dan
 *      sheet sumber tidak kehilangan satu baris pun.
 *   4. Notifikasi yang BELUM dibaca tidak pernah diarsipkan.
 *   5. Baris bertanggal kosong/rusak tidak pernah diarsipkan.
 *   6. Menjalankan dua kali tidak menggandakan data (idempoten setelah pindah).
 *   7. Sheet yang tidak ada dilewati, bukan menggagalkan seluruh proses.
 *
 * Jalankan: `node tools/test-archive.cjs`
 */

const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', 'quran-retention-app');
const CODE_GS = fs.readFileSync(path.join(APP, 'backend', 'Code.gs'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.error(`  FAIL  ${name}${extra ? ' -> ' + extra : ''}`); }
}

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(`Fungsi ${name} tidak ditemukan`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Kurung fungsi ${name} tidak seimbang`);
}

const SPECS_SRC = (CODE_GS.match(/ARCHIVE_SHEET_SPECS = (\[[\s\S]*?\n\]);/) || [])[1];
if (!SPECS_SRC) { console.error('ARCHIVE_SHEET_SPECS tidak ditemukan di Code.gs'); process.exit(1); }
const ARCHIVE_SHEET_SPECS = new Function(`return ${SPECS_SRC};`)();

// ---------------------------------------------------------------- tiruan sheet
let ROWS = {};       // { namaSheet: [ [header], [row], ... ] }
let SHEETS = null;   // map Sheet tiruan
let failVerifyFor = null; // nama sheet arsip yang "gagal terverifikasi"

function makeSheet(name, rows) {
  return {
    getName: () => name,
    getRows: () => rows,
    getLastRow: () => rows.length,
    setFrozenRows: () => {},
    getRange(r, c, nr, nc) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('range tidak valid: ' + [r, c, nr, nc]);
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = rows[r - 1 + i] ? rows[r - 1 + i].slice(c - 1, c - 1 + nc) : [];
            while (row.length < nc) row.push('');
            out.push(row);
          }
          return out;
        },
        setValues(values) {
          if (name.indexOf('Arsip_') === 0 && failVerifyFor === name.replace('Arsip_', '')) {
            // Simulasi penulisan yang tidak masuk sepenuhnya (mis. kuota/partial).
            values = values.slice(0, Math.max(0, values.length - 1));
          }
          values.forEach((v, i) => {
            const rr = r - 1 + i;
            if (!rows[rr]) rows[rr] = [];
            for (let k = 0; k < v.length; k++) rows[rr][c - 1 + k] = v[k];
          });
        }
      };
    },
    deleteRows(start, count) {
      rows.splice(start - 1, count);
    }
  };
}

function resetRows() {
  ROWS = {
    Murojaah: [
      ['ID_Murojaah', 'Tanggal', 'ID_Santri', 'Jenis', 'Unit', 'Status', 'ID_Ustaz'],
      ['M1', '2026-09-30', 'S1', 'Sabaq', 'U1', 'Lancar', 'UZ1'],   // baru
      ['M2', '2026-01-05', 'S1', 'Manzil', 'U2', 'Lupa', 'UZ1'],    // lama -> arsip
      ['M3', '2026-03-20', 'S2', 'Sabqi', 'U3', 'Lancar', 'UZ1'],   // lama -> arsip (berdampingan)
      ['M4', '2026-04-02', 'S2', 'Sabaq', 'U4', 'Lancar', 'UZ1'],   // batas/baru
      ['M5', '', 'S3', 'Sabaq', 'U5', 'Lancar', 'UZ1'],             // tanggal kosong
      ['M6', 'entah', 'S3', 'Sabaq', 'U6', 'Lancar', 'UZ1']         // tanggal rusak
    ],
    Riwayat_Tes: [
      ['ID_Tes', 'Tanggal', 'ID_Santri', 'Jenis', 'Surah', 'Ayat_Mulai', 'Ayat_Akhir', 'Skor', 'Catatan'],
      ['T1', '2026-09-01', 'S1', 'Acak', 'Al-Fatihah', 1, 7, 90, ''],
      ['T2', '2025-12-31', 'S2', 'Acak', 'Al-Baqarah', 1, 5, 70, '']
    ],
    Notifikasi: [
      ['ID_Notif', 'ID_Penerima', 'Role_Penerima', 'Pesan', 'Timestamp', 'Status_Baca'],
      ['N1', 'S1', 'santri', 'Pesan lama sudah dibaca', '2026-02-01T08:00:00Z', 'Sudah'],   // arsip
      ['N2', 'S1', 'santri', 'Pesan lama BELUM dibaca', '2026-02-01T08:00:00Z', 'Belum'],   // aman
      ['N3', 'S1', 'santri', 'Pesan baru sudah dibaca', '2026-09-25T08:00:00Z', 'Sudah'],   // aman (baru)
      ['N4', 'S2', 'santri', 'Pesan tanpa status', '2026-02-02T08:00:00Z', '']             // aman (bukan 'Sudah')
    ]
  };
  SHEETS = {};
  Object.keys(ROWS).forEach(n => { SHEETS[n] = makeSheet(n, ROWS[n]); });
  failVerifyFor = null;
}

function getSheetStub(name) {
  if (!SHEETS[name]) throw new Error(`Sheet ${name} tidak ditemukan`);
  return SHEETS[name];
}

// ------------------------------------------------------------------ sandbox
const PROP = {};
const diagnostics = { bumps: 0, flush: 0, warnings: [] };

function buildArchive() {
  const factory = new Function(
    'ARCHIVE_SHEET_SPECS', 'PROP_LAST_ARCHIVE_RUN', 'Logger', 'SpreadsheetApp',
    'getConfigMap', 'getSheet', 'getSpreadsheet', 'readScriptProperty_', 'writeScriptProperty_',
    'toDateStr', 'appTodayStr', 'bumpDashVersion_', 'withLock', 'ensureArchiveSheet_', 'getArchiveTarget_',
    `
    ${extractFunction(CODE_GS, 'monthsAgoFrom_')}
    ${extractFunction(CODE_GS, 'deleteRowBlocks_')}
    ${extractFunction(CODE_GS, 'archiveOldRows')}
    ${extractFunction(CODE_GS, 'archiveOldRowsRun_')}
    return { monthsAgoFrom_, deleteRowBlocks_, archiveOldRows, archiveOldRowsRun_ };
    `
  );
  return factory(
    ARCHIVE_SHEET_SPECS,
    'SYNC_STATE_LAST_ARCHIVE_RUN',
    { log: m => diagnostics.warnings.push(String(m)) },
    { flush: () => { diagnostics.flush++; } },
    () => ({ ARCHIVE_AMBANG_BULAN: 6, ARCHIVE_AKTIF: 0 }),
    getSheetStub,
    () => ({ getSheetByName: n => (SHEETS[n] || null), insertSheet: n => { ROWS[n] = []; SHEETS[n] = makeSheet(n, ROWS[n]); return SHEETS[n]; } }),
    k => PROP[k] || null,
    (k, v) => { PROP[k] = v; },
    v => String(v || '').slice(0, 10),
    () => '2026-10-01',
    () => { diagnostics.bumps++; },
    fn => { const r = fn(); return r; },              // withLock tiruan (tanpa kunci nyata)
    (ss, sourceName, cols) => {                        // ensureArchiveSheet_ asli
      const archiveName = 'Arsip_' + sourceName;
      const header = getSheetStub(sourceName).getRange(1, 1, 1, cols).getValues()[0];
      let sheet = ss.getSheetByName(archiveName);
      if (!sheet) { sheet = ss.insertSheet(archiveName); }
      if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, cols).setValues([header]);
      return sheet;
    },
    () => ({ ss: { getSheetByName: n => SHEETS[n] || null, insertSheet: n => { ROWS[n] = []; SHEETS[n] = makeSheet(n, ROWS[n]); return SHEETS[n]; } }, label: 'uji: sheet Arsip_* lokal', external: false })
  );
}

const snap = name => JSON.stringify(ROWS[name]);
const rowTexts = name => ROWS[name].map(r => r.join('|'));

// ================================================================== PENGUJIAN
console.log('Arsip — keselamatan uji kering (tanpa argumen):');
resetRows();
{
  const A = buildArchive();
  const before = Object.keys(ROWS).map(n => snap(n)).join(';');
  const rep = A.archiveOldRows();
  const after = Object.keys(ROWS).map(n => snap(n)).join(';');
  check('tanpa argumen dijalankan sebagai uji kering', rep.dryRun === true);
  check('tidak ada satu sel pun berubah saat uji kering', before === after);
  check('tidak ada sheet Arsip_* yang dibuat', !ROWS.Arsip_Murojaah && !ROWS.Arsip_Riwayat_Tes && !ROWS.Arsip_Notifikasi);
  check('cutoff dilaporkan (6 bulan sebelum 2026-10-01)', rep.cutoff === '2026-04-01', rep.cutoff);
  check('menemukan 2 baris Murojaah lama', rep.sheets.Murojaah.ditemukan === 2, JSON.stringify(rep.sheets.Murojaah));
  check('menemukan 1 baris Riwayat_Tes lama', rep.sheets.Riwayat_Tes.ditemukan === 1, JSON.stringify(rep.sheets.Riwayat_Tes));
  check('menemukan 1 notifikasi lama yang sudah dibaca', rep.sheets.Notifikasi.ditemukan === 1, JSON.stringify(rep.sheets.Notifikasi));
  check('total ditemukan 4', rep.totalDitemukan === 4, String(rep.totalDitemukan));
  check('tidak ada yang dihapus saat uji kering', rep.totalDihapus === 0);
}

console.log('\nArsip — pemindahan sesungguhnya (dryRun: false):');
resetRows();
{
  const A = buildArchive();
  const rep = A.archiveOldRows({ dryRun: false });
  check('laporan menandai bukan uji kering', rep.dryRun === false);
  check('Murojaah: 2 diarsipkan & 2 dihapus', rep.sheets.Murojaah.diarsipkan === 2 && rep.sheets.Murojaah.dihapus === 2, JSON.stringify(rep.sheets.Murojaah));
  check('baris yang tersisa persis yang seharusnya (tanpa pergeseran)',
    JSON.stringify(rowTexts('Murojaah').slice(1).map(t => t.split('|')[0])) === JSON.stringify(['M1', 'M4', 'M5', 'M6']),
    JSON.stringify(rowTexts('Murojaah')));
  check('arsip Murojaah berisi baris lama dan tetap punya header',
    ROWS.Arsip_Murojaah.length === 3 && ROWS.Arsip_Murojaah[1][0] === 'M2' && ROWS.Arsip_Murojaah[2][0] === 'M3',
    JSON.stringify(ROWS.Arsip_Murojaah));
  check('Riwayat_Tes: 1 pindah, 1 tinggal', ROWS.Riwayat_Tes.length === 2 && ROWS.Arsip_Riwayat_Tes.length === 2);
  check('notifikasi lama "Sudah" dipindah', ROWS.Arsip_Notifikasi.length === 2 && ROWS.Arsip_Notifikasi[1][0] === 'N1');
  check('notifikasi BELUM dibaca tetap ada di sheet aktif', rowTexts('Notifikasi').some(t => t.indexOf('N2') === 0));
  check('notifikasi baru tetap ada di sheet aktif', rowTexts('Notifikasi').some(t => t.indexOf('N3') === 0));
  check('notifikasi tanpa status baca tidak diarsipkan', rowTexts('Notifikasi').some(t => t.indexOf('N4') === 0));
  check('versi cache dashboard dinaikkan setelah penghapusan', diagnostics.bumps > 0);
  check('penghapusan tercatat ke Script Property (4 baris)', String(PROP['SYNC_STATE_LAST_ARCHIVE_RUN'] || '').indexOf('"dihapus":4') !== -1, PROP['SYNC_STATE_LAST_ARCHIVE_RUN']);

  const again = A.archiveOldRows({ dryRun: false });
  check('dijalankan ulang tidak menemukan apa pun lagi (idempoten)', again.totalDitemukan === 0, JSON.stringify(again.sheets));
}

console.log('\nArsip — penulisan arsip tidak terverifikasi = TIDAK menghapus:');
resetRows();
{
  failVerifyFor = 'Murojaah';
  const before = snap('Murojaah');
  const A = buildArchive();
  const rep = A.archiveOldRows({ dryRun: false });
  check('penghapusan Murojaah dibatalkan', rep.sheets.Murojaah.dihapus === 0, JSON.stringify(rep.sheets.Murojaah));
  check('sheet Murojaah utuh (tidak ada baris hilang)', snap('Murojaah') === before);
  check('ada peringatan yang menjelaskan pembatalan', rep.warnings.some(w => w.indexOf('tidak terverifikasi') !== -1), JSON.stringify(rep.warnings));
  check('sheet lain tetap diproses (Riwayat_Tes pindah)', ROWS.Arsip_Riwayat_Tes.length === 2);
  check('notifikasi yang sudah dibaca tetap dipindah', ROWS.Arsip_Notifikasi.length === 2);
}

console.log('\nArsip — batas usia & pengaturan:');
resetRows();
{
  const A = buildArchive();
  const rep = A.archiveOldRows({ bulan: 12, dryRun: true });
  check('batas 12 bulan → cutoff 2025-10-01', rep.cutoff === '2025-10-01', rep.cutoff);
  check('batas lebih tua menemukan lebih sedikit baris (des 2025 belum 12 bulan)', rep.totalDitemukan === 0, JSON.stringify(rep.sheets));

  // Batas bersifat eksklusif: baris tepat pada tanggal cutoff TIDAK diarsipkan.
  ROWS.Murojaah.push(['M7', '2026-04-01', 'S9', 'Sabaq', 'U9', 'Lancar', 'UZ1']);
  const rep2 = A.archiveOldRows({ dryRun: true });
  check('baris tepat di tanggal cutoff tidak diarsipkan (eksklusif)',
    rep2.sheets.Murojaah.ditemukan === 2 && rowTexts('Murojaah').some(t => t.indexOf('M7') === 0),
    JSON.stringify(rep2.sheets.Murojaah));
}

console.log('\nArsip — sheet tidak ada tidak menggagalkan proses:');
resetRows();
{
  delete ROWS.Riwayat_Tes; delete SHEETS.Riwayat_Tes;
  const A = buildArchive();
  const rep = A.archiveOldRows({ dryRun: false });
  check('laporan tetap sukses', rep.success === true);
  check('sheet yang hilang dilewati dengan catatan', rep.sheets.Riwayat_Tes && rep.sheets.Riwayat_Tes.catatan === 'sheet tidak ditemukan', JSON.stringify(rep.sheets.Riwayat_Tes));
  check('sheet lain tetap diproses', rep.sheets.Murojaah.dihapus === 2);
  check('ada peringatan "tidak ditemukan"', rep.warnings.some(w => w.indexOf('tidak ditemukan') !== -1));
}

console.log(`\n${pass} lulus, ${fail} gagal.`);
process.exit(fail === 0 ? 0 : 1);
