/**
 * ============================================================================
 * DASHBOARD SANTRI CONTROLLER
 * ============================================================================
 */

const DashboardSantri = {
  data: null,
  currentFlashcardIndex: 0,
  flashcardPool: [],

  async load() {
    UI.showLoading(true, 'Memuat Misi & Hafalan Santri...');
    try {
      const res = await API.request('santri_get_dashboard');
      UI.showLoading(false);

      if (res.success) {
        this.data = res;
        this.render();
      } else {
        UI.toast(res.message || 'Gagal memuat dashboard santri', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error memuat data santri', 'error');
    }
  },

  render() {
    if (!this.data) return;

    // 1. User Header & Greeting
    const greetingEl = document.getElementById('santri-greeting');
    if (greetingEl) {
      greetingEl.textContent = `${UI.getIslamicGreeting()}, ${this.data.nama}`;
    }

    // 2. Gamifikasi: XP, Level & Streak
    this.renderGamification();

    // 3. Misi Harian: Sabaq, Sabqi, Manzil
    this.renderMissions();

    // 4. Badges & Heatmap
    this.renderBadges();
    this.renderHeatmap();

    // 5. Notifications / Feedback
    this.renderNotifications();

    // 6. Siapkan data Flashcard
    this.initFlashcards();
  },

  renderGamification() {
    const gamif = this.data.gamifikasi || { xp: 0, level: 1, currentStreak: 0 };
    
    // Streak
    const streakEl = document.getElementById('santri-streak-count');
    if (streakEl) streakEl.textContent = `${gamif.currentStreak} Hari`;

    // Level & XP
    const levelEl = document.getElementById('santri-level-val');
    if (levelEl) levelEl.textContent = `Level ${gamif.level}`;

    const xpEl = document.getElementById('santri-xp-val');
    if (xpEl) xpEl.textContent = `${gamif.xp} XP`;

    // Progress Bar XP (misal: 100 XP per level)
    const currentLevelBase = (gamif.level - 1) * APP_CONFIG.GAMIFICATION.LEVEL_XP_STEP;
    const nextLevelBase = gamif.level * APP_CONFIG.GAMIFICATION.LEVEL_XP_STEP;
    const progressPercent = Math.min(100, Math.max(0, ((gamif.xp - currentLevelBase) / APP_CONFIG.GAMIFICATION.LEVEL_XP_STEP) * 100));

    const progressFill = document.getElementById('santri-xp-progress-fill');
    if (progressFill) progressFill.style.width = `${progressPercent}%`;

    const nextXpEl = document.getElementById('santri-next-xp-val');
    if (nextXpEl) nextXpEl.textContent = `${nextLevelBase - gamif.xp} XP menuju Level ${gamif.level + 1}`;
  },

  renderMissions() {
    const container = document.getElementById('santri-missions-list');
    if (!container) return;

    const m = this.data.missions || {};
    let html = '';

    // Misi Sabaq (Hafalan Baru)
    if (m.sabaq) {
      html += this.createMissionCardHTML('Sabaq', m.sabaq, 'tag-sabaq', 'Hafalan Baru Hari Ini', m.sabaq.xp || 5);
    }

    // Misi Sabqi (Hafalan 1-30 Hari)
    if (m.sabqi && m.sabqi.length > 0) {
      m.sabqi.forEach(unit => {
        html += this.createMissionCardHTML('Sabqi', unit, 'tag-sabqi', 'Review 1–30 Hari', unit.xp || 8);
      });
    }

    // Misi Manzil (Hafalan Lama / Perlu Perhatian)
    if (m.manzil && m.manzil.length > 0) {
      m.manzil.forEach(unit => {
        html += this.createMissionCardHTML('Manzil', unit, 'tag-manzil', 'Review Hafalan Lama', unit.xp || 12);
      });
    }

    if (!html) {
      html = `
        <div class="card text-center" style="padding: 2rem;">
          <p>Belum ada target atau hafalan aktif. Hubungi Ustaz pembimbing untuk menetapkan hafalan baru.</p>
        </div>
      `;
    }

    container.innerHTML = html;
  },

  createMissionCardHTML(type, unit, tagClass, subtitle, xp) {
    const isCompleted = unit.completed;
    const statusColor = unit.retentionStatus === 'Merah' ? 'status-red' : (unit.retentionStatus === 'Kuning' ? 'status-yellow' : 'status-green');

    return `
      <div class="mission-card ${isCompleted ? 'completed' : ''}">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span class="mission-tag ${tagClass}">${type}</span>
            <span class="status-pill ${statusColor}" style="font-size: 0.7rem;">${unit.retentionStatus || 'Hijau'}</span>
            <span style="font-size: 0.75rem; color: var(--gold-600); font-weight: 700;">+${xp} XP</span>
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--emerald-950);">
            ${unit.surah} (Ayat ${unit.ayatMulai} - ${unit.ayatAkhir})
          </h4>
          <p style="font-size: 0.8rem; color: var(--text-muted);">${subtitle}</p>
        </div>
        <div>
          ${isCompleted ? `
            <span class="status-pill status-green" style="font-size: 0.8rem;">
              ✓ Selesai
            </span>
          ` : `
            <button class="btn btn-primary btn-sm" onclick="DashboardSantri.openMurojaahModal('${unit.idMaster}', '${type}', '${unit.surah}', ${unit.ayatMulai}, ${unit.ayatAkhir})">
              Murojaah
            </button>
          `}
        </div>
      </div>
    `;
  },

  openMurojaahModal(idMaster, jenisMisi, surah, ayatMulai, ayatAkhir) {
    const modal = document.getElementById('modal-murojaah-confirm');
    if (!modal) return;

    document.getElementById('murojaah-id-master').value = idMaster;
    document.getElementById('murojaah-jenis-misi').value = jenisMisi;
    document.getElementById('murojaah-surah-val').textContent = surah;
    document.getElementById('murojaah-ayat-val').textContent = `Ayat ${ayatMulai} - ${ayatAkhir}`;

    UI.openModal('modal-murojaah-confirm');
  },

  async submitMurojaahConfirmation(kualitas) {
    const idMaster = document.getElementById('murojaah-id-master').value;
    const jenisMisi = document.getElementById('murojaah-jenis-misi').value;
    const surah = document.getElementById('murojaah-surah-val').textContent;

    UI.showLoading(true, 'Menyimpan riwayat murojaah...');
    try {
      const res = await API.request('santri_confirm_murojaah', {
        data: {
          idMaster,
          jenisMisi,
          surah,
          kualitas // Lancar, Tersendat, Lupa
        }
      });
      UI.showLoading(false);
      UI.closeModal('modal-murojaah-confirm');

      if (res.success) {
        UI.celebrate();
        UI.toast(res.message || 'Murojaah berhasil dicatat!', 'success');
        this.load(); // Refresh data
      } else {
        UI.toast(res.message || 'Gagal menyimpan murojaah', 'error');
      }
    } catch (e) {
      UI.showLoading(false);
      UI.toast('Error menyimpan data', 'error');
    }
  },

  renderBadges() {
    const container = document.getElementById('santri-badges-list');
    if (!container) return;

    const badges = this.data.badges || [];
    if (badges.length === 0) {
      container.innerHTML = `<span style="font-size: 0.85rem; color: var(--text-muted);">Selesaikan murojaah konsisten untuk membuka badge!</span>`;
      return;
    }

    container.innerHTML = badges.map(b => `
      <div class="badge-item">
        <span>${b.nama}</span>
      </div>
    `).join('');
  },

  renderHeatmap() {
    const container = document.getElementById('santri-heatmap-grid');
    if (!container) return;

    const actMap = this.data.activityMap || {};
    let html = '';

    // Render 30 hari terakhir
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = actMap[dateStr] || 0;

      let levelClass = '';
      if (count === 1) levelClass = 'level-1';
      else if (count === 2) levelClass = 'level-2';
      else if (count >= 3) levelClass = 'level-3';

      html += `<div class="heatmap-cell ${levelClass}" title="${dateStr}: ${count} aktivitas murojaah"></div>`;
    }

    container.innerHTML = html;
  },

  renderNotifications() {
    const container = document.getElementById('santri-notifs-list');
    if (!container) return;

    const notifs = this.data.notifications || [];
    if (notifs.length === 0) {
      container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Belum ada notifikasi baru.</p>`;
      return;
    }

    container.innerHTML = notifs.map(n => `
      <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-light); display: flex; align-items: flex-start; gap: 0.75rem;">
        <span style="font-size: 1.25rem;">${n.tipe.includes('Ortu') ? '❤️' : (n.tipe.includes('Ustaz') ? '📖' : '🔔')}</span>
        <div>
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--emerald-800); text-transform: uppercase;">${n.tipe}</div>
          <div style="font-size: 0.85rem; color: var(--text-main);">${n.pesan}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem;">${n.tgl}</div>
        </div>
      </div>
    `).join('');
  },

  // --- FLASHCARD ENGINE ---
  initFlashcards() {
    this.flashcardPool = [
      {
        surah: "An-Naba'",
        targetAyah: 1,
        questionArabic: "عَمَّ يَتَسَآءَلُونَ",
        questionTranslation: "Tentang apakah mereka saling bertanya-tanya?",
        nextAyahArabic: "عَنِ ٱلنَّبَإِ ٱلْعَظِيمِ",
        nextAyahTranslation: "Tentang berita yang besar (hari berbangkit)",
        audioUrl: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078001.mp3",
        options: [
          "عَنِ ٱلنَّبَإِ ٱلْعَظِيمِ",
          "ٱلَّذِى هُمْ فِيهِ مُخْتَلِفُونَ",
          "كَلَّا سَيَعْلَمُونَ"
        ]
      },
      {
        surah: "An-Nazi'at",
        targetAyah: 1,
        questionArabic: "وَٱلنَّٰزِعَٰتِ غَرْقًا",
        questionTranslation: "Demi (malaikat) yang mencabut (nyawa) dengan keras,",
        nextAyahArabic: "وَٱلنَّٰشِطَٰتِ نَشْطًا",
        nextAyahTranslation: "demi (malaikat) yang mencabut (nyawa) dengan lemah lembut,",
        audioUrl: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/079001.mp3",
        options: [
          "وَٱلنَّٰشِطَٰتِ نَشْطًا",
          "وَٱلسَّٰبِحَٰتِ سَبْحًا",
          "فَٱلسَّٰبِقَٰتِ سَبْقًا"
        ]
      },
      {
        surah: "Al-Ikhlas",
        targetAyah: 1,
        questionArabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        questionTranslation: "Katakanlah (Muhammad), 'Dialah Allah, Yang Maha Esa.'",
        nextAyahArabic: "ٱللَّهُ ٱلصَّمَدُ",
        nextAyahTranslation: "Allah tempat meminta segala sesuatu.",
        audioUrl: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/112001.mp3",
        options: [
          "ٱللَّهُ ٱلصَّمَدُ",
          "لَمْ يَلِدْ وَلَمْ يُولَدْ",
          "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ"
        ]
      }
    ];

    this.currentFlashcardIndex = 0;
    this.renderCurrentFlashcard();
  },

  renderCurrentFlashcard() {
    const card = this.flashcardPool[this.currentFlashcardIndex];
    if (!card) return;

    const surahEl = document.getElementById('flashcard-surah-title');
    if (surahEl) surahEl.textContent = `${card.surah} (Ayat ${card.targetAyah})`;

    const qArabicEl = document.getElementById('flashcard-question-arabic');
    if (qArabicEl) qArabicEl.textContent = card.questionArabic;

    const qTransEl = document.getElementById('flashcard-question-trans');
    if (qTransEl) qTransEl.textContent = `"${card.questionTranslation}"`;

    // Reset flipped state
    const flashcardEl = document.getElementById('interactive-flashcard');
    if (flashcardEl) flashcardEl.classList.remove('flipped');

    // Render Pilihan Jawaban
    const optionsContainer = document.getElementById('flashcard-options-container');
    if (optionsContainer) {
      optionsContainer.innerHTML = card.options.map((opt, idx) => `
        <button class="btn btn-outline btn-full" style="justify-content: flex-start; text-align: right; padding: 0.85rem;" onclick="DashboardSantri.answerFlashcard('${opt.replace(/'/g, "\\'")}', '${card.nextAyahArabic.replace(/'/g, "\\'")}')">
          <span style="direction: rtl; font-family: var(--font-family-arabic); font-size: 1.25rem; width: 100%; color: var(--emerald-900);">
            ${opt}
          </span>
        </button>
      `).join('');
    }

    // Bind Audio Button
    const audioBtn = document.getElementById('flashcard-audio-btn');
    if (audioBtn) {
      audioBtn.onclick = () => UI.playAyahAudio(card.audioUrl, `${card.surah} Ayat ${card.targetAyah}`);
    }
  },

  async answerFlashcard(selected, correct) {
    const isCorrect = selected.trim() === correct.trim();

    if (isCorrect) {
      UI.celebrate();
      UI.toast('MasyaAllah! Tebakan Benar (+5 XP)', 'gold');
    } else {
      UI.toast('Belum tepat, ayo coba lagi! (+1 XP)', 'error');
    }

    // Submit ke backend
    await API.request('santri_submit_flashcard_test', {
      data: { isCorrect }
    });

    // Geser ke kartu berikutnya
    setTimeout(() => {
      this.currentFlashcardIndex = (this.currentFlashcardIndex + 1) % this.flashcardPool.length;
      this.renderCurrentFlashcard();
      this.load(); // Refresh gamifikasi
    }, 1200);
  },

  skipFlashcard() {
    this.currentFlashcardIndex = (this.currentFlashcardIndex + 1) % this.flashcardPool.length;
    this.renderCurrentFlashcard();
    UI.toast('Beralih ke ayat berikutnya', 'gold');
  }
};
