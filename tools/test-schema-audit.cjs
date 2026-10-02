/**
 * Regression test untuk audit dan perbaikan skema spreadsheet.
 * Menjalankan fungsi asli Code.gs di atas spreadsheet tiruan — tanpa akses live.
 * Jalankan: node tools/test-schema-audit.cjs
 */

const fs = require('fs');
const path = require('path');

const CODE_GS = fs.readFileSync(path.resolve(__dirname, '..', 'quran-retention-app', 'backend', 'Code.gs'), 'utf8');
let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.error(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Fungsi ${name} tidak ditemukan`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Kurung fungsi ${name} tidak seimbang`);
}

const schemaMatch = CODE_GS.match(/const DATABASE_SHEET_SCHEMA = (\[[\s\S]*?\n\]);/);
if (!schemaMatch) throw new Error('DATABASE_SHEET_SCHEMA tidak ditemukan');
const DATABASE_SHEET_SCHEMA = new Function(`return ${schemaMatch[1]};`)();

const mutations = [];
const reads = [];

class FakeSheet {
  constructor(name, rows, mutationLog) {
    this.name = name;
    this.rows = rows.map(row => row.slice());
    this.columns = 26;
    this.mutationLog = mutationLog;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].some(value => value !== '' && value !== null && value !== undefined)) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    let last = 0;
    this.rows.forEach(row => row.forEach((value, i) => {
      if (value !== '' && value !== null && value !== undefined) last = Math.max(last, i + 1);
    }));
    return last;
  }
  getMaxColumns() { return this.columns; }
  getRange(row, column, numRows, numColumns) {
    return {
      getValues: () => {
        reads.push({ sheet: this.name, row, column, numRows, numColumns });
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const source = this.rows[row - 1 + r] || [];
          const values = [];
          for (let c = 0; c < numColumns; c++) values.push(source[column - 1 + c] ?? '');
          out.push(values);
        }
        return out;
      },
      setValues: values => {
        this.mutationLog.push({ type: 'setValues', sheet: this.name, row, column, numRows, numColumns });
        values.forEach((valuesRow, rowOffset) => {
          const rowIndex = row - 1 + rowOffset;
          if (!this.rows[rowIndex]) this.rows[rowIndex] = [];
          for (let c = 0; c < valuesRow.length; c++) this.rows[rowIndex][column - 1 + c] = valuesRow[c];
        });
      }
    };
  }
  insertColumnsAfter(after, count) {
    this.mutationLog.push({ type: 'insertColumnsAfter', sheet: this.name, after, count });
    this.columns += count;
    this.rows.forEach(row => {
      while (row.length < this.columns) row.push('');
    });
  }
  deleteRows() { this.mutationLog.push({ type: 'deleteRows', sheet: this.name }); throw new Error('repair tidak boleh menghapus baris'); }
  clear() { this.mutationLog.push({ type: 'clear', sheet: this.name }); throw new Error('repair tidak boleh mengosongkan sheet'); }
}

class FakeSpreadsheet {
  constructor(sheetRows, mutationLog) {
    this.sheets = {};
    this.mutationLog = mutationLog;
    Object.keys(sheetRows).forEach(name => { this.sheets[name] = new FakeSheet(name, sheetRows[name], mutationLog); });
  }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    if (this.sheets[name]) throw new Error(`Sheet ${name} sudah ada`);
    this.mutationLog.push({ type: 'insertSheet', sheet: name });
    this.sheets[name] = new FakeSheet(name, [], this.mutationLog);
    return this.sheets[name];
  }
}

function buildHarness(sheetRows) {
  mutations.length = 0;
  reads.length = 0;
  let lockWaits = 0;
  let lockReleases = 0;
  let flushes = 0;
  let cacheBumps = 0;
  const ss = new FakeSpreadsheet(sheetRows, mutations);
  const backend = new Function(
    'DATABASE_SHEET_SCHEMA', 'SPREADSHEET_ID', 'getSpreadsheet',
    'LockService', 'acquireLock', 'SpreadsheetApp', 'bumpDashVersion_', 'Logger',
    `${extractFunction(CODE_GS, 'countBlankDataRows_')}
     ${extractFunction(CODE_GS, 'findSchemaHeaderRowOffset_')}
     ${extractFunction(CODE_GS, 'inspectDatabaseSheet_')}
     ${extractFunction(CODE_GS, 'auditDatabaseSchema')}
     ${extractFunction(CODE_GS, 'auditStudentDataIntegrity')}
     ${extractFunction(CODE_GS, 'repairMissingSchemaHeaders')}
     return { countBlankDataRows_, findSchemaHeaderRowOffset_, inspectDatabaseSheet_, auditDatabaseSchema, auditStudentDataIntegrity, repairMissingSchemaHeaders };`
  )(
    DATABASE_SHEET_SCHEMA,
    'spreadsheet-for-test',
    () => ss,
    { getScriptLock: () => ({ waitLock: () => { lockWaits++; }, releaseLock: () => { lockReleases++; } }) },
    lock => { lock.waitLock(1000); return true; },
    { flush: () => { flushes++; } },
    () => { cacheBumps++; },
    { log: () => {} }
  );
  return {
    ss, backend,
    stats: () => ({ lockWaits, lockReleases, flushes, cacheBumps })
  };
}

