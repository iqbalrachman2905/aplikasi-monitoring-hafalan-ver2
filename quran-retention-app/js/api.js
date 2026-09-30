/**
 * ============================================================================
 * API CLIENT LAYER
 * ============================================================================
 * Mengirim request ke Google Apps Script Web App dengan Content-Type: text/plain
 * untuk menghindari CORS preflight (OPTIONS) browser.
 */

const API = {
  /**
   * Aksi yang MENGUBAH data (menulis ke spreadsheet).
   * Dipakai untuk memilih batas waktu & kebijakan percobaan ulang otomatis.
   */
  WRITE_ACTIONS: [
    'login', 'logout',
    'ustaz_add_setoran', 'ustaz_save_target', 'ustaz_send_feedback', 'ustaz_send_broadcast',
    'santri_confirm_murojaah', 'santri_submit_flashcard_test', 'santri_mark_notif_read',
    'ortu_submit_test_result', 'ortu_send_apresiasi'
  ],

  /** Aksi yang memanggil provider ayat eksternal di sisi server. */
  AYAH_ACTIONS: ['get_ayah_content'],

  /**
   * Taksonomi kode error. Sebelumnya semua kegagalan (timeout, offline, deploy
   * salah, sesi habis, server sibuk) tampil sebagai satu kalimat "koneksi
   * putus", sehingga salah diagnosis. Sekarang tiap kondisi punya kode sendiri.
   */
  ERR: {
    OFFLINE: 'E_OFFLINE',       // tidak ada internet / DNS gagal
    TIMEOUT: 'E_TIMEOUT',       // server belum menjawab sampai batas waktu
    DEPLOY: 'E_DEPLOY',         // respons bukan JSON (deployment belum "Anyone")
    CONTRACT: 'E_CONTRACT',     // respons tidak sesuai kontrak API (backend lama)
    AUTH: 'E_AUTH',             // sesi habis / tidak valid
    FORBIDDEN: 'E_FORBIDDEN',   // role tidak berhak
    BUSY: 'E_BUSY',             // server sibuk (lock), aman dicoba lagi
    QUOTA: 'E_QUOTA',           // kuota Google / runtime habis
    UPSTREAM: 'E_UPSTREAM',     // provider ayat eksternal bermasalah
    VALIDATION: 'E_VALIDATION', // data kiriman tidak valid
    HTTP: 'E_HTTP',
    UNKNOWN: 'E_UNKNOWN'
  },

  /** Pesan default per kode (dipakai bila server tidak mengirim pesan spesifik). */
  ERROR_MESSAGES: {
    E_OFFLINE: 'Tidak ada koneksi ke server. Periksa internet Anda lalu coba lagi.',
    E_TIMEOUT: 'Server belum menjawab sampai batas waktu. Data mungkin sudah tersimpan — kami periksa ulang.',
    E_DEPLOY: 'Deployment Google Apps Script belum dapat diakses publik (akses harus "Anyone"), atau URL di config.js salah.',
    E_CONTRACT: 'Respons server tidak sesuai kontrak API. Kemungkinan deployment backend masih versi lama — buat deployment versi baru.',
    E_AUTH: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
    E_FORBIDDEN: 'Akun Anda tidak memiliki hak untuk tindakan ini.',
    E_BUSY: 'Server sedang sibuk menyimpan data. Coba lagi sebentar lagi.',
    E_QUOTA: 'Batas kuota layanan Google tercapai. Coba lagi beberapa saat lagi.',
    E_UPSTREAM: 'Sumber ayat eksternal sedang tidak merespons. Coba lagi nanti.',
    E_VALIDATION: 'Data yang dikirim belum valid.',
    E_HTTP: 'Server membalas dengan kesalahan HTTP.',
    E_UNKNOWN: 'Terjadi kesalahan yang tidak dikenali. Coba lagi sebentar.'
  },

  /** Capability & versi backend, diambil dari respons server terakhir. */
  serverCaps: null,
  serverVersion: null,
  _versionWarned: false,

  /** ID unik per NIAT pengguna (bukan per percobaan kirim). */
  newRequestId() {
    const rnd = Math.random().toString(36).slice(2, 10);
    return 'req-' + Date.now().toString(36) + '-' + rnd;
  },

  isWriteAction(action) {
    return this.WRITE_ACTIONS.indexOf(String(action)) !== -1;
  },

  /** Batas waktu berbeda per jenis aksi (dulu seragam 8 dtk untuk semua). */
  timeoutFor(action) {
    const p = (APP_CONFIG && APP_CONFIG.API_POLICY) || {};
    if (this.AYAH_ACTIONS.indexOf(String(action)) !== -1) return Number(p.TIMEOUT_AYAH_MS || 12000);
    if (this.isWriteAction(action)) return Number(p.TIMEOUT_WRITE_MS || 25000);
    return Number(p.TIMEOUT_READ_MS || 15000);
  },

  /** Apakah backend mengaku mendukung idempotency (penangkal data dobel)? */
  serverSupportsIdempotency() {
    return !!(this.serverCaps && this.serverCaps.idempotency);
  },

  /** Bangun respons kegagalan yang konsisten + kode error. */
  _fail(code, message, extra) {
    const base = {
      success: false,
      code: code,
      message: message || this.ERROR_MESSAGES[code] || this.ERROR_MESSAGES.E_UNKNOWN,
      retryable: false
    };
    // offline=true dipakai layar login untuk menawarkan "Gunakan Mode Demo"
    if (code === this.ERR.OFFLINE || code === this.ERR.TIMEOUT || code === this.ERR.DEPLOY || code === this.ERR.CONTRACT) {
      base.offline = true;
    }
    const result = Object.assign(base, extra || {});
    return { result: result, code: code };
  },

  /** Simpan capability/versi backend + ingatkan bila versi tidak sinkron. */
  _captureCapabilities(result) {
    if (!result || typeof result !== 'object') return;
    if (result.capabilities) this.serverCaps = result.capabilities;
    if (result.appVersion) this.serverVersion = String(result.appVersion);

    if (this._versionWarned) return;
    const feVersion = (APP_CONFIG && APP_CONFIG.APP_VERSION) || '';
    if (this.serverVersion && this.serverVersion !== feVersion) {
      this._versionWarned = true;
      console.warn(`[API] Versi backend (${this.serverVersion}) berbeda dari frontend (${feVersion}). Buat deployment Apps Script versi baru.`);
      UI.toast(`Backend Google Apps Script masih v${this.serverVersion} (frontend v${feVersion}). Perbaikan backend BELUM aktif — buat deployment versi baru.`, 'error', 7000);
    } else if (!this.serverCaps) {
      this._versionWarned = true;
      console.warn('[API] Backend belum melaporkan capability (deployment lama). Pengamanan request ganda belum aktif.');
      UI.toast('Backend Google Apps Script masih versi lama: pengamanan anti-data-dobel belum aktif. Silakan deploy ulang Code.gs.', 'gold', 7000);
    }
  },

  /**
   * Satu kali percobaan kirim (tanpa logika percobaan ulang).
   * @returns {{result: object, code: string|null}}
   */
  async _sendOnce(action, payload) {
    const startedAt = Date.now();
    const timeoutMs = this.timeoutFor(action);
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => { didTimeout = true; controller.abort(); }, timeoutMs);

    try {
      // WAJIB text/plain;charset=utf-8 agar tidak kena CORS preflight pada GAS
      const response = await fetch(APP_CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return this._fail(this.ERR.HTTP, `Server membalas HTTP ${response.status}.`, {
          retryable: response.status >= 500,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt
        });
      }

      // GAS yang belum publik membalas redirect (302) ke halaman login Google,
      // sehingga isinya HTML — bukan JSON.
      const raw = await response.text();
      let result;
      try {
        result = JSON.parse(raw);
      } catch (parseErr) {
        console.warn('[API] Respons bukan JSON (kemungkinan deployment belum publik / URL salah).');
        return this._fail(this.ERR.DEPLOY, this.ERROR_MESSAGES.E_DEPLOY, {
          misconfigured: true,
          durationMs: Date.now() - startedAt
        });
      }

      this._captureCapabilities(result);

      if (result.unauthorized) {
        Auth.logout();
        UI.toast('Sesi telah berakhir, silakan login kembali', 'error');
        return { result: { success: false, code: this.ERR.AUTH, message: 'Sesi berakhir', unauthorized: true }, code: this.ERR.AUTH };
      }

      if (typeof result.success === 'undefined') {
        return this._fail(this.ERR.CONTRACT, this.ERROR_MESSAGES.E_CONTRACT, {
          durationMs: Date.now() - startedAt
        });
      }

      if (!result.success) {
        // Kode dari server (E_BUSY/E_VALIDATION/E_FORBIDDEN/...) dipertahankan.
        const code = result.code || this.ERR.VALIDATION;
        result.message = result.message || this.ERROR_MESSAGES[code] || this.ERROR_MESSAGES.E_UNKNOWN;
        return { result: result, code: code };
      }

      return { result: result, code: null };
    } catch (err) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startedAt;
      if (didTimeout || (err && err.name === 'AbortError')) {
        console.warn(`[API] Timeout ${timeoutMs}ms pada aksi ${action}.`);
        return this._fail(this.ERR.TIMEOUT, `Server belum menjawab dalam ${Math.round(timeoutMs / 1000)} detik.`, {
          retryable: true,
          durationMs: durationMs
        });
      }
      console.warn(`[API] Gagal menghubungi backend: ${err.message}`);
      return this._fail(this.ERR.OFFLINE, this.ERROR_MESSAGES.E_OFFLINE, {
        retryable: true,
        durationMs: durationMs
      });
    }
  },

  /**
   * Request wrapper utama.
   * - Mode Demo: dilayani handleMockRequest (lokal, instan).
   * - Mode Live: dikirim ke GAS dengan batas waktu per jenis aksi, lalu bila
   *   timeout pada aksi tulis DAN backend mendukung idempotency, dikirim ulang
   *   SEKALI dengan requestId yang SAMA sehingga tidak menghasilkan data dobel.
   * - Setiap respons punya `code` (lihat API.ERR) agar pesan error spesifik.
   */
  async request(action, data = {}) {
    const token = Auth.getToken();
    // requestId dibuat SEKALI per niat: percobaan ulang memakai id yang sama.
    const requestId = this.newRequestId();
    const payload = Object.assign({ action: action, token: token, requestId: requestId }, data);

    // Mode mock: proses instan lokal + simpan snapshot agar tahan refresh.
    if (APP_CONFIG.DATA_MODE === 'mock') {
      const result = this.handleMockRequest(action, payload);
      if (result && result.success && typeof mockSaveState === 'function') {
        mockSaveState();
      }
      return result;
    }

    const isWrite = this.isWriteAction(action);
    const policy = (APP_CONFIG && APP_CONFIG.API_POLICY) || {};
    const retryBudget = Number(isWrite ? policy.RETRY_ON_TIMEOUT_WRITE : policy.RETRY_ON_TIMEOUT_READ) || 0;
    const maxAttempts = 1 + Math.max(0, retryBudget);

    let last = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const outcome = await this._sendOnce(action, payload);
      last = outcome;

      if (outcome.result.success) return outcome.result;
      if (outcome.code !== this.ERR.TIMEOUT) return outcome.result;

      const canRetry = attempt < maxAttempts &&
        (!isWrite || this.serverSupportsIdempotency());
      if (!canRetry) break;
      console.warn(`[API] Percobaan ulang ${attempt}/${maxAttempts - 1} untuk ${action} (requestId sama).`);
    }

    // Timeout pada aksi tulis = status penyimpanan BELUM PASTI (server bisa jadi
    // tetap menyelesaikan request setelah klien menyerah).
    if (isWrite && last && last.code === this.ERR.TIMEOUT) {
      last.result.uncertain = true;
      if (this.serverSupportsIdempotency()) {
        last.result.message = 'Server belum menjawab sampai batas waktu, meski sudah dicoba ulang. Data mungkin TERSIMPAN — memuat ulang data untuk memastikan.';
      } else {
        last.result.message = 'Server belum menjawab sampai batas waktu. Data mungkin TERSIMPAN. Backend masih versi lama (tanpa pengaman anti-dobel), jadi jangan ulangi perintah ini sebelum memeriksa daftar data.';
      }
    }
    return last.result;
  },

  /**
   * Batasi ayatMulai/ayatAkhir pada objek data agar tidak melebihi jumlah ayat
   * surah yang dipilih (mutasi in-place). Aman bila surah tidak dikenali.
   */
  clampAyahToSurah(d) {
    if (!d || !d.surah) return;
    const maxAyat = (typeof QURAN_DATA !== 'undefined' && QURAN_DATA.verseCount)
      ? QURAN_DATA.verseCount(d.surah) : 0;
    if (maxAyat <= 0) return;
    d.ayatMulai = Math.min(Math.max(1, Number(d.ayatMulai) || 1), maxAyat);
    d.ayatAkhir = Math.min(Math.max(d.ayatMulai, Number(d.ayatAkhir) || d.ayatMulai), maxAyat);
  },

  /**
   * Tentukan santri aktif pada Mode Demo (mirror session.idTerkait di backend).
   */
  resolveMockSantriId(user) {
    if (!user) return 'USR-SANTRI-01';
    if (user.role === 'santri') return user.userId;
    if (user.idTerkait) return user.idTerkait;
    return 'USR-SANTRI-01';
  },

  /**
   * Daily Mission Generator sisi klien (mirror generateDailyMissions() di Code.gs).
   * Sabaq = unit terbaru, Sabqi = umur 1..30 hari, Manzil = >30 hari / Merah / overdue.
   * Tanda "completed" dihitung PER UNIT (bukan per jenis misi) dan Sabqi/Manzil
   * saling eksklusif agar tidak ada kartu dobel.
   */
  buildMockMissions(santriId) {
    const cfg = APP_CONFIG.RETENTION || {};
    const gamif = APP_CONFIG.GAMIFICATION || {};
    const today = appTodayStr();
    const ambangSabqi = Number(cfg.AMBANG_SABQI_HARI || 30);

    const priorityOf = (u) => {
      let score = 0;
      if (u.retentionStatus === 'Merah') score += 40;
      else if (u.retentionStatus === 'Kuning') score += 20;
      if (String(u.nextReview || '') && String(u.nextReview) < today) score += 15;
      return score;
    };

    const units = MOCK_STATE.masterHafalan
      .filter(m => m.idSantri === santriId)
      .map(m => Object.assign({}, m));

    // Sabaq: SEMUA unit yang disetorkan hari ini (diffDays <= 0), dengan fallback
    // unit terbaru — mirror generateDailyMissions() di Code.gs.
    const sabaqUnits = units
      .filter(u => (Number(u.diffDays) || 0) <= 0)
      .sort((a, b) => priorityOf(b) - priorityOf(a));
    if (sabaqUnits.length === 0 && units.length > 0) {
      sabaqUnits.push(units.slice().sort((a, b) => (Number(a.diffDays) || 0) - (Number(b.diffDays) || 0))[0]);
    }
    const sabaqIds = new Set(sabaqUnits.map(u => u.idMaster));

    const sabqiUnits = units
      .filter(u => Number(u.diffDays) > 0 && Number(u.diffDays) <= ambangSabqi && !sabaqIds.has(u.idMaster))
      .sort((a, b) => priorityOf(b) - priorityOf(a) || (Number(b.diffDays) || 0) - (Number(a.diffDays) || 0));
    const sabqiIds = new Set(sabqiUnits.map(u => u.idMaster));
    const manzilUnits = units
      .filter(u => (Number(u.diffDays) > ambangSabqi || u.retentionStatus === 'Merah' || String(u.nextReview || '') <= today))
      .filter(u => !sabaqIds.has(u.idMaster) && !sabqiIds.has(u.idMaster))
      .sort((a, b) => priorityOf(b) - priorityOf(a) || (Number(b.diffDays) || 0) - (Number(a.diffDays) || 0));

    const mark = (u, jenis, xp) => Object.assign({}, u, {
      completed: mockIsMurojaahDone(santriId, jenis, u),
      xp: xp
    });

    return {
      sabaq: sabaqUnits.slice(0, 3).map(u => mark(u, 'Sabaq', Number(gamif.XP_SABAQ || 5))),
      sabqi: sabqiUnits.slice(0, 3).map(u => mark(u, 'Sabqi', Number(gamif.XP_SABQI || 8))),
      manzil: manzilUnits.slice(0, 3).map(u => mark(u, 'Manzil', Number(gamif.XP_MANZIL || 12)))
    };
  },

  /**
   * Handler simulasi Mock Data Lokal (Identik dengan Code.gs)
   */
  handleMockRequest(action, payload) {
    const user = Auth.getCurrentUser();
    const todayStr = appTodayStr();

    switch (action) {
      case 'login': {
        // Username DAN password wajib cocok (anti auth-bypass).
        const uname = String(payload.username || '').trim().toLowerCase();
        const upass = String(payload.password || '');
        const u = MOCK_STATE.users.find(
          x => x.username.toLowerCase() === uname && String(x.password || '') === upass
        );
        if (u) {
          const fakeToken = 'mock-token-' + Date.now();
          return {
            success: true,
            token: fakeToken,
            role: u.role,
            nama: u.nama,
            userId: u.id,
            idTerkait: u.idTerkait
          };
        }
        return { success: false, message: 'Username atau password salah (Coba: ustaz1, santri1, atau ortu1 / pass: 123456)' };
      }

      case 'ustaz_get_dashboard': {
        const santriList = MOCK_STATE.santriList.map(s => {
          const masters = MOCK_STATE.masterHafalan.filter(m => m.idSantri === s.idSantri);
          const hijau = masters.filter(m => m.retentionStatus === 'Hijau').length;
          const kuning = masters.filter(m => m.retentionStatus === 'Kuning').length;
          const merah = masters.filter(m => m.retentionStatus === 'Merah').length;
          const overdue = masters.filter(m => String(m.nextReview || '') && String(m.nextReview) < todayStr).length;
          const gamif = MOCK_STATE.gamifikasi[s.idSantri] || { xp: 0, level: 1, currentStreak: 0, longestStreak: 0 };
          const target = MOCK_STATE.targetList.find(t => t.idSantri === s.idSantri && String(t.bulan || '').startsWith(todayStr.slice(0, 7)));

          // Hafalan terakhir santri (diffDays terkecil = paling baru). Dipakai
          // Ustaz untuk usulan target lanjutan 1-klik di modal Atur Target.
          const terbaru = masters.slice().sort((a, b) => (Number(a.diffDays) || 0) - (Number(b.diffDays) || 0))[0] || null;
          const lastUnit = terbaru ? {
            surah: terbaru.surah,
            ayatMulai: terbaru.ayatMulai,
            ayatAkhir: terbaru.ayatAkhir,
            retentionStatus: terbaru.retentionStatus
          } : null;

          // Progres capaian target bulan ini (dipakai Notifikasi Target Ustaz).
          const targetProgress = target ? mockTargetProgress(target, masters) : null;

          const flags = [];
          if (merah > 0) flags.push(`Kritis: ${merah} unit hafalan status Merah`);
          if (overdue >= 2) flags.push(`Overdue: ${overdue} jadwal review terlewat`);
          if ((Number(gamif.currentStreak) || 0) === 0 && masters.length > 0) flags.push('Streak terputus');

          return {
            idSantri: s.idSantri,
            nama: s.nama,
            status: s.status,
            totalHafalan: masters.length,
            retention: { hijau, kuning, merah, overdue: overdue },
            gamifikasi: {
              xp: Number(gamif.xp) || 0,
              level: Number(gamif.level) || 1,
              currentStreak: Number(gamif.currentStreak) || 0,
              longestStreak: Number(gamif.longestStreak) || 0
            },
            target: target ? { bulan: target.bulan, surah: target.surah, ayatMulai: target.ayatMulai, ayatAkhir: target.ayatAkhir } : null,
            targetProgress: targetProgress,
            lastUnit: lastUnit,
            flags: flags
          };
        });

        return {
          success: true,
          ustazName: (user && user.role === 'ustaz') ? user.nama : 'Ustaz Ahmad Fauzi, Al-Hafizh',
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

      case 'ustaz_add_setoran': {
        const d = payload.data || {};
        // Pengaman server-side: ayat akhir tidak boleh melebihi jumlah ayat surah.
        this.clampAyahToSurah(d);
        const idSantri = d.idSantri;
        const nilai = d.nilai || 'A';
        const quality = (nilai === 'A' || nilai === 'B+') ? 'Lancar' : (nilai === 'C' ? 'Lupa' : 'Tersendat');

        MOCK_STATE.setoranHistory.push({
          idHafalan: 'HAF-' + Date.now().toString().slice(-4),
          tgl: d.tgl || todayStr,
          idSantri: idSantri,
          surah: d.surah,
          ayatMulai: Number(d.ayatMulai),
          ayatAkhir: Number(d.ayatAkhir),
          nilai: nilai,
          catatan: d.catatan || ''
        });

        // Tambah/update Master_Hafalan lewat retention engine (nilai C tidak lagi
        // otomatis dianggap Hijau).
        let unit = MOCK_STATE.masterHafalan.find(m =>
          m.idSantri === idSantri &&
          String(m.surah).toLowerCase() === String(d.surah).toLowerCase() &&
          Number(m.ayatMulai) === Number(d.ayatMulai) &&
          Number(m.ayatAkhir) === Number(d.ayatAkhir)
        );

        if (unit) {
          unit.diffDays = 0;
          mockApplyRetention(unit, quality);
        } else {
          unit = {
            idMaster: 'MST-' + Date.now().toString().slice(-4),
            idSantri: idSantri,
            surah: d.surah,
            ayatMulai: Number(d.ayatMulai),
            ayatAkhir: Number(d.ayatAkhir),
            tglMulai: todayStr,
            diffDays: 0,
            status: 'Aktif',
            retentionStatus: 'Hijau',
            nextReview: appDateStrAfter(2),
            interval: 2,
            consecutiveLupa: 0,
            consecutiveLancar: 0
          };
          if (quality !== 'Lancar') mockApplyRetention(unit, quality);
          MOCK_STATE.masterHafalan.push(unit);
        }

        // XP: base Sabaq + bonus Lancar (mirror backend). Streak TIDAK ditambah
        // karena PRD 13.3 hanya menghitung misi murojaah yang dikonfirmasi santri.
        if (!MOCK_STATE.gamifikasi[idSantri]) {
          MOCK_STATE.gamifikasi[idSantri] = { xp: 0, level: 1, currentStreak: 0, longestStreak: 0, lastQualifyingDate: '' };
        }
        const gSetoran = MOCK_STATE.gamifikasi[idSantri];
        const xpAdd = Number(APP_CONFIG.GAMIFICATION.XP_SABAQ || 5) + (quality === 'Lancar' ? Number(APP_CONFIG.GAMIFICATION.XP_BONUS_LANCAR || 5) : 0);
        gSetoran.xp = (Number(gSetoran.xp) || 0) + xpAdd;
        gSetoran.level = Math.floor(gSetoran.xp / APP_CONFIG.GAMIFICATION.LEVEL_XP_STEP) + 1;

        // Notifikasi ke santri (mirror backend)
        if (!MOCK_STATE.notifications[idSantri]) MOCK_STATE.notifications[idSantri] = [];
        MOCK_STATE.notifications[idSantri].push({
          idNotif: 'NTF-' + Date.now().toString().slice(-4),
          tipe: 'Setoran Baru',
          pesan: `Ustaz ${(user && user.nama) || 'pembimbing'} mencatat setoran baru: ${d.surah} (${d.ayatMulai}-${d.ayatAkhir}) dengan nilai ${nilai}`,
          tgl: todayStr,
          dibaca: false
        });

        return { success: true, message: 'Setoran hafalan baru berhasil dicatat dan masuk antrean retensi!' };
      }

      case 'ustaz_save_target': {
        const d = payload.data || {};
        // Pengaman server-side: ayat akhir tidak boleh melebihi jumlah ayat surah.
        this.clampAyahToSurah(d);
        const bulan = d.bulan || appTodayStr().slice(0, 7);
        // Cocokkan per santri + bulan agar target bulan lalu tidak tertimpa
        // (perilaku sama dengan ustazSaveTarget di Code.gs).
        const existing = MOCK_STATE.targetList.find(t =>
          t.idSantri === d.idSantri && String(t.bulan || '') === String(bulan)
        );
        if (existing) {
          existing.surah = d.surah;
          existing.ayatMulai = d.ayatMulai;
          existing.ayatAkhir = d.ayatAkhir;
        } else {
          MOCK_STATE.targetList.push({
            idTarget: 'TGT-' + Date.now().toString().slice(-4),
            bulan: bulan,
            idSantri: d.idSantri,
            surah: d.surah,
            ayatMulai: d.ayatMulai,
            ayatAkhir: d.ayatAkhir
          });
        }
        return { success: true, message: 'Target bulanan berhasil disimpan!' };
      }

      case 'ustaz_send_feedback': {
        const d = payload.data || {};
        if (!MOCK_STATE.notifications[d.idSantri]) {
          MOCK_STATE.notifications[d.idSantri] = [];
        }
        MOCK_STATE.notifications[d.idSantri].push({
          idNotif: 'NTF-' + Date.now().toString().slice(-4),
          tipe: 'Feedback Ustaz',
          pesan: d.pesan,
          tgl: todayStr,
          dibaca: false
        });
        return { success: true, message: 'Feedback berhasil dikirim ke santri!' };
      }

      case 'ustaz_send_broadcast': {
        const d = payload.data || {};
        MOCK_STATE.santriList.forEach(s => {
          if (!MOCK_STATE.notifications[s.idSantri]) MOCK_STATE.notifications[s.idSantri] = [];
          MOCK_STATE.notifications[s.idSantri].push({
            idNotif: 'NTF-' + Date.now().toString().slice(-4),
            tipe: 'Broadcast Ustaz',
            pesan: `Pesan Ustaz: "${d.pesan}"`,
            tgl: todayStr,
            dibaca: false
          });
        });
        return { success: true, message: 'Pesan motivasi berhasil disebarkan ke semua santri!' };
      }

      case 'santri_get_dashboard': {
        const sId = this.resolveMockSantriId(user);
        const santriMeta = MOCK_STATE.santriList.find(s => s.idSantri === sId);
        const gamif = MOCK_STATE.gamifikasi[sId] || { xp: 0, level: 1, currentStreak: 0, longestStreak: 0 };
        const badges = MOCK_STATE.badges[sId] || [];
        const notifs = MOCK_STATE.notifications[sId] || [];

        // Heatmap digabung dengan log murojaah & riwayat tes hari ini agar
        // keaktifan yang baru dicatat langsung terlihat (tidak statis).
        const heatmap = Object.assign({}, MOCK_STATE.activityHeatmap[sId] || {});
        const bump = (tgl) => { if (tgl) heatmap[tgl] = (Number(heatmap[tgl]) || 0) + 1; };
        MOCK_STATE.murojaahLog.forEach(l => { if (l.idSantri === sId) bump(l.tgl); });
        MOCK_STATE.riwayatTes.forEach(t => { if (t.idSantri === sId) bump(t.tgl); });

        return {
          success: true,
          nama: (user && user.role === 'santri') ? user.nama : (santriMeta ? santriMeta.nama : 'Santri'),
          santriId: sId,
          missions: this.buildMockMissions(sId),
          gamifikasi: gamif,
          badges: badges,
          notifications: notifs.slice(-10).reverse(),
          activityMap: heatmap
        };
      }

      case 'santri_confirm_murojaah': {
        const d = payload.data || {};
        const sId = this.resolveMockSantriId(user);

        let baseXP = Number(APP_CONFIG.GAMIFICATION.XP_SABAQ || 5);
        if (d.jenisMisi === 'Sabqi') baseXP = Number(APP_CONFIG.GAMIFICATION.XP_SABQI || 8);
        if (d.jenisMisi === 'Manzil') baseXP = Number(APP_CONFIG.GAMIFICATION.XP_MANZIL || 12);
        const bonusXP = d.kualitas === 'Lancar' ? Number(APP_CONFIG.GAMIFICATION.XP_BONUS_LANCAR || 5) : 0;

        // Event-driven retention update 1 unit (mirror updateMasterHafalanCache).
        let recoveryBonusXP = 0;
        if (d.idMaster) {
          const m = MOCK_STATE.masterHafalan.find(x => x.idMaster === d.idMaster);
          if (m) {
            const res = mockApplyRetention(m, d.kualitas || 'Lancar');
            if (res.recoveryAchieved) recoveryBonusXP = Number(APP_CONFIG.GAMIFICATION.XP_BONUS_RECOVERY || 15);
          }
        }

        if (!MOCK_STATE.gamifikasi[sId]) {
          MOCK_STATE.gamifikasi[sId] = { xp: 0, level: 1, currentStreak: 0, longestStreak: 0, lastQualifyingDate: '' };
        }
        const gamif = MOCK_STATE.gamifikasi[sId];
        const totalXP = baseXP + bonusXP + recoveryBonusXP;
        gamif.xp = (Number(gamif.xp) || 0) + totalXP;
        gamif.level = Math.floor(gamif.xp / APP_CONFIG.GAMIFICATION.LEVEL_XP_STEP) + 1;

        // Qualifying activity: streak naik maksimal 1x per hari (PRD 13.3).
        const todayKey = appTodayStr();
        if (gamif.lastQualifyingDate !== todayKey) {
          gamif.currentStreak = (gamif.lastQualifyingDate === appDateStrAfter(-1)) ? (Number(gamif.currentStreak) || 0) + 1 : 1;
          gamif.longestStreak = Math.max(Number(gamif.longestStreak) || 0, gamif.currentStreak);
          gamif.lastQualifyingDate = todayKey;
        }

        // Catat ke log murojaah (mirror sheet Murojaah) -> misi selesai per unit.
        const mulai = Number(d.ayatMulai) || 1;
        const akhir = Number(d.ayatAkhir) || mulai;
        MOCK_STATE.murojaahLog.push({
          idMurojaah: 'MUR-' + Date.now().toString().slice(-6),
          tgl: todayKey,
          idSantri: sId,
          jenisMisi: d.jenisMisi || 'Sabaq',
          detail: `${d.surah || ''} (${mulai}-${akhir})`,
          pelapor: (user && user.nama) || 'Santri'
        });

        return {
          success: true,
          message: `Alhamdulillah! Murojaah ${d.jenisMisi} selesai (+${totalXP} XP)`,
          gamifikasi: gamif
        };
      }

      case 'santri_submit_flashcard_test': {
        const d = payload.data || {};
        const sId = this.resolveMockSantriId(user);
        const baseXP = d.isCorrect ? 5 : 1;

        // Event-driven retention update (mirror santriSubmitFlashcard di Code.gs).
        if (d.idMaster) {
          const m = MOCK_STATE.masterHafalan.find(x => x.idMaster === d.idMaster);
          if (m) mockApplyRetention(m, d.isCorrect ? 'Lancar' : 'Tersendat');
        }

        if (!MOCK_STATE.gamifikasi[sId]) {
          MOCK_STATE.gamifikasi[sId] = { xp: 0, level: 1, currentStreak: 0, longestStreak: 0, lastQualifyingDate: '' };
        }
        const gamif = MOCK_STATE.gamifikasi[sId];
        gamif.xp = (Number(gamif.xp) || 0) + baseXP;
        gamif.level = Math.floor(gamif.xp / APP_CONFIG.GAMIFICATION.LEVEL_XP_STEP) + 1;

        // Flashcard bukan misi murojaah -> tidak menambah streak (PRD 13.3).
        return {
          success: true,
          message: d.isCorrect ? 'Jawaban Benar! +5 XP' : 'Tetap Semangat! +1 XP',
          gamifikasi: gamif
        };
      }

      case 'ortu_get_dashboard': {
        const sId = this.resolveMockSantriId(user);
        const masters = MOCK_STATE.masterHafalan.filter(m => m.idSantri === sId);
        const hijau = masters.filter(m => m.retentionStatus === 'Hijau').length;
        const kuning = masters.filter(m => m.retentionStatus === 'Kuning').length;
        const merah = masters.filter(m => m.retentionStatus === 'Merah').length;
        const gamif = MOCK_STATE.gamifikasi[sId] || { xp: 0, level: 1, currentStreak: 0, longestStreak: 0 };
        const santriMeta = MOCK_STATE.santriList.find(s => s.idSantri === sId);

        return {
          success: true,
          ortuName: (user && user.role === 'ortu') ? user.nama : 'Bapak Ridwan (Ortu Hafizh)',
          santriId: sId,
          santriName: santriMeta ? santriMeta.nama : 'Ananda',
          retention: { hijau, kuning, merah, total: masters.length },
          gamifikasi: {
            xp: Number(gamif.xp) || 0,
            level: Number(gamif.level) || 1,
            currentStreak: Number(gamif.currentStreak) || 0,
            longestStreak: Number(gamif.longestStreak) || 0
          },
          unitList: masters,
          recentTests: MOCK_STATE.riwayatTes.filter(t => t.idSantri === sId)
        };
      }

      case 'ortu_get_random_test': {
        const sId = this.resolveMockSantriId(user);

        // Pool: keluarkan hafalan terlalu baru (<1 hari), lalu weighted random
        // (Merah > Kuning > Hijau, overdue lebih diprioritaskan) — mirror Code.gs.
        const pool = MOCK_STATE.masterHafalan
          .filter(m => m.idSantri === sId && Number(m.diffDays) >= 1)
          .map(m => {
            let weight = 1;
            if (m.retentionStatus === 'Merah') weight = 5;
            else if (m.retentionStatus === 'Kuning') weight = 3;
            if (String(m.nextReview || '') && String(m.nextReview) <= todayStr) weight += 2;
            return Object.assign({}, m, { weight: weight });
          });

        if (pool.length === 0) {
          return {
            success: false,
            message: 'Belum ada hafalan yang memenuhi syarat untuk diuji (minimal berumur 1 hari).'
          };
        }

        const totalWeight = pool.reduce((acc, item) => acc + item.weight, 0);
        let randomVal = Math.random() * totalWeight;
        let candidate = pool[0];
        for (const item of pool) {
          randomVal -= item.weight;
          if (randomVal <= 0) { candidate = item; break; }
        }

        const targetAyat = Math.floor(Math.random() * (candidate.ayatAkhir - candidate.ayatMulai + 1)) + candidate.ayatMulai;

        return {
          success: true,
          test: {
            idMaster: candidate.idMaster,
            surah: candidate.surah,
            ayatMulai: candidate.ayatMulai,
            ayatAkhir: candidate.ayatAkhir,
            targetAyat: targetAyat,
            retentionStatus: candidate.retentionStatus
          }
        };
      }

      case 'ortu_submit_test_result': {
        const d = payload.data || {};
        const sId = this.resolveMockSantriId(user);

        MOCK_STATE.riwayatTes.unshift({
          idTes: 'TES-' + Date.now().toString().slice(-4),
          tgl: todayStr,
          idSantri: sId,
          surah: d.surah,
          ayatMulai: Number(d.targetAyat) || 1,
          ayatAkhir: Number(d.targetAyat) || 1,
          kualitas: d.kualitas,
          pelapor: 'Orang Tua: ' + ((user && user.nama) || 'Orang Tua')
        });

        // Event-driven retention cache update (mirror ortuSubmitTestResult).
        let recoveryBonusXP = 0;
        if (d.idMaster) {
          const m = MOCK_STATE.masterHafalan.find(x => x.idMaster === d.idMaster);
          if (m) {
            const res = mockApplyRetention(m, d.kualitas || 'Tersendat');
            if (res.recoveryAchieved) recoveryBonusXP = Number(APP_CONFIG.GAMIFICATION.XP_BONUS_RECOVERY || 15);
          }
        }

        if (!MOCK_STATE.gamifikasi[sId]) {
          MOCK_STATE.gamifikasi[sId] = { xp: 0, level: 1, currentStreak: 0, longestStreak: 0, lastQualifyingDate: '' };
        }
        const gamif = MOCK_STATE.gamifikasi[sId];
        const bonusXP = d.kualitas === 'Lancar' ? Number(APP_CONFIG.GAMIFICATION.XP_BONUS_LANCAR || 5) : 0;
        const totalXP = 5 + bonusXP + recoveryBonusXP;
        gamif.xp = (Number(gamif.xp) || 0) + totalXP;
        gamif.level = Math.floor(gamif.xp / APP_CONFIG.GAMIFICATION.LEVEL_XP_STEP) + 1;

        // Qualifying activity (tes ortu = evaluasi tercatat), maksimal 1x per hari.
        const todayKey = appTodayStr();
        if (gamif.lastQualifyingDate !== todayKey) {
          gamif.currentStreak = (gamif.lastQualifyingDate === appDateStrAfter(-1)) ? (Number(gamif.currentStreak) || 0) + 1 : 1;
          gamif.longestStreak = Math.max(Number(gamif.longestStreak) || 0, gamif.currentStreak);
          gamif.lastQualifyingDate = todayKey;
        }

        // Notifikasi ke santri (mirror backend ortuSubmitTestResult)
        if (!MOCK_STATE.notifications[sId]) MOCK_STATE.notifications[sId] = [];
        MOCK_STATE.notifications[sId].push({
          idNotif: 'NTF-' + Date.now().toString().slice(-4),
          tipe: 'Hasil Tes Ortu',
          pesan: `Orang tua menguji ${d.surah} ayat ${d.targetAyat || 1}: Hasil "${d.kualitas}" (+${totalXP} XP)`,
          tgl: todayKey,
          dibaca: false
        });

        return {
          success: true,
          message: `Evaluasi ${d.kualitas} berhasil dicatat! Ananda mendapat +${totalXP} XP`,
          gamifikasi: gamif
        };
      }

      case 'ortu_send_apresiasi': {
        const d = payload.data || {};
        const sId = this.resolveMockSantriId(user);
        if (!MOCK_STATE.notifications[sId]) MOCK_STATE.notifications[sId] = [];
        MOCK_STATE.notifications[sId].push({
          idNotif: 'NTF-' + Date.now().toString().slice(-4),
          tipe: 'Apresiasi Ortu',
          pesan: `Pesan Semangat Ortu: "${d.pesan}" ❤️`,
          tgl: todayStr,
          dibaca: false
        });
        return { success: true, message: 'Pesan apresiasi berhasil terkirim ke Ananda!' };
      }

      case 'santri_mark_notif_read': {
        // Mirror markNotificationRead() di Code.gs: tandai 1 notifikasi milik
        // santri aktif sebagai sudah dibaca.
        const sId = this.resolveMockSantriId(user);
        const list = MOCK_STATE.notifications[sId] || [];
        const target = list.find(n => String(n.idNotif) === String(payload.notifId));
        if (!target) {
          return { success: false, code: 'E_VALIDATION', message: 'Notifikasi tidak ditemukan' };
        }
        target.dibaca = true;
        return { success: true, message: 'Notifikasi ditandai sudah dibaca' };
      }

      case 'logout': {
        // Mode Demo tidak punya sesi server; logout ditangani Auth.logout().
        return { success: true, message: 'Logout (Mode Demo)' };
      }

      default:
        // JANGAN mengembalikan success:true untuk aksi yang belum ada. Mock yang
        // "selalu berhasil" menyembunyikan fitur yang belum diimplementasikan —
        // inilah yang dulu menutupi bug feedback Ustaz yang tidak sampai ke Santri.
        console.warn('[Mock] action belum diimplementasikan:', action);
        return {
          success: false,
          code: 'E_VALIDATION',
          unknownAction: true,
          message: `Mode Demo belum mendukung aksi "${action}". Lengkapi handleMockRequest() di api.js atau aktifkan Mode Live.`
        };
    }
  }
};
