/**
 * ============================================================================
 * UJI PARITAS & PENJAGA REGRESI (mock ↔ backend ↔ frontend)
 * ============================================================================
 * Latar belakang: v4.2 punya BUG yang tidak terdeteksi selama berbulan-bulan —
 * `ustazSendFeedback` menulis ke sheet 'Feedback' yang tidak pernah dibaca
 * dashboard Santri, sementara mock menulis ke `notifications` sehingga di Mode
 * Demo tampak berhasil. Penyebabnya: logika diduplikasi tanpa uji paritas.
 *
 * Skrip ini (tanpa dependency) memeriksa:
 *   1. Semua action yang dipanggil frontend ADA di switch doPost (Code.gs).
 *   2. Semua action yang diimplementasikan mock ADA di backend (tidak ada aksi
 *      hantu yang hanya hidup di simulasi).
 *   3. Mock TIDAK boleh membalas success:true untuk action tak dikenal.
 *   4. Endpoint destruktif 'setup_database' tetap TIDAK boleh ada di doPost.
 *   5. `ustazSendFeedback` menulis juga ke sheet Notifikasi (yang dibaca santri).
 *   6. Semua action tulis di doPost dibungkus withIdempotency().
 *
 * Jalankan: `node tools/check-api-parity.cjs`
 */

const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', 'quran-retention-app');
const CODE_GS = fs.readFileSync(path.join(APP, 'backend', 'Code.gs'), 'utf8');
const API_JS = fs.readFileSync(path.join(APP, 'js', 'api.js'), 'utf8');

const errors = [];
const warnings = [];

function casesOf(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return null;
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  const block = source.slice(start, end < 0 ? source.length : end);
  const found = new Set();
  const re = /case\s+'([a-z_]+)'\s*:/g;
  let m;
  while ((m = re.exec(block)) !== null) found.add(m[1]);
  return found;
}