const headers = name => DATABASE_SHEET_SCHEMA.find(spec => spec.name === name).headers;
function initialSheets() {
  const masterHeaders = headers('Master_Hafalan').slice(0, 11);
  const targetData = ['T1', '2026-10', 'S1', 'Al-Baqarah', 1, 5];
  const masterData = ['M1', 'S1', 'Al-Baqarah', 1, 5, '2026-01-01', 'Aktif', 'Hijau', '2026-10-10', 7, 0];
  const cacheHeaders = headers('Cache_Ayat').slice();
  cacheHeaders[4] = 'LastFetch_OLD';
  const data = {
    Config: [headers('Config').slice()],
    Users: [
      headers('Users').slice(),
      ['U1', 'ustaz', 'hash', 'ustaz', 'Ustaz A', ''],
      Array(6).fill(''),
      ['U2', 'santri', 'hash', 'santri', 'Santri B', '']
    ],
    // Target memiliki data di baris 2, tetapi header baris 1 kosong.
    Target: [Array(6).fill(''), targetData],
    Master_Hafalan: [masterHeaders, masterData],
    Cache_Ayat: [cacheHeaders, ['Al-Fatihah', 1, 'arab', '', '2026-10-01', 'terjemahan']]
    // Santri sengaja hilang.
  };
  DATABASE_SHEET_SCHEMA.forEach(spec => {
    if (spec.name !== 'Santri' && !data[spec.name]) {
      data[spec.name] = [spec.headers.slice(), spec.headers.map((_, i) => i === 0 ? `DUMMY_${spec.name}` : '')];
    }
  });
  // Simulasi header yang benar berada di baris 2 setelah satu baris kosong.
  data.Murojaah = [
    Array(headers('Murojaah').length).fill(''),
    headers('Murojaah').slice(),
    ['MUR-1', '2026-10-01', 'S1', 'Sabaq', 'Al-Fatihah (1-7)', 'Ustaz', '2026-10-01T00:00:00Z']
  ];
  data.Badge = [
    Array(headers('Badge').length).fill(''),
    headers('Badge').slice(),
    ['BDG-1', 'S1', 'Streak 3', '2026-10-01']
  ];
  return data;
}

console.log('Skema — audit baca-saja:');
{
  const data = initialSheets();
  const before = JSON.stringify(data);
  const H = buildHarness(data);
  const report = H.backend.auditDatabaseSchema();
  check('manifest mencakup 14 sheet inti dengan fungsi/tujuan',
    DATABASE_SHEET_SCHEMA.length === 14 && DATABASE_SHEET_SCHEMA.every(x => x.phase && x.purpose && x.headers.length),
    String(DATABASE_SHEET_SCHEMA.length));
  check('audit menyatakan read-only dan sukses', report.success && report.readOnly === true);
  check('mendeteksi 1 sheet hilang', report.summary.missingSheets === 1, JSON.stringify(report.summary));
  check('mendeteksi 2 header kosong/terpotong', report.summary.missingHeaders === 2, JSON.stringify(report.summary));
  check('mendeteksi 1 sheet header-only', report.summary.headerOnly === 1, JSON.stringify(report.summary));
  check('mendeteksi 2 header yang bergeser ke baris 2', report.summary.shiftedHeaders === 2, JSON.stringify(report.summary));
  check('mendeteksi mismatch header tanpa menimpanya', report.summary.mismatchedHeaders === 1, JSON.stringify(report.summary));
  check('Murojaah dan Badge dilaporkan dengan posisi header, bukan dianggap hilang',
    ['Murojaah', 'Badge'].every(name => {
      const item = report.sheets.find(x => x.name === name);
      return item.status === 'header_row_offset' && item.headerRowDetected === 2 && !item.repairable;
    }));
  check('Santri ditandai missing_sheet dan repairable',
    report.sheets.find(x => x.name === 'Santri').status === 'missing_sheet' && report.sheets.find(x => x.name === 'Santri').repairable);
  check('Target dikenali sebagai header kosong dengan 1 baris data di bawahnya',
    report.sheets.find(x => x.name === 'Target').status === 'missing_header' &&
    report.sheets.find(x => x.name === 'Target').dataRowsAssumingHeader === 1);
  const master = report.sheets.find(x => x.name === 'Master_Hafalan');
  check('Master_Hafalan hanya kekurangan header terakhir',
    master.status === 'missing_trailing_headers' && master.missingHeaders[0] === 'Consecutive_Lancar');
  check('Cache_Ayat dengan header berbeda tidak dianggap aman untuk repair',
    report.sheets.find(x => x.name === 'Cache_Ayat').status === 'header_mismatch' &&
    !report.sheets.find(x => x.name === 'Cache_Ayat').repairable);
  check('audit menandai baris data kosong beserta nomor barisnya',
    report.summary.blankDataRows === 1 &&
    report.sheets.find(x => x.name === 'Users').blankDataRows === 1 &&
    report.sheets.find(x => x.name === 'Users').blankDataRowNumbers[0] === 3,
    JSON.stringify(report.summary));
  check('audit memindai nilai hanya untuk menghitung kosong dan tidak mengembalikan isi record',
    reads.some(r => r.row >= 2) && !JSON.stringify(report).includes('U1') && !JSON.stringify(report).includes('hash'));
  check('audit tidak membuat sheet atau menulis apa pun', mutations.length === 0 && JSON.stringify(data) === before);
}

