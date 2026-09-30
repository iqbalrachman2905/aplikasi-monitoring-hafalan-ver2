/**
 * ============================================================================
 * DASHBOARD USTAZ CONTROLLER
 * ============================================================================
 */

const DashboardUstaz = {
  data: null,
  selectedSantriId: null,

  async load() {
    UI.showLoading(true, 'Memuat Data Kelompok Bimbingan Ustaz...');
    try {
      const res = await API.request('ustaz_get_dashboard');
      UI.showLoading(false);

      if (res.success) {
        this.data = res;
        this.render();
      } else {
        UI.toast(res.message || 'Gagal memuat dashboard Ustaz', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error memuat data Ustaz', 'error');
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

  /**
   * Delegasi klik untuk tombol aksi di matriks & banner auto-flag
   * (menggantikan inline onclick yang rentan bocor string/XSS).
   */
  bindDelegatedEvents() {
    const view = document.getElementById('view-ustaz');
    if (!view || view.dataset.bound === 'true') return;
    view.dataset.bound = 'true';
    view.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ustaz-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.getAttribute('data-ustaz-action');
      const santriId = btn.getAttribute('data-id-santri') || '';
      if (action === 'feedback') {
        this.openFeedbackModal(santriId, btn.getAttribute('data-nama') || 'Santri');
      } else if (action === 'setoran') {
        this.openSetoranModalFor(santriId);
      } else if (action === 'target') {
        this.openTargetModalFor(santriId);
      }
    });
  },

  render() {
    if (!this.data) return;

    this.bindDelegatedEvents();

    // 1. Header Ustaz
    const greetingEl = document.getElementById('ustaz-greeting');
    if (greetingEl) {
      greetingEl.textContent = `${UI.getIslamicGreeting()}, ${this.data.ustazName}`;
    }

    // 2. Summary Group Statistics
    const st = this.data.stats || { totalSantri: 0, totalMerah: 0, totalKuning: 0, totalHijau: 0, flaggedSantri: 0 };
    document.getElementById('ustaz-stat-santri').textContent = st.totalSantri;
    document.getElementById('ustaz-stat-hijau').textContent = st.totalHijau;
    document.getElementById('ustaz-stat-kuning').textContent = st.totalKuning;
    document.getElementById('ustaz-stat-merah').textContent = st.totalMerah;

    // 3. Auto-Flag Alert Banner
    this.renderAutoFlags();

    // 3b. Notifikasi Target Bulanan (tercapai / mendesak / terlewat)
    this.renderTargetNotifications();

    // 4. Peta Potensi & Papan Peringkat (motivasi kelompok)
    this.renderPotentialMap();

    // 5. Daftar Santri & Traffic Light Matrix
    this.renderSantriMatrix();

    // 6. Populate dropdown santri di form modal setoran & target
    this.populateModalSelects();

    // 7. Pantau perubahan pilihan santri di modal target
    this.bindTargetModal();
  },

  /**
   * Skor potensi (0-100): kombinasi kesehatan hafalan, konsistensi harian,
   * dan capaian XP. Dipakai untuk memetakan santri yang siap naik level.
   */
  skorPotensi(s) {
    const ret = (s && s.retention) || { hijau: 0, kuning: 0, merah: 0, total: 0 };
    const total = (ret.hijau || 0) + (ret.kuning || 0) + (ret.merah || 0);
    const skorHafalan = total > 0
      ? ((ret.hijau || 0) * 100 + (ret.kuning || 0) * 60 + (ret.merah || 0) * 20) / total
      : 0;
    const gamif = (s && s.gamifikasi) || {};
    const streak = this.streakOf(gamif);
    const skorStreak = Math.min(100, streak * 12);
    const skorXp = Math.min(100, (Number(gamif.xp) || 0) / 5);
    return Math.round(skorHafalan * 0.6 + skorStreak * 0.25 + skorXp * 0.15);
  },

  renderPotentialMap() {
    const container = document.getElementById('ustaz-potensi-container');
    if (!container) return;

    const list = (this.data && this.data.santriList) || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:1rem;">Belum ada santri bimbingan.</p>`;
      return;
    }

    const ranked = list
      .map(s => Object.assign({}, s, { potensi: this.skorPotensi(s) }))
      .sort((a, b) => b.potensi - a.potensi);

    const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const label = (v) => appCompetencyLabel(v);

    const rows = ranked.map((s, i) => {
      const lb = label(s.potensi);
      return `
        <div class="potensi-row">
          <div class="potensi-rank">${medal(i)}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; color:var(--emerald-950); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${UI.escapeHTML(s.nama)}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">🔥 ${this.streakOf(s.gamifikasi)} hari • ${Number((s.gamifikasi || {}).xp) || 0} XP</div>
            <div class="competency-bar" style="margin-top:0.3rem;"><div class="competency-bar-fill tone-${lb.tone}" style="width:${Math.max(4, s.potensi)}%"></div></div>
          </div>
          <div style="text-align:right;">
            <div class="competency-score-sm tone-${lb.tone}">${s.potensi}</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">${lb.label}</div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = rows;
  },

  renderAutoFlags() {
    const container = document.getElementById('ustaz-autoflag-container');
    if (!container) return;

    const flagged = (this.data.santriList || []).filter(s => s.flags && s.flags.length > 0);
    if (flagged.length === 0) {
      container.innerHTML = `
        <div style="background: var(--emerald-50); border: 1px solid var(--emerald-200); border-radius: var(--radius-md); padding: 0.85rem 1rem; display: flex; align-items: center; gap: 0.75rem; color: var(--emerald-800); font-size: 0.875rem;">
          <span>✅</span>
          <span><strong>Alhamdulillah:</strong> Seluruh santri dalam kondisi retensi aman, tidak ada auto-flag yang memerlukan tindakan mendesak.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = flagged.map(s => `
      <div style="background: var(--status-red-bg); border-left: 4px solid var(--status-red); border-radius: var(--radius-md); padding: 0.85rem 1rem; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-weight: 700; color: #991b1b; font-size: 0.9rem;">⚠️ Perhatian: ${UI.escapeHTML(s.nama)}</div>
          <div style="font-size: 0.8rem; color: #7f1d1d;">${UI.escapeHTML((s.flags || []).join(' • '))}</div>
        </div>
        <button class="btn btn-danger btn-sm" type="button"
          data-ustaz-action="feedback"
          data-id-santri="${UI.escapeHTML(s.idSantri)}"
          data-nama="${UI.escapeHTML(s.nama)}">
          Beri Arahan
        </button>
      </div>
    `).join('');
  },

  /**
   * Hitung status capaian target bulanan seorang santri.
   * @returns {{key:string,label:string,tone:string,percent:number,sisaHari:number|null}|null}
   */
  targetStatus(s) {
    const t = s && s.target;
    if (!t) return null;
    const p = s.targetProgress || { percent: 0, covered: 0, total: 0 };
    const percent = Number(p.percent) || 0;
    if (percent >= 100) return { key: 'tercapai', label: '✅ Tercapai', tone: 'green', percent: percent, sisaHari: null };

    // Sisa hari menuju akhir bulan target (batas hari lokal).
    const bulan = String(t.bulan || appTodayStr().slice(0, 7));
    const parts = bulan.split('-').map(Number);
    let sisaHari = null;
    if (parts.length === 2 && parts[0] && parts[1]) {
      const akhirBulan = new Date(parts[0], parts[1], 0);
      const now = new Date(appTodayStr() + 'T00:00:00');
      sisaHari = Math.ceil((akhirBulan.getTime() - now.getTime()) / 86400000);
    }
    if (sisaHari !== null && sisaHari < 0) return { key: 'terlewat', label: '⏰ Terlewat', tone: 'red', percent: percent, sisaHari: sisaHari };
    if (sisaHari !== null && sisaHari <= 7) return { key: 'mendesak', label: `⚠️ Mendesak (${sisaHari} hari)`, tone: 'yellow', percent: percent, sisaHari: sisaHari };
    return { key: 'berjalan', label: '🕒 Berjalan', tone: 'green', percent: percent, sisaHari: sisaHari };
  },

  renderTargetNotifications() {
    const container = document.getElementById('ustaz-target-notif-container');
    if (!container) return;

    const list = (this.data && this.data.santriList) || [];
    const rows = list
      .map(s => ({ s: s, st: this.targetStatus(s) }))
      .filter(x => x.st);

    if (rows.length === 0) {
      container.innerHTML = `
        <div style="background: var(--bg-card-subtle); border: 1px dashed var(--border-light); border-radius: var(--radius-md); padding: 0.85rem 1rem; font-size: 0.85rem; color: var(--text-muted);">
          ℹ️ Belum ada target bulanan yang diatur. Gunakan tombol <strong>🎯 Target</strong> pada baris santri untuk menetapkan target.
        </div>`;
      return;
    }

    // Urutkan: terlewat > mendesak > berjalan > tercapai
    const order = { terlewat: 0, mendesak: 1, berjalan: 2, tercapai: 3 };
    rows.sort((a, b) => (order[a.st.key] - order[b.st.key]) || (a.st.percent - b.st.percent));

    const pillClass = (tone) => tone === 'red' ? 'status-red' : (tone === 'yellow' ? 'status-yellow' : 'status-green');

    container.innerHTML = rows.map(x => {
      const s = x.s, st = x.st;
      const t = s.target;
      const targetText = `${UI.escapeHTML(t.surah)} ayat ${Number(t.ayatMulai) || 0}-${Number(t.ayatAkhir) || 0}`;
      const p = s.targetProgress || { covered: 0, total: 0, percent: 0 };
      return `
        <div class="potensi-row">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
              <span style="font-weight:700; color:var(--emerald-950);">${UI.escapeHTML(s.nama)}</span>
              <span class="status-pill ${pillClass(st.tone)}" style="font-size:0.65rem;">${st.label}</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.15rem;">🎯 ${targetText}</div>
            <div class="competency-bar" style="margin-top:0.35rem;"><div class="competency-bar-fill tone-${st.tone}" style="width:${Math.max(4, st.percent)}%"></div></div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.15rem;">${p.covered}/${p.total} ayat tercapai (${st.percent}%)</div>
          </div>
        </div>`;
    }).join('');
  },

  renderSantriMatrix() {
    const container = document.getElementById('ustaz-santri-table-body');
    if (!container) return;

    const list = this.data.santriList || [];
    if (list.length === 0) {
      container.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Belum ada santri terdaftar.</td></tr>`;
      return;
    }

    container.innerHTML = list.map(s => {
      const ret = s.retention || { hijau: 0, kuning: 0, merah: 0 };
      const gamif = s.gamifikasi || { xp: 0, level: 1, currentStreak: 0 };
      const targetText = s.target
        ? `${UI.escapeHTML(s.target.surah)} (${Number(s.target.ayatMulai) || 0}-${Number(s.target.ayatAkhir) || 0})`
        : '<em style="color:var(--gold-600)">Belum diatur</em>';
      const lastText = s.lastUnit
        ? `${UI.escapeHTML(s.lastUnit.surah)} s.d. ayat ${Number(s.lastUnit.ayatAkhir) || 0}`
        : '<em style="color:var(--text-muted)">Belum ada setoran</em>';

      return `
        <tr style="border-bottom: 1px solid var(--border-light);">
          <td style="padding: 1rem 0.75rem;">
            <div style="font-weight: 700; color: var(--text-main);">${UI.escapeHTML(s.nama)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Target: ${targetText}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">
              🕮 Terakhir: ${lastText}
            </div>
          </td>
          <td style="padding: 1rem 0.75rem;">
            <div style="display: flex; gap: 0.35rem;">
              <span class="status-pill status-green" style="padding: 0.15rem 0.45rem;">${Number(ret.hijau) || 0}</span>
              <span class="status-pill status-yellow" style="padding: 0.15rem 0.45rem;">${Number(ret.kuning) || 0}</span>
              <span class="status-pill status-red" style="padding: 0.15rem 0.45rem;">${Number(ret.merah) || 0}</span>
            </div>
          </td>
          <td style="padding: 1rem 0.75rem;">
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--gold-700);">🔥 ${this.streakOf(gamif)} Hari</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${Number(gamif.xp) || 0} XP (Lv ${Number(gamif.level) || 1})</div>
          </td>
          <td style="padding: 1rem 0.75rem; text-align: right;">
            <div style="display: flex; justify-content: flex-end; gap: 0.4rem;">
              <button class="btn btn-primary btn-sm" type="button"
                data-ustaz-action="setoran"
                data-id-santri="${UI.escapeHTML(s.idSantri)}">
                + Setor
              </button>
              <button class="btn btn-outline btn-sm" type="button"
                data-ustaz-action="target"
                data-id-santri="${UI.escapeHTML(s.idSantri)}">
                🎯 Target
              </button>
              <button class="btn btn-outline btn-sm" type="button"
                data-ustaz-action="feedback"
                data-id-santri="${UI.escapeHTML(s.idSantri)}"
                data-nama="${UI.escapeHTML(s.nama)}">
                Feedback
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  /** Jumlah ayat 1 surah (0 bila tidak dikenali). */
  surahVerses(surahName) {
    if (typeof QURAN_DATA === 'undefined' || !QURAN_DATA.getSurahByName) return 0;
    const meta = QURAN_DATA.getSurahByName(surahName);
    return meta ? (Number(meta.verses) || 0) : 0;
  },

  /**
   * Selaraskan ayat mulai/akhir dengan jumlah ayat surah terpilih.
   * Ayat akhir TIDAK boleh melebihi jumlah ayat surah (ayat terakhir).
   * @param {string} prefix 'setoran' | 'target'
   */
  syncSurahLimits(prefix) {
    const surahEl = document.getElementById('input-' + prefix + '-surah');
    if (!surahEl) return;
    const mulaiEl = document.getElementById('input-' + prefix + '-mulai');
    const akhirEl = document.getElementById('input-' + prefix + '-akhir');
    const hintEl = document.getElementById(prefix + '-surah-hint');

    const verses = this.surahVerses(surahEl.value);
    const meta = (typeof QURAN_DATA !== 'undefined' && QURAN_DATA.getSurahByName)
      ? QURAN_DATA.getSurahByName(surahEl.value) : null;

    if (verses > 0) {
      if (mulaiEl) mulaiEl.setAttribute('max', String(verses));
      if (akhirEl) akhirEl.setAttribute('max', String(verses));

      let mulai = Number(mulaiEl && mulaiEl.value) || 1;
      let akhir = Number(akhirEl && akhirEl.value) || verses;
      if (mulai < 1) mulai = 1;
      if (mulai > verses) mulai = verses;
      if (akhir > verses) akhir = verses;
      if (akhir < mulai) akhir = Math.max(mulai, Math.min(verses, akhir));
      if (mulaiEl) mulaiEl.value = mulai;
      if (akhirEl) akhirEl.value = akhir;
      if (hintEl) {
        hintEl.innerHTML = `Surah ${UI.escapeHTML(meta ? meta.name : surahEl.value)} memiliki <strong>${verses} ayat</strong> — ayat akhir maksimal ${verses}.`;
      }
    } else if (hintEl) {
      hintEl.innerHTML = 'Jumlah ayat surah tidak dikenali; pastikan ayat akhir masih di dalam rentang surah.';
    }
  },

  /** Pasang listener sekali agar batas ayat ikut berubah saat surah diganti. */
  bindSurahLimit(prefix) {
    const surahEl = document.getElementById('input-' + prefix + '-surah');
    if (surahEl && surahEl.dataset.limitBound !== 'true') {
      surahEl.dataset.limitBound = 'true';
      surahEl.addEventListener('change', () => this.syncSurahLimits(prefix));
    }
    const akhirEl = document.getElementById('input-' + prefix + '-akhir');
    if (akhirEl && akhirEl.dataset.limitBound !== 'true') {
      akhirEl.dataset.limitBound = 'true';
      akhirEl.addEventListener('change', () => this.syncSurahLimits(prefix));
    }
    const mulaiEl = document.getElementById('input-' + prefix + '-mulai');
    if (mulaiEl && mulaiEl.dataset.limitBound !== 'true') {
      mulaiEl.dataset.limitBound = 'true';
      mulaiEl.addEventListener('change', () => this.syncSurahLimits(prefix));
    }
  },

  /**
   * Validasi rentang ayat terhadap jumlah ayat surah.
   * @returns {string|null} pesan error, atau null bila valid.
   */
  validateAyahRange(surah, ayatMulai, ayatAkhir) {
    const verses = this.surahVerses(surah);
    const mulai = Number(ayatMulai);
    const akhir = Number(ayatAkhir);
    if (!mulai || !akhir || mulai < 1 || akhir < 1) return 'Ayat mulai & ayat akhir harus angka positif.';
    if (akhir < mulai) return 'Ayat akhir tidak boleh lebih kecil dari ayat mulai.';
    if (verses > 0 && mulai > verses) return `Ayat mulai melebihi jumlah ayat surah ${surah} (${verses} ayat).`;
    if (verses > 0 && akhir > verses) return `Ayat akhir melebihi jumlah ayat surah ${surah} (${verses} ayat). Sesuaikan dengan ayat terakhir surah.`;
    return null;
  },

  populateModalSelects() {
    const list = this.data.santriList || [];
    
    // Select di Modal Setoran
    const santriOptions = list.map(s => `<option value="${UI.escapeHTML(s.idSantri)}">${UI.escapeHTML(s.nama)}</option>`).join('');

    const setoranSelect = document.getElementById('input-setoran-santri');
    if (setoranSelect) setoranSelect.innerHTML = santriOptions;

    // Select di Modal Target
    const targetSelect = document.getElementById('input-target-santri');
    if (targetSelect) targetSelect.innerHTML = santriOptions;

    // Select Surah di modal
    const surahOptions = QURAN_DATA.surahs.map(s => `<option value="${UI.escapeHTML(s.name)}">${s.number}. ${UI.escapeHTML(s.name)} (${UI.escapeHTML(s.arabic)}) - ${s.verses} Ayat</option>`).join('');
    const surahSetoran = document.getElementById('input-setoran-surah');
    if (surahSetoran) surahSetoran.innerHTML = surahOptions;
    const surahTarget = document.getElementById('input-target-surah');
    if (surahTarget) surahTarget.innerHTML = surahOptions;

    // Jaga agar ayat akhir tidak melebihi jumlah ayat surah terpilih.
    this.bindSurahLimit('setoran');
    this.bindSurahLimit('target');
    this.syncSurahLimits('setoran');
    this.syncSurahLimits('target');
  },

  // --- MODAL SETORAN HAFALAN BARU ---
  openSetoranModal() {
    UI.openModal('modal-input-setoran');
  },

  openSetoranModalFor(santriId) {
    const select = document.getElementById('input-setoran-santri');
    if (select) select.value = santriId;
    UI.openModal('modal-input-setoran');
  },

  async submitSetoran() {
    // Anti klik-ganda: setoran ganda = XP & baris antrean dobel.
    if (UI.busy['ustaz-setoran']) { UI.toast('Setoran sedang disimpan, mohon tunggu...', 'gold'); return; }
    UI.busy['ustaz-setoran'] = true;
    try { return await this._submitSetoran(); }
    finally { UI.busy['ustaz-setoran'] = false; }
  },

  async _submitSetoran() {
    const santriId = document.getElementById('input-setoran-santri').value;
    const surah = document.getElementById('input-setoran-surah').value;
    const ayatMulai = document.getElementById('input-setoran-mulai').value;
    const ayatAkhir = document.getElementById('input-setoran-akhir').value;
    const nilai = document.getElementById('input-setoran-nilai').value;
    const catatan = document.getElementById('input-setoran-catatan').value;

    if (!santriId || !surah || !ayatMulai || !ayatAkhir) {
      UI.toast('Lengkapi data santri, surah, dan rentang ayat', 'error');
      return;
    }

    const setoranRangeErr = this.validateAyahRange(surah, ayatMulai, ayatAkhir);
    if (setoranRangeErr) {
      UI.toast(setoranRangeErr, 'error');
      this.syncSurahLimits('setoran');
      return;
    }

    UI.showLoading(true, 'Menyimpan evaluasi setoran...');
    try {
      const res = await API.request('ustaz_add_setoran', {
        data: {
          idSantri: santriId,
          surah: surah,
          ayatMulai: Number(ayatMulai),
          ayatAkhir: Number(ayatAkhir),
          nilai: nilai,
          catatan: catatan
        }
      });
      UI.showLoading(false);
      UI.closeModal('modal-input-setoran');

      if (res.success) {
        UI.celebrate();
        UI.toast('Setoran santri berhasil dicatat dan masuk ke antrean Misi Sabaq!', 'gold');
        this.load();
      } else {
        UI.toast(res.message || 'Gagal mencatat setoran', 'error', res.uncertain ? 7000 : 4500);
        if (res.uncertain) this.load();
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error menyimpan setoran', 'error');
    }
  },

  // --- MODAL TARGET BULANAN ---
  openTargetModal() {
    this.openTargetModalFor(null);
  },

  /**
   * Buka modal target dengan santri terpilih (dari tombol baris matriks).
   */
  openTargetModalFor(santriId) {
    // populateModalSelects() membangun ulang opsi select, jadi pilihan santri
    // harus di-set SESUDAHNYA agar tidak ikut ter-reset.
    this.populateModalSelects();
    const select = document.getElementById('input-target-santri');
    if (santriId && select) select.value = santriId;
    const bulanEl = document.getElementById('input-target-bulan');
    if (bulanEl && !bulanEl.value) bulanEl.value = appTodayStr().slice(0, 7);
    this.updateTargetPreview();
    UI.openModal('modal-atur-target');
  },

  /**
   * Dengarkan perubahan santri/bulan di modal target agar Ustaz langsung
   * melihat target berjalan & bisa mengusulkan target lanjutan secara 1-klik.
   */
  bindTargetModal() {
    const select = document.getElementById('input-target-santri');
    if (select && select.dataset.bound !== 'true') {
      select.dataset.bound = 'true';
      select.addEventListener('change', () => this.updateTargetPreview());
    }
    const bulan = document.getElementById('input-target-bulan');
    if (bulan && bulan.dataset.bound !== 'true') {
      bulan.dataset.bound = 'true';
      bulan.addEventListener('change', () => this.updateTargetPreview());
    }
  },

  /**
   * Tampilkan target aktif santri terpilih + petunjuk lanjutan.
   */
  updateTargetPreview() {
    const info = document.getElementById('target-current-info');
    if (!info) return;
    const select = document.getElementById('input-target-santri');
    const id = select ? select.value : '';
    const s = ((this.data && this.data.santriList) || []).find(x => x.idSantri === id);
    if (!s) { info.innerHTML = ''; return; }

    const t = s.target;
    const targetText = t
      ? `${UI.escapeHTML(t.surah)} (ayat ${Number(t.ayatMulai) || 0}-${Number(t.ayatAkhir) || 0})`
      : 'Belum ada target bulan ini';
    const last = s.lastUnit
      ? `${UI.escapeHTML(s.lastUnit.surah)} (sampai ayat ${Number(s.lastUnit.ayatAkhir) || 0})`
      : 'Belum ada setoran';

    info.innerHTML = `
      <div style="font-size:0.8rem; color:var(--text-muted);">🎯 Target berjalan: <strong style="color:var(--emerald-900)">${targetText}</strong></div>
      <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">📖 Hafalan terakhir: <strong style="color:var(--emerald-900)">${last}</strong></div>`;
  },

  /**
   * Usulkan target lanjutan otomatis dari hafalan terakhir santri:
   * lanjutkan surah yang sama; bila surah sudah tamat, pindah ke surah berikutnya.
   */
  suggestTargetFor(santriId) {
    const id = santriId || (document.getElementById('input-target-santri') || {}).value;
    const s = ((this.data && this.data.santriList) || []).find(x => x.idSantri === id);
    if (!s || !s.lastUnit) {
      UI.toast('Santri ini belum punya setoran, target belum bisa diusulkan otomatis.', 'error');
      return;
    }

    const last = s.lastUnit;
    const meta = QURAN_DATA.getSurahByName(last.surah);
    if (!meta) {
      UI.toast('Surah hafalan terakhir tidak dikenali.', 'error');
      return;
    }

    let surahName = meta.name;
    let mulai = (Number(last.ayatAkhir) || 0) + 1;
    let akhir = Math.min(mulai + 19, meta.verses);

    // Surah tamat -> lanjut surah berikutnya (mulai dari ayat 1).
    if (mulai > meta.verses) {
      const next = QURAN_DATA.getSurahByNumber(meta.number + 1);
      if (!next) {
        UI.toast('Semua surah sudah tamat, masyaAllah! Isi target secara manual.', 'gold');
        return;
      }
      surahName = next.name;
      mulai = 1;
      akhir = Math.min(20, next.verses);
    }

    const surahSelect = document.getElementById('input-target-surah');
    if (surahSelect) surahSelect.value = surahName;
    const mulaiEl = document.getElementById('input-target-mulai');
    if (mulaiEl) mulaiEl.value = mulai;
    const akhirEl = document.getElementById('input-target-akhir');
    if (akhirEl) akhirEl.value = akhir;
    UI.toast(`Usulan target: ${surahName} ayat ${mulai}-${akhir}`, 'gold');
  },

  async submitTarget() {
    if (UI.busy['ustaz-target']) { UI.toast('Target sedang disimpan, mohon tunggu...', 'gold'); return; }
    UI.busy['ustaz-target'] = true;
    try { return await this._submitTarget(); }
    finally { UI.busy['ustaz-target'] = false; }
  },

  async _submitTarget() {
    const santriId = document.getElementById('input-target-santri').value;
    const surah = document.getElementById('input-target-surah').value;
    const ayatMulai = document.getElementById('input-target-mulai').value;
    const ayatAkhir = document.getElementById('input-target-akhir').value;

    const targetRangeErr = this.validateAyahRange(surah, ayatMulai, ayatAkhir);
    if (targetRangeErr) {
      UI.toast(targetRangeErr, 'error');
      this.syncSurahLimits('target');
      return;
    }

    const bulanEl = document.getElementById('input-target-bulan');
    const bulan = bulanEl && bulanEl.value ? bulanEl.value : appTodayStr().slice(0, 7);

    UI.showLoading(true, 'Menyimpan target bulanan...');
    try {
      const res = await API.request('ustaz_save_target', {
        data: {
          idSantri: santriId,
          bulan: bulan,
          surah: surah,
          ayatMulai: Number(ayatMulai),
          ayatAkhir: Number(ayatAkhir)
        }
      });
      UI.showLoading(false);
      UI.closeModal('modal-atur-target');

      if (res.success) {
        UI.toast('Target bulanan berhasil diperbarui!', 'success');
        this.load();
      } else {
        UI.toast(res.message || 'Gagal menyimpan target', 'error', res.uncertain ? 7000 : 4500);
        if (res.uncertain) this.load();
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error menyimpan target', 'error');
    }
  },

  // --- MODAL FEEDBACK ---
  openFeedbackModal(santriId, santriName) {
    this.selectedSantriId = santriId;
    document.getElementById('feedback-santri-name').textContent = santriName;
    document.getElementById('input-feedback-pesan').value = '';
    UI.openModal('modal-kirim-feedback');
  },

  async submitFeedback() {
    if (UI.busy['ustaz-feedback']) { UI.toast('Feedback sedang dikirim, mohon tunggu...', 'gold'); return; }
    UI.busy['ustaz-feedback'] = true;
    try { return await this._submitFeedback(); }
    finally { UI.busy['ustaz-feedback'] = false; }
  },

  async _submitFeedback() {
    const pesan = document.getElementById('input-feedback-pesan').value.trim();
    if (!pesan) {
      UI.toast('Tulis pesan arahan terlebih dahulu', 'error');
      return;
    }

    UI.showLoading(true, 'Mengirim feedback...');
    try {
      const res = await API.request('ustaz_send_feedback', {
        data: {
          idSantri: this.selectedSantriId,
          pesan: pesan
        }
      });
      UI.showLoading(false);
      UI.closeModal('modal-kirim-feedback');

      if (res.success) {
        UI.toast('Feedback berhasil terkirim ke dashboard santri!', 'success');
      } else {
        UI.toast(res.message || 'Gagal mengirim feedback', 'error', res.uncertain ? 7000 : 4500);
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error mengirim feedback', 'error');
    }
  },

  // --- MODAL BROADCAST MOTIVASI ---
  openBroadcastModal() {
    document.getElementById('input-broadcast-pesan').value = '';
    UI.openModal('modal-broadcast');
  },

  async submitBroadcast() {
    if (UI.busy['ustaz-broadcast']) { UI.toast('Broadcast sedang dikirim, mohon tunggu...', 'gold'); return; }
    UI.busy['ustaz-broadcast'] = true;
    try { return await this._submitBroadcast(); }
    finally { UI.busy['ustaz-broadcast'] = false; }
  },

  async _submitBroadcast() {
    const pesan = document.getElementById('input-broadcast-pesan').value.trim();
    if (!pesan) {
      UI.toast('Tulis pesan motivasi', 'error');
      return;
    }

    UI.showLoading(true, 'Menyiarkan pesan motivasi ke seluruh santri...');
    try {
      const res = await API.request('ustaz_send_broadcast', { data: { pesan } });
      UI.showLoading(false);
      UI.closeModal('modal-broadcast');

      if (res.success) {
        UI.toast('Pesan motivasi berhasil disiarkan!', 'gold');
      } else {
        UI.toast(res.message || 'Gagal menyiarkan pesan', 'error', res.uncertain ? 7000 : 4500);
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error broadcast', 'error');
    }
  }
};
