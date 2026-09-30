/**
 * ============================================================================
 * UJI OTOMATIS LAPISAN API (TANPA DEPENDENCY, TANPA BROWSER)
 * ============================================================================
 * Menguji perilaku yang paling sering menjadi sumber bug di aplikasi ini:
 *   1. Mock tidak lagi "selalu sukses" untuk action tak dikenal.
 *   2. Mock login menolak password salah (anti auth-bypass).
 *   3. Mock mark-notif-read menandai notifikasi dengan benar.
 *   4. Taksonomi error: timeout / offline / deployment / kontrak / server sibuk.
 *   5. Percobaan ulang aman: hanya untuk timeout, memakai requestId yang SAMA,
 *      dan HANYA bila backend mengaku mendukung idempotency (anti data dobel).
 *
 * Jalankan: `node tools/test-api.cjs`
 */

const fs = require('fs');
const path = require('path');

const JS_DIR = path.resolve(__dirname, '..', 'quran-retention-app', 'js');
const SOURCES = ['config.js', 'mock-data.js', 'api.js']
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8'))
  .join('\n;\n');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.error(`  FAIL  ${name}${extra ? ' -> ' + extra : ''}`); }
}

/** Bangun sandbox: semua modul dievaluasi dalam satu scope + stub browser. */
function buildSandbox(fetchImpl) {
  const storage = {};
  const toasts = [];
  const calls = [];

  const sandbox = {
    console: console,
    localStorage: {
      getItem: k => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: k => { delete storage[k]; }
    },
    setTimeout: () => 0,          // timeout asli tidak dipakai di Node
    clearTimeout: () => {},
    AbortController: global.AbortController,
    fetch: (url, opts) => { calls.push(opts); return fetchImpl(url, opts, calls.length); },
    Auth: {
      currentUser: { userId: 'USR-SANTRI-01', role: 'santri', nama: 'Uji Santri', idTerkait: '' },
      getToken: () => 'TOKEN-UJI',
      getCurrentUser() { return this.currentUser; },
      logout() { this.loggedOut = true; }
    },
    UI: {
      toasts: toasts,
      toast: (msg, type, dur) => toasts.push({ msg, type, dur }),
      escapeHTML: s => String(s == null ? '' : s)
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    window: {}
  };

  // Semua modul + harness dievaluasi bersama agar const/let saling terlihat.
  const harness = `
    ;return {
      API: API,
      MOCK_STATE: MOCK_STATE,
      APP_CONFIG: APP_CONFIG,
      Auth: Auth,
      calls: __callsRef
    };
  `;
  sandbox.__callsRef = calls;

  const runner = new Function(
    'console', 'localStorage', 'fetch', 'Auth', 'UI', 'document', 'window', 'setTimeout', 'clearTimeout', 'AbortController', '__callsRef',
    SOURCES + harness
  );
  const api = runner(
    sandbox.console, sandbox.localStorage, sandbox.fetch, sandbox.Auth, sandbox.UI,
    sandbox.document, sandbox.window, sandbox.setTimeout, sandbox.clearTimeout,
    sandbox.AbortController, sandbox.__callsRef
  );
  return { api, toasts, calls, storage };
}

const OK_RESPONSE = body => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body)
});

