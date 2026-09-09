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

  render() {
    if (!this.data) return;

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

    // 4. Daftar Santri & Traffic Light Matrix
    this.renderSantriMatrix();

    // 5. Populate dropdown santri di form modal setoran & target
    this.populateModalSelects();
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
          <div style="font-weight: 700; color: #991b1b; font-size: 0.9rem;">⚠️ Perhatian: ${s.nama}</div>
          <div style="font-size: 0.8rem; color: #7f1d1d;">${s.flags.join(' • ')}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="DashboardUstaz.openFeedbackModal('${s.idSantri}', '${s.nama}')">
          Beri Arahan
        </button>
      </div>
    `).join('');
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

      return `
        <tr style="border-bottom: 1px solid var(--border-light);">
          <td style="padding: 1rem 0.75rem;">
            <div style="font-weight: 700; color: var(--text-main);">${s.nama}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Target: ${s.target ? `${s.target.surah} (${s.target.ayatMulai}-${s.target.ayatAkhir})` : '<em style="color:var(--gold-600)">Belum diatur</em>'}
            </div>
          </td>
          <td style="padding: 1rem 0.75rem;">
            <div style="display: flex; gap: 0.35rem;">
              <span class="status-pill status-green" style="padding: 0.15rem 0.45rem;">${ret.hijau}</span>
              <span class="status-pill status-yellow" style="padding: 0.15rem 0.45rem;">${ret.kuning}</span>
              <span class="status-pill status-red" style="padding: 0.15rem 0.45rem;">${ret.merah}</span>
            </div>
          </td>
          <td style="padding: 1rem 0.75rem;">
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--gold-700);">🔥 ${gamif.currentStreak} Hari</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${gamif.xp} XP (Lv ${gamif.level})</div>
          </td>
          <td style="padding: 1rem 0.75rem; text-align: right;">
            <div style="display: flex; justify-content: flex-end; gap: 0.4rem;">
              <button class="btn btn-primary btn-sm" onclick="DashboardUstaz.openSetoranModalFor('${s.idSantri}')">
                + Setor
              </button>
              <button class="btn btn-outline btn-sm" onclick="DashboardUstaz.openFeedbackModal('${s.idSantri}', '${s.nama}')">
                Feedback
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  populateModalSelects() {
    const list = this.data.santriList || [];
    
    // Select di Modal Setoran
    const setoranSelect = document.getElementById('input-setoran-santri');
    if (setoranSelect) {
      setoranSelect.innerHTML = list.map(s => `<option value="${s.idSantri}">${s.nama}</option>`).join('');
    }

    // Select di Modal Target
    const targetSelect = document.getElementById('input-target-santri');
    if (targetSelect) {
      targetSelect.innerHTML = list.map(s => `<option value="${s.idSantri}">${s.nama}</option>`).join('');
    }

    // Select Surah di modal
    const surahOptions = QURAN_DATA.surahs.map(s => `<option value="${s.name}">${s.number}. ${s.name} (${s.arabic}) - ${s.verses} Ayat</option>`).join('');
    const surahSetoran = document.getElementById('input-setoran-surah');
    if (surahSetoran) surahSetoran.innerHTML = surahOptions;
    const surahTarget = document.getElementById('input-target-surah');
    if (surahTarget) surahTarget.innerHTML = surahOptions;
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
        UI.toast(res.message || 'Gagal mencatat setoran', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error menyimpan setoran', 'error');
    }
  },

  // --- MODAL TARGET BULANAN ---
  openTargetModal() {
    UI.openModal('modal-atur-target');
  },

  async submitTarget() {
    const santriId = document.getElementById('input-target-santri').value;
    const surah = document.getElementById('input-target-surah').value;
    const ayatMulai = document.getElementById('input-target-mulai').value;
    const ayatAkhir = document.getElementById('input-target-akhir').value;

    UI.showLoading(true, 'Menyimpan target bulanan...');
    try {
      const res = await API.request('ustaz_save_target', {
        data: {
          idSantri: santriId,
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
        UI.toast(res.message || 'Gagal menyimpan target', 'error');
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
        UI.toast(res.message || 'Gagal mengirim feedback', 'error');
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
        UI.toast(res.message || 'Gagal menyiarkan pesan', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error broadcast', 'error');
    }
  }
};