// --- 1. daftar action yang benar-benar dipanggil frontend -------------------
const frontendActions = new Set();
for (const file of fs.readdirSync(path.join(APP, 'js'))) {
  if (!file.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(APP, 'js', file), 'utf8');
  const re = /API\.request\(\s*'([a-z_]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) frontendActions.add(m[1]);
}

// --- 2. daftar action di backend (doPost) & di mock ------------------------
const backendActions = casesOf(CODE_GS, 'function doPost(e) {', 'function responseJSON(data)') || new Set();
// Sebagian action publik ditangani SEBELUM switch (mis. login) — ikut dihitung.
{
  const doPostStart = CODE_GS.indexOf('function doPost(e) {');
  const doPostBlock0 = CODE_GS.slice(doPostStart, CODE_GS.indexOf('function responseJSON(data)', doPostStart));
  const rePublic = /if\s*\(\s*action\s*===\s*'([a-z_]+)'/g;
  let mp;
  while ((mp = rePublic.exec(doPostBlock0)) !== null) backendActions.add(mp[1]);
}
const mockActions = casesOf(API_JS, 'handleMockRequest(action, payload) {') || new Set();

frontendActions.forEach(a => {
  if (!backendActions.has(a)) errors.push(`Action dipanggil frontend tetapi TIDAK ada di doPost Code.gs: '${a}'`);
});

mockActions.forEach(a => {
  if (!backendActions.has(a)) errors.push(`Action hanya ada di mock tetapi tidak di backend: '${a}'`);
});

// Mock wajib mendukung action yang dipakai di Mode Demo (login + baca dashboard
// + semua aksi tulis yang relevan). Aksi Live-only dilaporkan sebagai info.
const mockMandatory = [
  'login', 'logout', 'ustaz_get_dashboard', 'ustaz_add_setoran', 'ustaz_save_target',
  'ustaz_send_feedback', 'ustaz_send_broadcast', 'santri_get_dashboard',
  'santri_confirm_murojaah', 'santri_submit_flashcard_test', 'santri_mark_notif_read',
  'ortu_get_dashboard', 'ortu_get_random_test', 'ortu_submit_test_result', 'ortu_send_apresiasi'
];
mockMandatory.forEach(a => {
  if (frontendActions.has(a) && !mockActions.has(a)) {
    errors.push(`Mode Demo akan menampilkan "belum didukung" untuk action yang dipakai frontend: '${a}'`);
  }
});
const liveOnly = [...frontendActions].filter(a => !mockActions.has(a) && !mockMandatory.includes(a));
if (liveOnly.length) warnings.push(`Action Live-only (tidak ada di mock, wajar bila memang begitu): ${liveOnly.join(', ')}`);

// --- 3. mock tidak boleh membalas success:true untuk action tak dikenal -----
const mockDefault = API_JS.slice(API_JS.indexOf('default:', API_JS.indexOf('handleMockRequest(action, payload) {')));
if (/default:\s*\n\s*return\s*\{\s*success:\s*true/.test(mockDefault)) {
  errors.push('Mock default masih mengembalikan success:true — fitur yang belum ada akan tampak berhasil.');
}
if (!/unknownAction\s*:\s*true/.test(mockDefault)) {
  warnings.push('Mock default sebaiknya menandai unknownAction:true agar mudah dilacak.');
}

// --- 4. endpoint destruktif tidak boleh kembali -----------------------------
if (/case\s+'setup_database'\s*:/.test(CODE_GS)) {
  errors.push("Endpoint 'setup_database' lewat HTTP muncul lagi di doPost (berisiko menghapus 14 sheet).");
}

// --- 5. feedback ustaz harus sampai ke Notifikasi ---------------------------
const feedbackStart = CODE_GS.indexOf('function ustazSendFeedback');
const feedbackBody = feedbackStart >= 0 ? CODE_GS.slice(feedbackStart, feedbackStart + 2200) : '';
if (!feedbackBody) {
  errors.push('Fungsi ustazSendFeedback tidak ditemukan di Code.gs.');
} else {
  if (!/Notifikasi/.test(feedbackBody)) {
    errors.push("ustazSendFeedback tidak menulis ke sheet Notifikasi — feedback akan HILANG dari dashboard Santri (bug v4.2).");
  }
  if (!/isSantriInUstazGroup/.test(feedbackBody)) {
    errors.push('ustazSendFeedback tidak memeriksa kelompok (isSantriInUstazGroup) — celah otorisasi.');
  }
}

// --- 6. action tulis di doPost wajib dibungkus withIdempotency --------------
const writeActions = (API_JS.match(/WRITE_ACTIONS:\s*\[([\s\S]*?)\]/) || [])[1] || '';
const writeList = [...writeActions.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).filter(a => a !== 'login' && a !== 'logout');
const doPostBlock = CODE_GS.slice(CODE_GS.indexOf('function doPost(e) {'), CODE_GS.indexOf('function responseJSON(data)'));
writeList.forEach(a => {
  const re = new RegExp(`case\\s+'${a}'\\s*:([\\s\\S]*?)(?=case\\s+'|default\\s*:)`);
  const m = doPostBlock.match(re);
  if (!m) {
    errors.push(`Action tulis '${a}' tidak ditemukan di doPost.`);
    return;
  }
  if (!/withIdempotency/.test(m[1])) {
    errors.push(`Action tulis '${a}' belum dibungkus withIdempotency() — request ulang bisa menggandakan data.`);
  }
});

// --- 7. penjaga performa: dashboard tidak boleh memindai sheet per santri ----
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const nextFn = source.indexOf('\nfunction ', start + 1);
  const raw = source.slice(start, nextFn < 0 ? source.length : nextFn);
  // Buang komentar agar penyebutan nama fungsi di dokumentasi tidak dianggap kode.
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

['ustazGetDashboard', 'santriGetDashboard', 'ortuGetDashboard'].forEach(fn => {
  const body = functionBody(CODE_GS, fn);
  if (!body) {
    errors.push(`Fungsi ${fn} tidak ditemukan di Code.gs.`);
    return;
  }
  if (/getDataRange\(\)/.test(body)) {
    errors.push(`${fn} memakai getDataRange() (baca seluruh grid) — gunakan readSheet_() dengan kolom minimal.`);
  }
  if (!/buildMasterIndex_\(\)/.test(body) && fn !== 'santriGetDashboard' && fn !== 'ortuGetDashboard') {
    errors.push(`${fn} tidak memakai buildMasterIndex_() — risiko kembali ke pemindaian O(santri x baris).`);
  }
});

// Validasi sesi harus dilayani cache lebih dulu (biaya tetap per request).
const validateBody = functionBody(CODE_GS, 'validateSession') || '';
if (!/sess:/.test(validateBody)) {
  errors.push('validateSession tidak memakai cache sesi — setiap request akan membaca sheet Sessions.');
}

// --- laporan ---------------------------------------------------------------
warnings.forEach(w => console.log(`  ! ${w}`));
if (errors.length === 0) {
  console.log(`  ✓ paritas mock ↔ backend OK (${frontendActions.size} action frontend, ${backendActions.size} action backend, ${mockActions.size} action mock)`);
  process.exit(0);
}
errors.forEach(e => console.error(`  ✗ ${e}`));
console.error(`\n${errors.length} masalah paritas ditemukan.`);
process.exit(1);
