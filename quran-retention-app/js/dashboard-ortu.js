/**
 * ============================================================================
 * DASHBOARD ORANG TUA CONTROLLER
 * ============================================================================
 */

const DashboardOrtu = {
  data: null,
  currentRandomTest: null,

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

    // Gamifikasi Ringkasan
    const gamif = this.data.gamifikasi || { xp: 0, level: 1, currentStreak: 0 };
    document.getElementById('ortu-streak-val').textContent = `${gamif.currentStreak} Hari 🔥`;
    document.getElementById('ortu-xp-val').textContent = `${gamif.xp} XP (Level ${gamif.level})`;

    // 3. Daftar Unit Hafalan & Status Retensi
    this.renderHafalanUnits();

    // 4. Riwayat Tes Terakhir
    this.renderRecentTests();
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
      let statusClass = 'status-green';
      if (u.retentionStatus === 'Kuning') statusClass = 'status-yellow';
      if (u.retentionStatus === 'Merah') statusClass = 'status-red';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border-light);">
          <div>
            <div style="font-weight: 700; color: var(--emerald-950);">${u.surah}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Ayat ${u.ayatMulai} - ${u.ayatAkhir}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="status-pill ${statusClass}">
              <span class="status-dot dot-${u.retentionStatus === 'Merah' ? 'red' : (u.retentionStatus === 'Kuning' ? 'yellow' : 'green')}"></span>
              ${u.retentionStatus}
            </span>
          </div>
        </div>
      `;
    }).join('');
  },

  renderRecentTests() {
    const container = document.getElementById('ortu-recent-tests-list');
    if (!container) return;

    const tests = this.data.recentTests || [];
    if (tests.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1rem;">Belum ada riwayat tes evaluasi.</p>`;
      return;
    }

    container.innerHTML = tests.map(t => {
      let badgeColor = 'status-green';
      if (t.kualitas === 'Tersendat') badgeColor = 'status-yellow';
      if (t.kualitas === 'Lupa') badgeColor = 'status-red';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px dashed var(--border-light);">
          <div>
            <div style="font-weight: 600; font-size: 0.9rem;">${t.surah} (Ayat ${t.ayatMulai}${t.ayatAkhir !== t.ayatMulai ? '-' + t.ayatAkhir : ''})</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${t.tgl} • Oleh ${t.pelapor || 'Orang Tua'}</div>
          </div>
          <span class="status-pill ${badgeColor}">${t.kualitas}</span>
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
    document.getElementById('random-test-surah').textContent = test.surah;
    document.getElementById('random-test-ayat-badge').textContent = `Ayat ke-${test.targetAyat}`;
    
    // Status Retensi Saat Ini
    const statusEl = document.getElementById('random-test-status-pill');
    if (statusEl) {
      statusEl.className = `status-pill status-${test.retentionStatus === 'Merah' ? 'red' : (test.retentionStatus === 'Kuning' ? 'yellow' : 'green')}`;
      statusEl.textContent = `Status: ${test.retentionStatus}`;
    }

    // Tampilkan modal dulu dengan status memuat, lalu isi teks & audio ayat asli:
    // Mode Live -> backend (Cache_Ayat -> equran.id), Mode Demo -> bank sampel lokal.
    
    const arabicEl = document.getElementById('random-test-arabic');
    
    const transEl = document.getElementById('random-test-trans');
   if (arabicEl) arabicEl.textContent = '⏳ Memuat teks ayat...';
    if (transEl) transEl.textContent = '';
    UI.openModal('modal-random-test');

    const meta = QURAN_DATA.getSurahByName(test.surah);
    const ayahInfo = await QURAN_DATA.getAyahLive(meta ? meta.number : 78, test.targetAyat);

     if (arabicEl) arabicEl.textContent = ayahInfo.arabic || 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

    // Bind Audio Play Button
    const playBtn = document.getElementById('random-test-audio-btn');
    if (playBtn) {
      playBtn.onclick = () => UI.playAyahAudio(ayahInfo.audio, `${test.surah} Ayat ${test.targetAyat}`);
    }

      },

  async submitTestEvaluation(kualitas) {
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
        UI.toast(res.message || 'Gagal menyimpan evaluasi', 'error');
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
        UI.toast(res.message || 'Gagal mengirim pesan', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error mengirim pesan', 'error');
    }
  }
};
