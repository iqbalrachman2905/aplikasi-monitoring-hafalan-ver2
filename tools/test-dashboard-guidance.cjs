/**
 * Uji ringkasan dashboard per role (tanpa browser/dependency).
 * Mengunci kontrak aktivitas terakhir, langkah berikutnya, tren tes, dan
 * aturan tampilan mobile yang menjadi fokus audit UX.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'quran-retention-app');
const checks = [];
function check(name, condition, extra) {
  checks.push({ name, condition: !!condition, extra });
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${!condition && extra ? ` -> ${extra}` : ''}`);
}

function dateOnly(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
}

// Jalankan helper backend yang sama dengan Code.gs menggunakan baris tiruan.
{
  const source = fs.readFileSync(path.join(APP, 'backend', 'Code.gs'), 'utf8');
  const start = source.indexOf('function activityMillis_(');
  const end = source.indexOf('function ustazGetDashboard(', start);
  if (start < 0 || end < 0) throw new Error('Blok helper aktivitas Code.gs tidak ditemukan.');
  const helpers = source.slice(start, end);
  const factory = new Function('toDateStr', 'appTodayStr', 'addDaysStr', `${helpers}\nreturn { activityMillis_, buildLatestSetoranIndex_, latestStudentActivity_, buildWeeklySummary_ };`);
  const fixedToday = '2026-10-02';
  const addDays = days => {
    const date = new Date(`${fixedToday}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const backend = factory(dateOnly, () => fixedToday, addDays);

  const setoran = [
    ['HAF-1', '2026-10-01', 'S-1', 'Al-Ikhlas', 1, 4, 'B', '', '', '2026-10-01T08:00:00Z'],
    ['HAF-2', '2026-10-02', 'S-1', 'An-Naba', 1, 10, 'A', '', '', '2026-10-02T08:00:00Z'],
    ['HAF-3', '2026-10-03', 'S-2', 'Al-Falaq', 1, 5, 'A', '', '', '2026-10-03T08:00:00Z']
  ];
  const murojaah = [
    ['MUR-1', '2026-10-02', 'S-1', 'Sabqi', 'An-Naba (1-10)', 'Santri Satu', '2026-10-02T11:00:00Z']
  ];
  const tests = [
    ['TES-1', '2026-10-02', 'S-1', 'MST-1', 'An-Naba', 1, 10, 'Lancar', 'Orang Tua']
  ];
  const activity = backend.latestStudentActivity_('S-1', setoran, murojaah, tests);
  check('aktivitas terakhir memilih catatan lintas sheet dengan timestamp terbaru',
    activity && activity.type === 'Murojaah' && activity.actor === 'Santri Satu', JSON.stringify(activity));
  check('aktivitas terakhir menyertakan tanggal, rincian, dan hasil yang bermakna',
    activity && activity.tgl === '2026-10-02' && activity.detail === 'An-Naba (1-10)' && activity.outcome);
  check('ID yang tidak cocok tidak dipetakan diam-diam ke santri lain',
    backend.latestStudentActivity_('username-lama', setoran, murojaah, tests) === null);
  const weeklySetoran = setoran.concat([
    ['HAF-FUTURE', '2026-10-03', 'S-1', 'At-Takwir', 1, 5, 'A', '', '', '2026-10-03T08:00:00Z'],
    ['HAF-OLD', '2026-09-25', 'S-1', 'Al-Mulk', 1, 10, 'B', '', '', '2026-09-25T08:00:00Z']
  ]);
  const weeklyTests = tests.concat([
    ['TES-OLD', '2026-09-25', 'S-1', 'MST-2', 'Al-Mulk', 1, 10, 'Lupa', 'Orang Tua']
  ]);
  const weekly = backend.buildWeeklySummary_('S-1', weeklySetoran, murojaah, weeklyTests);
  check('ringkasan mingguan menghitung setoran, murojaah, dan tes pada jendela tujuh hari',
    weekly.setoran === 2 && weekly.murojaah === 1 && weekly.evaluasi === 1 && weekly.totalAktivitas === 4);
  check('ringkasan mingguan hanya menghitung hari aktif dan hasil tes pada rentang yang benar',
    weekly.startDate === '2026-09-26' && weekly.endDate === fixedToday && weekly.activeDays === 2 && weekly.hasilTes.Lancar === 1);

  const latestIndex = backend.buildLatestSetoranIndex_(setoran);
  check('indeks setoran Ustaz memilih entri terbaru per santri',
    latestIndex['S-1'] && latestIndex['S-1'].surah === 'An-Naba' && latestIndex['S-2'].surah === 'Al-Falaq');
}

function loadController(fileName, variableName, elements) {
  const context = {
    console,
    document: {
      body: { classList: { contains: () => false } },
      getElementById: id => elements && elements[id] ? elements[id] : null
    },
    UI: { escapeHTML: value => String(value == null ? '' : value), showLoading() {}, toast() {} },
    API: { request: async () => ({ success: false }) },
    APP_CONFIG: { COMPETENCY: {}, GAMIFICATION: { LEVEL_XP_STEP: 100 } },
    QURAN_DATA: { getSurahByName: () => null, surahs: [] },
    appTodayStr: () => '2026-10-02',
    appCompetencyLabel: score => ({ tone: score >= 80 ? 'green' : (score >= 50 ? 'yellow' : 'red'), label: 'uji' }),
    Auth: { getCurrentUser: () => ({ role: 'santri' }) },
    App: { switchSantriTab() {} }
  };
  const code = fs.readFileSync(path.join(APP, 'js', fileName), 'utf8');
  vm.runInNewContext(`${code}\nthis.__controller = ${variableName};`, context, { filename: fileName });
  return context.__controller;
}

// Santri: aktivitas sebelumnya + saran satu misi yang belum selesai.
{
  const santri = loadController('dashboard-santri.js', 'DashboardSantri');
  santri.data = {
    lastActivity: { type: 'Murojaah', title: 'Murojaah Sabqi', detail: 'An-Naba (1-10)', tgl: '2026-10-01', actor: 'Santri', outcome: 'Selesai' },
    missions: {
      sabaq: [{ completed: true, surah: 'Al-Ikhlas', ayatMulai: 1, ayatAkhir: 4 }],
      sabqi: [{ idMaster: 'M-2', completed: false, surah: 'An-Naba', ayatMulai: 1, ayatAkhir: 10 }],
      manzil: [{ completed: false, surah: 'Al-Falaq', ayatMulai: 1, ayatAkhir: 5 }]
    }
  };
  const guide = santri.buildDashboardGuidance();
  check('Santri melihat aktivitas terakhir yang benar', guide.activity.title === 'Murojaah Sabqi');
  check('Santri diarahkan ke misi tertunda pertama, bukan misi yang sudah selesai',
    guide.next.kind === 'mission' && guide.next.entry.type === 'Sabqi' && guide.next.entry.unit.idMaster === 'M-2');
  santri.data.missions = { sabaq: [{ completed: true }], sabqi: [], manzil: [] };
  check('semua misi Santri selesai memberi langkah lanjut flashcard', santri.buildDashboardGuidance().next.kind === 'flashcard');
}

// Orang Tua: prioritas status retensi, batas minimal umur tes, tren historis.
{
  const weeklyNode = { innerHTML: '' };
  const ortu = loadController('dashboard-ortu.js', 'DashboardOrtu', { 'ortu-weekly-summary': weeklyNode });
  ortu.data = {
    lastActivity: { title: 'Evaluasi hafalan', detail: 'An-Naba • ayat 1-10', tgl: '2026-10-01', actor: 'Orang Tua', outcome: 'Hasil Lancar' },
    retention: { hijau: 2, kuning: 1, merah: 1, total: 4 },
    eligibleTestCount: 2,
    unitList: [
      { retentionStatus: 'Merah', nextReview: '2026-10-01', testEligible: true },
      { retentionStatus: 'Hijau', nextReview: '2026-10-10', testEligible: true }
    ],
    recentTests: [
      { tgl: '2026-08-10', kualitas: 'Lancar' },
      { tgl: '2026-09-05', kualitas: 'Tersendat' },
      { tgl: '2026-09-20', kualitas: 'Lupa' }
    ]
  };
  const guide = ortu.buildDashboardGuidance();
  check('Orang Tua diberi prioritas unit Merah sebelum unit aman', guide.next.enabled && guide.next.title.includes('Merah'));
  check('ringkasan Orang Tua menunjukkan aktivitas terakhir', guide.activity.title === 'Evaluasi hafalan');
  const trend = ortu.buildMonthlyTestTrend();
  check('tren tes dikelompokkan per bulan dan memakai bobot kualitas yang konsisten',
    trend.length === 2 && trend[0].month === '2026-08' && trend[1].score === 40);
  ortu.data.weeklySummary = {
    startDate: '2026-09-26', endDate: '2026-10-02', activeDays: 2,
    setoran: 1, murojaah: 1, evaluasi: 2, totalAktivitas: 4,
    hasilTes: { Lancar: 1, Tersendat: 1, Lupa: 0 }
  };
  ortu.renderWeeklySummary();
  const renderedWeekly = weeklyNode.innerHTML;
  ortu.data.weeklySummary = null;
  ortu.renderWeeklySummary();
  check('kartu mingguan menampilkan metrik dan tidak menyamarkan kontrak backend yang belum tersedia',
    renderedWeekly.includes('2/7') && renderedWeekly.includes('Murojaah') && renderedWeekly.includes('1 Lancar')
      && weeklyNode.innerHTML.includes('belum tersedia dari versi backend ini'));
  ortu.data = { unitList: [{ testEligible: false }], eligibleTestCount: 0, retention: {} };
  check('tombol tes nonaktif bila semua hafalan belum berumur satu hari', ortu.buildDashboardGuidance().next.enabled === false);
}

// Ustaz: setoran terbaru kelompok + tindak lanjut mendesak.
{
  const ustaz = loadController('dashboard-ustaz.js', 'DashboardUstaz');
  ustaz.data = {
    santriList: [
      { idSantri: 'S-1', nama: 'Santri A', target: {}, lastSetoran: { tgl: '2026-10-01', surah: 'Al-Ikhlas', ayatMulai: 1, ayatAkhir: 4, nilai: 'A' }, retention: { hijau: 1, kuning: 0, merah: 0, overdue: 0 }, flags: [] },
      { idSantri: 'S-2', nama: 'Santri B', target: {}, lastSetoran: { tgl: '2026-10-02', surah: 'An-Naba', ayatMulai: 1, ayatAkhir: 10, nilai: 'B' }, retention: { hijau: 0, kuning: 1, merah: 2, overdue: 2 }, flags: ['Kritis: 2 unit hafalan status Merah'] }
    ]
  };
  const guide = ustaz.buildGroupGuidance();
  check('Ustaz melihat setoran terakhir dari kelompok beserta tanggal/nilai',
    guide.recent.title.includes('Santri B') && guide.recent.meta.includes('2026-10-02') && guide.recent.meta.includes('Nilai B'));
  check('prioritas Ustaz memilih santri berisiko dan menyiapkan aksi arahan',
    guide.next.student.idSantri === 'S-2' && guide.next.action === 'feedback');
}

// Guard UI mobile/accessibility yang diminta pada audit.
{
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const layout = fs.readFileSync(path.join(APP, 'css', 'layout.css'), 'utf8');
  check('viewport mobile mengizinkan zoom dan area aman perangkat',
    /name="viewport"[^>]*viewport-fit=cover/.test(html) && !/user-scalable=no|max(?:imum)?-scale=1(?:\.0)?/.test(html));
  check('tab Santri memakai kontrol tombol dengan status aksesibel',
    /santri-tabs" role="group"/.test(html) && /aria-pressed="true"/.test(html));
  check('matriks Ustaz berubah menjadi kartu berlabel pada layar kecil',
    /@media \(max-width: 767px\)/.test(layout) && /td::before\s*\{\s*content: attr\(data-label\)/.test(layout));
  check('semua dashboard memiliki slot aktivitas terakhir dan langkah berikutnya',
    ['santri-last-activity-title', 'ortu-last-activity-title', 'ustaz-last-action-title', 'santri-next-step-title', 'ortu-next-summary-title', 'ustaz-next-action-title'].every(id => html.includes(`id="${id}"`)));
  check('ringkasan pekanan Ortu tersedia dan grid-nya menyesuaikan layar ponsel',
    html.includes('id="ortu-weekly-summary"') && layout.includes('.weekly-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }'));
}

const failed = checks.filter(result => !result.condition);
console.log(`\nRingkasan: ${checks.length - failed.length}/${checks.length} pemeriksaan lulus.`);
if (failed.length) process.exit(1);