console.log('\nSkema — dry-run dan repair aditif:');
{
  const data = initialSheets();
  const targetDataBefore = data.Target[1].slice();
  const masterDataBefore = data.Master_Hafalan[1].slice();
  const cacheBefore = JSON.stringify(data.Cache_Ayat);
  const shiftedHeadersBefore = JSON.stringify({ Murojaah: data.Murojaah, Badge: data.Badge });
  const H = buildHarness(data);
  H.ss.getSheetByName('Master_Hafalan').columns = 11; // simulasi grid lama yang belum memiliki kolom ke-12
  const dry = H.backend.repairMissingSchemaHeaders();
  check('repair default adalah dry-run', dry.success && dry.dryRun === true);
  check('dry-run merencanakan hanya sheet/header yang aman diperbaiki',
    dry.planned.map(x => x.name).sort().join(',') === 'Master_Hafalan,Santri,Target', dry.planned.map(x => x.name).join(','));
  check('header yang bergeser dicantumkan sebagai skipped dan tidak dijadwalkan ditulis',
    dry.skipped.some(x => x.name === 'Murojaah' && x.status === 'header_row_offset') &&
    dry.skipped.some(x => x.name === 'Badge' && x.status === 'header_row_offset'));
  check('dry-run tidak menulis, membuat sheet, atau mengunci', mutations.length === 0 && H.stats().lockWaits === 0);

  const applied = H.backend.repairMissingSchemaHeaders({ apply: true });
  check('apply berhasil dan memverifikasi semua header yang diperbaiki', applied.success && applied.repaired.length === 3, JSON.stringify(applied));
  check('sheet Santri dibuat dengan header skema',
    !!H.ss.getSheetByName('Santri') && JSON.stringify(H.ss.getSheetByName('Santri').rows[0]) === JSON.stringify(headers('Santri')));
  check('header kosong Target diisi tanpa mengubah baris data',
    JSON.stringify(H.ss.getSheetByName('Target').rows[0]) === JSON.stringify(headers('Target')) &&
    JSON.stringify(H.ss.getSheetByName('Target').rows[1]) === JSON.stringify(targetDataBefore));
  check('header ke-12 Master_Hafalan ditambahkan tanpa mengubah kolom/baris lama',
    H.ss.getSheetByName('Master_Hafalan').rows[0][11] === 'Consecutive_Lancar' &&
    JSON.stringify(H.ss.getSheetByName('Master_Hafalan').rows[1].slice(0, masterDataBefore.length)) === JSON.stringify(masterDataBefore));
  check('Cache_Ayat yang mismatch tetap persis tidak berubah', JSON.stringify(H.ss.getSheetByName('Cache_Ayat').rows) === cacheBefore);
  check('Murojaah dan Badge yang header-nya bergeser tidak disentuh repair',
    JSON.stringify({ Murojaah: H.ss.getSheetByName('Murojaah').rows, Badge: H.ss.getSheetByName('Badge').rows }) === shiftedHeadersBefore);
  check('grid Master_Hafalan diperlebar satu kolom tanpa mengubah baris data',
    mutations.some(m => m.type === 'insertColumnsAfter' && m.sheet === 'Master_Hafalan' && m.count === 1));
  check('semua operasi tulis terbatas pada header/kolom skema; tidak ada delete/clear',
    mutations.every(m => m.type === 'insertSheet' || m.type === 'insertColumnsAfter' || (m.type === 'setValues' && m.row === 1)) &&
    mutations.filter(m => m.type === 'setValues').length === 3,
    JSON.stringify(mutations));
  check('lock, flush, dan invalidasi cache dilakukan pada apply',
    H.stats().lockWaits === 1 && H.stats().lockReleases === 1 && H.stats().flushes >= 1 && H.stats().cacheBumps === 1,
    JSON.stringify(H.stats()));
}

