/**
 * ============================================================================
 * DASHBOARD ORANG TUA CONTROLLER
 * ============================================================================
 */

const DashboardOrtu = {
  data: null,
  currentRandomTest: null,
  testFilterMonth: '',

  async load() {
    UI.showLoading(true, 'Memuat Rapor & Evaluasi Ananda...');
    try {
      const res = await API.request('ortu_get_dashboard');
      UI.showLoading(false);

      if (res.success) {
        this.data = res;
        this.render();
      } else {
        UI.toast(res.message || 'Gagal memuat dashboard Orang Tua', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error memuat data orang tua', 'error');
    }
  },

  /**
   * Baca jumlah streak dari berbagai bentuk kontrak backend (tahan versi lama).
   */
  streakOf(gamif) {
    const g = gamif || {};
    const val = (g.currentStreak != null) ? g.currentStreak : g.streak;
    return Number(val) || 0;
  },

  /** Ringkas progres untuk kartu "terakhir dilakukan" dan tindakan hari ini. */
  buildDashboardGuidance() {
    const activity = this.data && this.data.lastActivity;
    const units = (this.data && this.data.unitList) || [];
    const retention = (this.data && this.data.retention) || {};
    const eligibleValue = this.data && this.data.eligibleTestCount;
    const hasEligibleCount = eligibleValue !== null && eligibleValue !== undefined && Number.isFinite(Number(eligibleValue));
    const eligibleCount = hasEligibleCount
      ? Number(eligibleValue)
      : units.filter(unit => unit.testEligible !== false).length;
    const overdueCount = units.filter(unit => unit.nextReview && String(unit.nextReview).slice(0, 10) <= appTodayStr()).length;

    let next;
    if (!units.length) {
      next = {
        enabled: false,
        title: 'Belum ada unit hafalan untuk diuji',
        detail: 'Koordinasikan setoran awal dengan Ustaz. Setelah hafalan tercatat, rapor dan tes acak akan muncul di sini.'
      };
    } else if (eligibleCount <= 0) {
      next = {
        enabled: false,
        title: 'Hafalan baru belum siap diuji',
        detail: 'Setiap unit perlu berumur minimal satu hari sebelum masuk pilihan tes. Hari ini, dampingi murojaah atau kirim apresiasi.'
      };
    } else if (Number(retention.merah) > 0) {
      next = {
        enabled: true,
        title: `Fokus pada ${Number(retention.merah)} unit Merah`,
        detail: 'Mulai tes acak. Sistem memberi bobot lebih besar pada hafalan Merah dan jadwal review yang terlambat.'
      };
    } else if (overdueCount > 0) {
      next = {
        enabled: true,
        title: `${overdueCount} jadwal review sudah tiba`,
        detail: 'Lakukan tes acak agar sistem memilih hafalan yang perlu diperiksa lebih dahulu.'
      };
    } else if (Number(retention.kuning) > 0) {
      next = {
        enabled: true,
        title: `Jaga ${Number(retention.kuning)} unit berstatus Kuning`,
        detail: 'Lakukan tes acak untuk membantu menguatkan hafalan yang mulai perlu perhatian.'
      };
    } else {
      next = {
        enabled: true,
        title: 'Pertahankan hafalan yang sehat',
        detail: 'Lakukan tes acak berkala; unit Merah/Kuning atau yang jatuh tempo akan lebih diprioritaskan.'
      };
    }

    return {
      activity: activity ? {
        title: activity.title || 'Aktivitas terakhir',
        detail: activity.detail || 'Rincian aktivitas tidak tersedia.',
        meta: [activity.tgl, activity.actor, activity.outcome].filter(Boolean).join(' • ')
      } : {
        title: 'Belum ada aktivitas tercatat',
        detail: 'Setoran, murojaah, dan tes yang tersimpan akan muncul di sini.',
        meta: 'Aktivitas pertama akan menjadi awal riwayat ananda.'
      },
      next
    };
  },

  formatActivityDate(value) {
    const raw = String(value || '');
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return raw;
    const date = new Date(`${match[1]}T12:00:00`);
    if (isNaN(date.getTime())) return match[1];
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  },

  renderDashboardGuidance() {
    const guidance = this.buildDashboardGuidance();
    const activity = guidance.activity;
    const titleEl = document.getElementById('ortu-last-activity-title');
    const detailEl = document.getElementById('ortu-last-activity-detail');
    const metaEl = document.getElementById('ortu-last-activity-meta');
    const nextSummaryTitleEl = document.getElementById('ortu-next-summary-title');
    const nextSummaryDetailEl = document.getElementById('ortu-next-summary-detail');
    const nextTitleEl = document.getElementById('ortu-next-test-title');
    const nextDetailEl = document.getElementById('ortu-next-test-detail');
    const button = document.getElementById('ortu-random-test-button');

    if (titleEl) titleEl.textContent = activity.title;
    if (detailEl) detailEl.textContent = activity.detail;
    if (metaEl) metaEl.textContent = activity.meta
      ? activity.meta.split(' • ').map(part => this.formatActivityDate(part)).join(' • ')
      : '';
    if (nextSummaryTitleEl) nextSummaryTitleEl.textContent = guidance.next.title;
    if (nextSummaryDetailEl) nextSummaryDetailEl.textContent = guidance.next.detail;
    if (nextTitleEl) nextTitleEl.textContent = guidance.next.title;
    if (nextDetailEl) nextDetailEl.textContent = guidance.next.detail;
    if (button) {
      button.disabled = !guidance.next.enabled;
      button.setAttribute('aria-disabled', String(!guidance.next.enabled));
      button.title = guidance.next.enabled ? 'Mulai tes hafalan acak pintar' : guidance.next.detail;
    }
  },

  /** Rangkuman aktivitas yang tercatat pada tujuh hari terakhir. */
  renderWeeklySummary() {
    const container = document.getElementById('ortu-weekly-summary');
    if (!container) return;
    const summary = this.data && this.data.weeklySummary;
    if (!summary || !summary.startDate || !summary.endDate) {
      container.innerHTML = '<p class="trend-empty">Ringkasan pekanan belum tersedia dari versi backend ini.</p>';
      return;
    }
    const setoran = Number(summary.setoran) || 0;
    const murojaah = Number(summary.murojaah) || 0;
    const evaluasi = Number(summary.evaluasi) || 0;
    const activeDays = Number(summary.activeDays) || 0;
    const tests = summary.hasilTes || {};
    const period = [summary.startDate, summary.endDate]
      .filter(Boolean).map(date => this.formatActivityDate(date));
    const metrics = [
      { value: murojaah, label: 'Murojaah' },
      { value: evaluasi, label: 'Evaluasi' },
      { value: setoran, label: 'Setoran' },
      { value: `${activeDays}/7`, label: 'Hari aktif' }
    ];
    const note = evaluasi > 0
      ? `Hasil tes: ${Number(tests.Lancar) || 0} Lancar • ${Number(tests.Tersendat) || 0} Tersendat • ${Number(tests.Lupa) || 0} Lupa.`
      : (Number(summary.totalAktivitas) > 0
        ? 'Ada aktivitas tercatat, tetapi belum ada evaluasi pada tujuh hari ini.'
        : 'Belum ada aktivitas tercatat dalam tujuh hari ini.');

    container.innerHTML = `
      ${period.length === 2 ? `<p class="weekly-summary-period">${UI.escapeHTML(period[0])} – ${UI.escapeHTML(period[1])}</p>` : ''}
      <div class="weekly-summary-grid" role="group" aria-label="Jumlah aktivitas selama tujuh hari terakhir">
        ${metrics.map(item => `
          <div class="weekly-summary-tile">
            <strong>${UI.escapeHTML(item.value)}</strong>
            <span>${UI.escapeHTML(item.label)}</span>
          </div>`).join('')}
      </div>
      <p class="weekly-summary-note">${UI.escapeHTML(note)}</p>`;
  },

  /** Nilai rata-rata tes tiap bulan untuk tren tanpa library tambahan. */
  buildMonthlyTestTrend() {
    const scoreOf = { Lancar: 100, Tersendat: 60, Lupa: 20 };
    const groups = Object.create(null);
    ((this.data && this.data.recentTests) || []).forEach(test => {
      const month = String(test.tgl || '').slice(0, 7);
      const score = scoreOf[String(test.kualitas || '')];
      if (!/^\d{4}-\d{2}$/.test(month) || score === undefined) return;
      if (!groups[month]) groups[month] = { month, total: 0, count: 0 };
      groups[month].total += score;
      groups[month].count++;
    });
    return Object.keys(groups).sort().slice(-6).map(month => ({
      month,
      label: this.buildMonthLabel(month),
      count: groups[month].count,
      score: Math.round(groups[month].total / groups[month].count)
    }));
  },

  renderTestTrend() {
    const container = document.getElementById('ortu-test-trend');
    if (!container) return;
    const trend = this.buildMonthlyTestTrend();
    if (trend.length < 2) {
      const note = trend.length === 1
        ? `Data tes baru tersedia untuk ${trend[0].label}. Tren bulanan akan terlihat setelah ada evaluasi pada bulan lain.`
        : 'Belum cukup riwayat tes untuk membentuk tren. Evaluasi 1-klik akan mulai mengisi grafik ini.';
      container.innerHTML = `<p class="trend-empty">${UI.escapeHTML(note)}</p>`;
      return;
    }

    const description = trend.map(item => `${item.label}: ${item.score} dari 100 (${item.count} tes)`).join('; ');
    container.innerHTML = `
      <div class="monthly-trend" role="img" aria-label="Rata-rata hasil tes enam bulan terakhir: ${UI.escapeHTML(description)}">
        ${trend.map(item => {
          const tone = appCompetencyLabel(item.score).tone;
          return `
            <div class="monthly-trend-item" aria-hidden="true">
              <span class="monthly-trend-score">${item.score}</span>
              <div class="monthly-trend-track"><div class="monthly-trend-bar tone-${tone}" style="height:${Math.max(6, item.score)}%"></div></div>
              <span class="monthly-trend-label">${UI.escapeHTML(item.label.split(' ')[0])}</span>
            </div>`;
        }).join('')}
      </div>
      <p class="trend-legend">Skor ringkasan: Lancar 100 • Tersendat 60 • Lupa 20. Nilai adalah rata-rata hasil tes per bulan.</p>`;
  },

  render() {
    if (!this.data) return;

    // 1. Greeting
    const greetingEl = document.getElementById('ortu-greeting');
    if (greetingEl) {
      greetingEl.textContent = `${UI.getIslamicGreeting()}, ${this.data.ortuName}`;
    }

    const santriNameEl = document.getElementById('ortu-santri-name-banner');
    if (santriNameEl) {
      santriNameEl.textContent = `Memantau: ${this.data.santriName}`;
    }

    // 2. Traffic Light Summary Cards
    const ret = this.data.retention || { hijau: 0, kuning: 0, merah: 0, total: 0 };
    document.getElementById('ortu-stat-hijau').textContent = ret.hijau;
    document.getElementById('ortu-stat-kuning').textContent = ret.kuning;
    document.getElementById('ortu-stat-merah').textContent = ret.merah;
    document.getElementById('ortu-stat-total').textContent = ret.total;

    // Gamifikasi Ringkasan (mendukung field currentStreak maupun streak)
    const gamif = this.data.gamifikasi || { xp: 0, level: 1, currentStreak: 0 };
    const streakEl = document.getElementById('ortu-streak-val');
    if (streakEl) streakEl.textContent = `${this.streakOf(gamif)} Hari 🔥`;
    const xpEl = document.getElementById('ortu-xp-val');
    if (xpEl) xpEl.textContent = `${Number(gamif.xp) || 0} XP (Level ${Number(gamif.level) || 1})`;

    // 3. Aktivitas terakhir, ringkasan tujuh hari, dan tindakan yang disarankan.
    this.renderDashboardGuidance();
    this.renderWeeklySummary();

    // 4. Peta Kompetensi Ananda (per surah) + Kekuatan & Fokus
    this.renderCompetencyMap();

    // 5. Daftar Unit Hafalan & Status Retensi
    this.renderHafalanUnits();

    // 5. Riwayat Tes Terakhir (dengan filter bulan)
    this.renderTestFilter();
    this.renderRecentTests();
    this.renderTestTrend();
  },

  /** "2026-09" -> "Sep 2026" */
  buildMonthLabel(ym) {
    const parts = String(ym).split('-').map(Number);
    if (!parts[0] || !parts[1]) return ym;
    const nama = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${nama[parts[1] - 1]} ${parts[0]}`;
  },

  /**
   * Bangun opsi filter bulan dari riwayat tes yang tersedia.
   */
  renderTestFilter() {
    const select = document.getElementById('ortu-test-filter-month');
    if (!select) return;

    const tests = (this.data && this.data.recentTests) || [];
    const months = Array.from(new Set(
      tests.map(t => String(t.tgl || '').slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))
    )).sort().reverse();

    const current = select.value || this.testFilterMonth;
    select.innerHTML = '<option value="">Semua bulan</option>'
      + months.map(m => `<option value="${UI.escapeHTML(m)}">${UI.escapeHTML(this.buildMonthLabel(m))}</option>`).join('');

    if (current && months.indexOf(current) !== -1) select.value = current;
    else { select.value = ''; this.testFilterMonth = ''; }

    if (select.dataset.bound !== 'true') {
      select.dataset.bound = 'true';
      select.addEventListener('change', () => {
        this.testFilterMonth = select.value;
        this.renderRecentTests();
      });
    }
  },

  /**
   * Bobot skor 1 unit hafalan (0-100) — satu sumber kebenaran dengan Ustaz.
   */
  skorUnit(retentionStatus) {
    const cfg = (APP_CONFIG && APP_CONFIG.COMPETENCY) || {};
    if (retentionStatus === 'Merah') return Number(cfg.SKOR_MERAH || 20);
    if (retentionStatus === 'Kuning') return Number(cfg.SKOR_KUNING || 60);
    return Number(cfg.SKOR_HIJAU || 100);
  },

  /**
   * Kelompokkan unit hafalan per surah menjadi peta kompetensi.
   * @returns {Array<{surah, total, hijau, kuning, merah, skor, progress, label, tone}>}
   */
  buildCompetencyMap() {
    const units = (this.data && this.data.unitList) || [];
    const bySurah = {};

    units.forEach(u => {
      const key = String(u.surah || 'Tanpa Nama');
      if (!bySurah[key]) bySurah[key] = { surah: key, units: [], ayatMaks: 0 };
      bySurah[key].units.push(u);
      bySurah[key].ayatMaks = Math.max(bySurah[key].ayatMaks, Number(u.ayatAkhir) || 0);
    });

    return Object.keys(bySurah).map(key => {
      const g = bySurah[key];
      const total = g.units.length;
      const hijau = g.units.filter(u => (u.retentionStatus || 'Hijau') === 'Hijau').length;
      const kuning = g.units.filter(u => u.retentionStatus === 'Kuning').length;
      const merah = g.units.filter(u => u.retentionStatus === 'Merah').length;
      const skor = total ? Math.round(g.units.reduce((a, u) => a + this.skorUnit(u.retentionStatus), 0) / total) : 0;

      // Cakupan surah: seberapa besar bagian surah yang sudah dihafal.
      const meta = QURAN_DATA.getSurahByName(key);
      const verses = meta && meta.verses ? meta.verses : 0;
      const progress = verses ? Math.min(100, Math.round((g.ayatMaks / verses) * 100)) : 0;

      const tone = appCompetencyLabel(skor).tone;
      return { surah: key, total, hijau, kuning, merah, skor, progress, label: appCompetencyLabel(skor).label, tone };
    }).sort((a, b) => b.skor - a.skor);
  },

  renderCompetencyMap() {
    const container = document.getElementById('ortu-kompetensi-map');
    if (!container) return;

    const map = this.buildCompetencyMap();
    if (map.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:1.5rem;">Belum ada hafalan untuk dipetakan. Setoran pertama akan otomatis muncul di sini.</p>`;
      return;
    }

    // Ringkasan skor keseluruhan
    const overall = Math.round(map.reduce((a, s) => a + s.skor, 0) / map.length);
    const overallLabel = appCompetencyLabel(overall);
    const summaryEl = document.getElementById('ortu-kompetensi-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div class="competency-score-badge tone-${overallLabel.tone}">${overall}</div>
          <div>
            <div style="font-weight:800; color:var(--emerald-950);">Kompetensi Hafalan: ${overallLabel.label}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">Rata-rata dari ${map.length} surah yang sedang dihafal</div>
          </div>
        </div>`;
    }

    container.innerHTML = map.map(s => {
      const barWidth = Math.max(4, s.skor);
      return `
        <div class="competency-row">
          <div class="competency-row-head">
            <div style="font-weight:700; color:var(--emerald-950);">${UI.escapeHTML(s.surah)}</div>
            <span class="status-pill status-${s.tone === 'green' ? 'green' : (s.tone === 'yellow' ? 'yellow' : 'red')}" style="font-size:0.65rem;">${UI.escapeHTML(s.label)}</span>
          </div>
          <div class="competency-bar"><div class="competency-bar-fill tone-${s.tone}" style="width:${barWidth}%"></div></div>
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted); margin-top:0.2rem;">
            <span>${s.total} unit • 🟢${s.hijau} 🟡${s.kuning} 🔴${s.merah}</span>
            <span>Cakupan surah: ${s.progress}%</span>
          </div>
        </div>`;
    }).join('');

    this.renderStrengthFocus(map);
  },

  /**
   * "Kekuatan Ananda" & "Fokus Latihan" — diterjemahkan ke bahasa orang tua.
   */
  renderStrengthFocus(map) {
    const container = document.getElementById('ortu-strength-focus');
    if (!container || !map.length) return;

    const strengths = map.slice(0, 3);
    const fokus = map.slice().sort((a, b) => a.skor - b.skor).slice(0, 3);
    const chip = (s, cls) => `<span class="potensi-chip ${cls}">${UI.escapeHTML(s.surah)}</span>`;

    container.innerHTML = `
      <div class="potensi-block">
        <div class="potensi-title">💪 Kekuatan Ananda</div>
        <div class="potensi-chips">${strengths.map(s => chip(s, 'green')).join('')}</div>
        <div class="potensi-note">Pertahankan dengan murojaah rutin — ini hafalan paling sehat saat ini.</div>
      </div>
      <div class="potensi-block">
        <div class="potensi-title">🎯 Fokus Latihan</div>
        <div class="potensi-chips">${fokus.map(s => chip(s, 'red')).join('')}</div>
        <div class="potensi-note">Ajari ulang perlahan atau minta Ustaz memberi arahan khusus untuk surah ini.</div>
      </div>`;
  },

  renderHafalanUnits() {
    const container = document.getElementById('ortu-hafalan-units-list');
    if (!container) return;

    const units = this.data.unitList || [];
    if (units.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Belum ada unit hafalan aktif.</p>`;
      return;
    }

    container.innerHTML = units.map(u => {
      const status = String(u.retentionStatus || 'Hijau');
      let statusClass = 'status-green';
      let dotClass = 'green';
      if (status === 'Kuning') { statusClass = 'status-yellow'; dotClass = 'yellow'; }
      if (status === 'Merah') { statusClass = 'status-red'; dotClass = 'red'; }

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border-light);">
          <div>
            <div style="font-weight: 700; color: var(--emerald-950);">${UI.escapeHTML(u.surah)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Ayat ${Number(u.ayatMulai) || 0} - ${Number(u.ayatAkhir) || 0}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="status-pill ${statusClass}">
              <span class="status-dot dot-${dotClass}"></span>
              ${UI.escapeHTML(status)}
            </span>
          </div>
        </div>
      `;
    }).join('');
  },

  renderRecentTests() {
    const container = document.getElementById('ortu-recent-tests-list');
    if (!container) return;

    const all = this.data.recentTests || [];
    const tests = this.testFilterMonth
      ? all.filter(t => String(t.tgl || '').startsWith(this.testFilterMonth))
      : all;

    if (tests.length === 0) {
      const msg = this.testFilterMonth
        ? `Belum ada riwayat tes pada ${UI.escapeHTML(this.buildMonthLabel(this.testFilterMonth))}.`
        : 'Belum ada riwayat tes evaluasi.';
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1rem;">${msg}</p>`;
      return;
    }

    container.innerHTML = tests.map(t => {
      const kualitas = String(t.kualitas || '-');
      let badgeColor = 'status-green';
      if (kualitas === 'Tersendat') badgeColor = 'status-yellow';
      if (kualitas === 'Lupa') badgeColor = 'status-red';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px dashed var(--border-light);">
          <div>
            <div style="font-weight: 600; font-size: 0.9rem;">${UI.escapeHTML(t.surah)} (Ayat ${Number(t.ayatMulai) || 0}${Number(t.ayatAkhir) !== Number(t.ayatMulai) ? '-' + (Number(t.ayatAkhir) || 0) : ''})</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${UI.escapeHTML(t.tgl)} • Oleh ${UI.escapeHTML(t.pelapor || 'Orang Tua')}</div>
          </div>
          <span class="status-pill ${badgeColor}">${UI.escapeHTML(kualitas)}</span>
        </div>
      `;
    }).join('');
  },

  // --- SMART RANDOM TEST (PRD Section 12) ---
  async startRandomTest() {
    UI.showLoading(true, 'Menghasilkan tes retensi acak pintar...');
    try {
      const res = await API.request('ortu_get_random_test');
      UI.showLoading(false);

      if (res.success && res.test) {
        this.currentRandomTest = res.test;
        await this.openRandomTestModal(res.test);
      } else {
        UI.toast(res.message || 'Tidak ada kandidat hafalan untuk diuji', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Gagal memuat tes acak', 'error');
    }
  },

  async openRandomTestModal(test) {
    const modal = document.getElementById('modal-random-test');
    if (!modal) return;

    // Info Surah & Ayat
    const surahEl = document.getElementById('random-test-surah');
    if (surahEl) surahEl.textContent = test.surah;
    const ayatBadgeEl = document.getElementById('random-test-ayat-badge');
    if (ayatBadgeEl) ayatBadgeEl.textContent = `Ayat ke-${Number(test.targetAyat) || 1}`;

    // Status Retensi Saat Ini
    const statusEl = document.getElementById('random-test-status-pill');
    if (statusEl) {
      const status = String(test.retentionStatus || 'Hijau');
      statusEl.className = `status-pill status-${status === 'Merah' ? 'red' : (status === 'Kuning' ? 'yellow' : 'green')}`;
      statusEl.textContent = `Status: ${status}`;
    }

    const arabicEl = document.getElementById('random-test-arabic');
    const transEl = document.getElementById('random-test-trans');
    if (arabicEl) arabicEl.textContent = '⏳ Memuat teks ayat...';
    if (transEl) transEl.textContent = '';
    UI.openModal('modal-random-test');

    // Tampilkan modal dulu dengan status memuat, lalu isi teks, terjemahan, & audio
    // ayat asli: Mode Live -> backend (Cache_Ayat -> equran.id), Mode Demo -> bank lokal.
    const meta = QURAN_DATA.getSurahByName(test.surah);
    if (!meta) {
      if (arabicEl) arabicEl.textContent = '⚠️ Teks ayat tidak tersedia';
      if (transEl) transEl.textContent = `Surah "${test.surah}" tidak dikenali pada database surah lokal.`;
      const playBtn = document.getElementById('random-test-audio-btn');
      if (playBtn) playBtn.onclick = null;
      return;
    }

    const ayahInfo = await QURAN_DATA.getAyahLive(meta.number, test.targetAyat);
    const hasText = !!(ayahInfo && ayahInfo.arabic);

    if (arabicEl) {
      arabicEl.textContent = hasText ? ayahInfo.arabic : '⚠️ Teks ayat belum tersedia';
    }
    if (transEl) {
      // Terjemahan kini benar-benar ditampilkan (sebelumnya selalu dikosongkan).
      if (ayahInfo && ayahInfo.translation) {
        transEl.textContent = `"${ayahInfo.translation}"`;
      } else if (!hasText) {
        transEl.textContent = 'Bank teks demo belum memuat ayat ini — gunakan bantuan audio murattal atau Mushaf saat menguji Ananda.';
      } else {
        transEl.textContent = '';
      }
    }

    // Bind Audio Play Button
    const playBtn = document.getElementById('random-test-audio-btn');
    if (playBtn) {
      playBtn.onclick = () => UI.playAyahAudio(ayahInfo ? ayahInfo.audio : '', `${test.surah} Ayat ${Number(test.targetAyat) || 1}`);
    }
  },

  async submitTestEvaluation(kualitas) {
    // Anti klik-ganda: satu evaluasi hanya dikirim sekali sampai selesai.
    if (UI.busy['ortu-tes']) { UI.toast('Evaluasi sedang disimpan, mohon tunggu...', 'gold'); return; }
    UI.busy['ortu-tes'] = true;
    try { return await this._submitTestEvaluation(kualitas); }
    finally { UI.busy['ortu-tes'] = false; }
  },

  async _submitTestEvaluation(kualitas) {
    if (!this.currentRandomTest) return;

    UI.showLoading(true, `Menyimpan evaluasi "${kualitas}"...`);
    try {
      const res = await API.request('ortu_submit_test_result', {
        data: {
          idMaster: this.currentRandomTest.idMaster,
          surah: this.currentRandomTest.surah,
          targetAyat: this.currentRandomTest.targetAyat,
          kualitas: kualitas // Lancar, Tersendat, Lupa
        }
      });
      UI.showLoading(false);
      UI.closeModal('modal-random-test');
      UI.stopAudio();

      if (res.success) {
        if (kualitas === 'Lancar') UI.celebrate();
        UI.toast(res.message || 'Evaluasi berhasil disimpan!', kualitas === 'Lancar' ? 'gold' : 'success');
        this.load(); // Refresh dashboard
      } else {
        // Pesan spesifik per kode error (E_BUSY/E_TIMEOUT/E_AUTH/...).
        UI.toast(res.message || 'Gagal menyimpan evaluasi', 'error', res.uncertain ? 7000 : 4500);
        if (res.uncertain) this.load(); // status belum pasti -> sinkronkan tampilan
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error menyimpan evaluasi', 'error');
    }
  },

  // --- KIRIM SEMANGAT (APRESIASI 1-KLIK) ---
  openKirimSemangatModal() {
    UI.openModal('modal-kirim-semangat');
  },

  setPredefinedPesan(pesan) {
    const input = document.getElementById('input-pesan-semangat');
    if (input) input.value = pesan;
  },

  async sendSemangat() {
    if (UI.busy['ortu-semangat']) { UI.toast('Pesan sedang dikirim, mohon tunggu...', 'gold'); return; }
    UI.busy['ortu-semangat'] = true;
    try { return await this._sendSemangat(); }
    finally { UI.busy['ortu-semangat'] = false; }
  },

  async _sendSemangat() {
    const input = document.getElementById('input-pesan-semangat');
    const pesan = input ? input.value.trim() : '';

    if (!pesan) {
      UI.toast('Tulis pesan semangat terlebih dahulu', 'error');
      return;
    }

    UI.showLoading(true, 'Mengirim pesan semangat...');
    try {
      const res = await API.request('ortu_send_apresiasi', { data: { pesan } });
      UI.showLoading(false);
      UI.closeModal('modal-kirim-semangat');

      if (res.success) {
        UI.toast('Pesan cinta & semangat berhasil dikirim ke Ananda! ❤️', 'gold');
        if (input) input.value = '';
      } else {
        UI.toast(res.message || 'Gagal mengirim pesan', 'error', res.uncertain ? 7000 : 4500);
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error mengirim pesan', 'error');
    }
  }
};