async function main() {
  console.log('Mode Demo (mock):');

  // --- 1. action tak dikenal TIDAK boleh tampak berhasil --------------------
  {
    const { api } = buildSandbox(() => OK_RESPONSE({}));
    api.APP_CONFIG.DATA_MODE = 'mock';
    const res = await api.API.request('aksi_yang_belum_ada');
    check('action tak dikenal -> success:false', res.success === false, JSON.stringify(res));
    check('action tak dikenal -> unknownAction:true', res.unknownAction === true);
  }

  // --- 2. login mock memvalidasi password ----------------------------------
  {
    const { api } = buildSandbox(() => OK_RESPONSE({}));
    api.APP_CONFIG.DATA_MODE = 'mock';
    const bad = await api.API.request('login', { username: 'santri1', password: 'salah' });
    check('login mock password salah -> gagal', bad.success === false);
    const good = await api.API.request('login', { username: 'santri1', password: '123456' });
    check('login mock password benar -> sukses', good.success === true);
  }

  // --- 3. mark notif read di mock ------------------------------------------
  {
    const { api } = buildSandbox(() => OK_RESPONSE({}));
    api.APP_CONFIG.DATA_MODE = 'mock';
    const notif = api.MOCK_STATE.notifications['USR-SANTRI-01'][0];
    notif.dibaca = false;
    const res = await api.API.request('santri_mark_notif_read', { notifId: notif.idNotif });
    check('mark notif read -> sukses', res.success === true, JSON.stringify(res));
    check('mark notif read -> status berubah', notif.dibaca === true);
  }

  console.log('\nMode Live (klasifikasi error):');

  // --- 4a. timeout -> E_TIMEOUT + retryable + uncertain untuk aksi tulis ----
  {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { api, calls } = buildSandbox(() => Promise.reject(abortErr));
    api.APP_CONFIG.DATA_MODE = 'api';
    const res = await api.API.request('ustaz_add_setoran', { data: {} });
    check('timeout -> code E_TIMEOUT', res.code === 'E_TIMEOUT', res.code);
    check('timeout -> retryable:true', res.retryable === true);
    check('timeout aksi tulis -> uncertain:true', res.uncertain === true);
    check('backend tanpa capability -> TIDAK ada percobaan ulang membuta', calls.length === 1, 'jumlah kirim: ' + calls.length);
  }

  // --- 4b. offline -> E_OFFLINE --------------------------------------------
  {
    const { api } = buildSandbox(() => Promise.reject(new Error('network down')));
    api.APP_CONFIG.DATA_MODE = 'api';
    const res = await api.API.request('santri_get_dashboard');
    check('gagal jaringan -> code E_OFFLINE', res.code === 'E_OFFLINE', res.code);
    check('gagal jaringan -> offline:true (boleh tawarkan Mode Demo)', res.offline === true);
  }

  // --- 4c. respons bukan JSON (deployment belum publik) --------------------
  {
    const { api } = buildSandbox(() => ({ ok: true, status: 200, text: async () => '<html>login google</html>' }));
    api.APP_CONFIG.DATA_MODE = 'api';
    const res = await api.API.request('santri_get_dashboard');
    check('respons HTML -> code E_DEPLOY', res.code === 'E_DEPLOY', res.code);
    check('respons HTML -> misconfigured:true', res.misconfigured === true);
  }

  // --- 4d. respons tanpa field success -> E_CONTRACT ------------------------
  {
    const { api } = buildSandbox(() => OK_RESPONSE({ status: 'API Aktif', versi: '4.0.0' }));
    api.APP_CONFIG.DATA_MODE = 'api';
    const res = await api.API.request('santri_get_dashboard');
    check('respons di luar kontrak -> code E_CONTRACT', res.code === 'E_CONTRACT', res.code);
  }

  // --- 4e. server sibuk -> kode E_BUSY diteruskan, TIDAK diulang ------------
  {
    const { api, calls } = buildSandbox(() => OK_RESPONSE({ success: false, code: 'E_BUSY', message: 'Sibuk' }));
    api.APP_CONFIG.DATA_MODE = 'api';
    const res = await api.API.request('ustaz_add_setoran', { data: {} });
    check('E_BUSY diteruskan apa adanya', res.code === 'E_BUSY' && res.success === false, res.code);
    check('E_BUSY tidak diulang otomatis', calls.length === 1, 'jumlah kirim: ' + calls.length);
  }

  console.log('\nKeamanan percobaan ulang (anti data dobel):');

  // --- 5a. backend mendukung idempotency -> retry 1x dengan requestId SAMA --
  {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { api, calls } = buildSandbox(() => Promise.reject(abortErr));
    api.APP_CONFIG.DATA_MODE = 'api';
    // Capability biasanya datang dari respons sebelumnya; di sini disetel
    // langsung agar yang diuji murni kebijakan percobaan ulang.
    api.API.serverCaps = { idempotency: true };
    calls.length = 0;
    const res = await api.API.request('santri_confirm_murojaah', { data: { jenisMisi: 'Sabaq' } });
    check('aksi tulis diulang tepat 1x saat timeout', calls.length === 2, 'jumlah kirim: ' + calls.length);
    check('percobaan ulang memakai requestId yang SAMA',
      calls.length === 2 && JSON.parse(calls[0].body).requestId === JSON.parse(calls[1].body).requestId);
    check('setiap request membawa requestId', calls.length > 0 && !!JSON.parse(calls[0].body).requestId);
    check('setelah percobaan ulang habis -> uncertain:true', res.success === false && res.uncertain === true, JSON.stringify(res));
  }

  // --- 5b. aksi baca boleh diulang walau backend belum mendukung -----------
  {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    let n = 0;
    const { api, calls } = buildSandbox(() => {
      n++;
      if (n === 1) return Promise.reject(abortErr);
      return OK_RESPONSE({ success: true, data: 'ok' });
    });
    api.APP_CONFIG.DATA_MODE = 'api';
    const res = await api.API.request('ustaz_get_dashboard');
    check('aksi baca diulang 1x saat timeout', calls.length === 2, 'jumlah kirim: ' + calls.length);
    check('aksi baca berhasil pada percobaan ulang', res.success === true);
  }

  // --- 5c. versi backend berbeda -> user diberi peringatan -----------------
  {
    const { api, toasts } = buildSandbox(() => OK_RESPONSE({ success: true, appVersion: '4.2.0', capabilities: { idempotency: false } }));
    api.APP_CONFIG.DATA_MODE = 'api';
    await api.API.request('santri_get_dashboard');
    check('versi backend berbeda -> ada peringatan "backend tertinggal"',
      toasts.some(t => /backend/i.test(t.msg) && /deployment|versi baru/i.test(t.msg)), JSON.stringify(toasts));
  }

  console.log(`\n${pass} lulus, ${fail} gagal.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('TEST RUNNER ERROR:', e.message);
  process.exit(1);
});