console.log('\nRelasi ID dan target — audit baca-saja:');
{
  const data = {
    Users: [
      headers('Users').slice(),
      ['U-UST', 'ustaz', 'SECRET_HASH_SENTINEL', 'ustaz', 'Nama ustaz', ''],
      ['U-S1', 'tabina', 'SECRET_HASH_SENTINEL', 'santri', 'Nama santri', ''],
      ['U-P1', 'ortu', 'SECRET_HASH_SENTINEL', 'ortu', 'Nama ortu', 'U-S1'],
      ['U-S2', 'salim', 'SECRET_HASH_SENTINEL', 'santri', 'Nama santri lain', '']
    ],
    Santri: [
      headers('Santri').slice(),
      ['tabina', 'Nama santri', 'U-UST', ''],
      ['salim', 'Nama santri lain', 'U-UST', '']
    ],
    Hafalan: [
      headers('Hafalan').slice(),
      ['H1', '2026-10-01', 'tabina'],
      ['H2', '2026-10-01', 'U-S1'],
      ['H3', '2026-10-01', ''],
      ['H4', '2026-10-01', 'unknown-id']
    ],
    Master_Hafalan: [headers('Master_Hafalan').slice(), ['M1', 'U-S1']],
    Target: [
      headers('Target').slice(),
      ['T1', '2026-10', 'tabina'],
      ['T2', '2026-10', 'tabina'],
      ['T3', '2026-10', 'U-S1'],
      ['T4', '2026-10', 'salim'],
      ['T5', '2026-10', 'unknown-id']
    ],
    Murojaah: [
      Array(headers('Murojaah').length).fill(''),
      headers('Murojaah').slice(),
      ['M1', '2026-10-01', 'U-S1']
    ],
    Gamifikasi: [headers('Gamifikasi').slice(), ['tabina']],
    Badge: [headers('Badge').slice(), ['B1', 'U-S1']],
    Feedback: [headers('Feedback').slice(), ['F1', 'tabina']],
    Notifikasi: [headers('Notifikasi').slice(), ['N1', 'U-S1']]
  };
  const before = JSON.stringify(data);
  const H = buildHarness(data);
  const report = H.backend.auditStudentDataIntegrity({});
  const hafalan = report.references.find(item => item.sheet === 'Hafalan');
  const murojaah = report.references.find(item => item.sheet === 'Murojaah');

  check('audit relasi hanya-baca dan tidak menyertakan ID/nama/hash mentah',
    report.success && report.readOnly &&
    !JSON.stringify(report).includes('SECRET_HASH_SENTINEL') &&
    !JSON.stringify(report).includes('tabina') &&
    !JSON.stringify(report).includes('Nama santri'));
  check('akun Santri dipetakan lewat Username ke ID_Santri tanpa menulis data',
    report.summary.mappedStudentAccounts === 2 && report.summary.unmappedStudentAccounts === 0);
  check('relasi ID_Terkait orang tua dikenali sebagai alias akun Santri',
    report.parentLinks.counts.mappedAlias === 1 && report.parentLinks.counts.unmapped === 0);
  check('audit memisahkan ID kanonis, alias, kosong, dan tidak dikenal',
    hafalan.canonicalMatches === 1 && hafalan.mappedAliases === 1 &&
    hafalan.blankIds === 1 && hafalan.unmappedIds === 1);
  check('header Murojaah di baris 2 tidak dihitung sebagai record ID yatim',
    murojaah.dataRows === 1 && murojaah.mappedAliases === 1 && murojaah.unmappedIds === 0);
  check('target dengan ID mentah sama dihitung sebagai baris ekstra yang diabaikan kode saat ini',
    report.summary.duplicateTargetGroups === 1 &&
    report.summary.targetRowsBeyondFirstMatch === 1 &&
    report.targets.duplicateGroups[0].rowNumbers.join(',') === '2,3');
  check('target dengan ID berbeda yang mengarah ke santri sama ditandai untuk tinjauan mapping',
    report.summary.targetGroupsAcrossIdAliases === 1 &&
    report.targets.crosswalkGroupsForReview[0].rowNumbers.join(',') === '2,3,4');
  check('diagnostik tidak membaca kolom Password_Hash dan tidak menulis apa pun',
    !reads.some(item => item.sheet === 'Users' && [3, 5].includes(item.column)) &&
    mutations.length === 0 && JSON.stringify(data) === before);
}

console.log(`\n${pass} lulus, ${fail} gagal.`);
process.exit(fail === 0 ? 0 : 1);
