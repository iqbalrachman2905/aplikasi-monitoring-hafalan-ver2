/**
 * ============================================================================
 * DASHBOARD SANTRI CONTROLLER
 * ============================================================================
 */

const DashboardSantri = {
  data: null,
  currentFlashcardIndex: 0,
  flashcardPool: [],
  flashcardLocked: false,

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

    // 3b. Papan progres ramah anak (berapa misi selesai hari ini)
    this.renderDailyProgress();
    this.renderKidFriendly();

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
    if (nextXpEl) nextXpEl.textContent = `${Math.max(0, nextLevelBase - gamif.xp)} XP menuju Level ${gamif.level + 1}`;
  },

  /**
   * Papan Progres Hari Ini: "X dari Y misi selesai".
   * Memakai data yang sama dengan renderMissions agar tidak pernah berbeda.
   */
  renderDailyProgress() {
    const m = (this.data && this.data.missions) || {};
    const sabaq = Array.isArray(m.sabaq) ? m.sabaq : (m.sabaq ? [m.sabaq] : []);
    const all = sabaq.concat(m.sabqi || [], m.manzil || []);
    const total = all.length;
    const done = all.filter(u => u && u.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const textEl = document.getElementById('santri-daily-progress-text');
    if (textEl) textEl.textContent = total > 0 ? `${done} dari ${total} misi selesai` : 'Belum ada misi hari ini';

    const fillEl = document.getElementById('santri-daily-progress-fill');
    if (fillEl) fillEl.style.width = `${pct}%`;

    const pctEl = document.getElementById('santri-daily-progress-pct');
    if (pctEl) pctEl.textContent = `${pct}%`;

    // Bintang penghargaan: penuh 3 bintang bila semua misi selesai.
    const starsEl = document.getElementById('santri-daily-stars');
    if (starsEl) {
      const earned = total === 0 ? 0 : (pct >= 100 ? 3 : (pct >= 60 ? 2 : (pct > 0 ? 1 : 0)));
      starsEl.textContent = '⭐'.repeat(earned) + '☆'.repeat(3 - earned);
    }
  },

  /**
   * Teks ramah anak: sapaan & judul hero menyesuaikan Mode Anak.
   */
  renderKidFriendly() {
    const kid = document.body.classList.contains('kid-mode');
    const titleEl = document.getElementById('santri-hero-title');
    if (titleEl) {
      titleEl.textContent = kid ? 'Ayo Semangat Hafalan! 🌟' : 'Mari Jaga Hafalan Hari Ini';
    }
    const glowEl = document.getElementById('santri-kid-mascot');
    if (glowEl) glowEl.classList.toggle('hidden', !kid);
  },

  /**
   * Delegasi klik untuk tombol Murojaah (menggantikan inline onclick)
   * sehingga nama surah ber-apostrof (An-Naba', An-Nazi'at, ...) tetap aman.
   */
  bindMissionEvents() {
    const container = document.getElementById('santri-missions-list');
    if (!container || container.dataset.bound === 'true') return;
    container.dataset.bound = 'true';
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-murojaah]');
      if (!btn) return;
      e.preventDefault();
      this.openMurojaahModal(
        btn.getAttribute('data-id-master') || '',
        btn.getAttribute('data-jenis') || 'Sabaq',
        btn.getAttribute('data-surah') || '',
        Number(btn.getAttribute('data-ayat-mulai')) || 1,
        Number(btn.getAttribute('data-ayat-akhir')) || 1
      );
    });
  },

  renderMissions() {
    const container = document.getElementById('santri-missions-list');
    if (!container) return;

    this.bindMissionEvents();

    const m = this.data.missions || {};
    let html = '';

    // Misi Sabaq (Hafalan Baru). Mendukung array (beberapa setoran di hari yang
    // sama) maupun objek tunggal (kontrak backend versi lama) agar tidak ada
    // unit setoran yang hilang dari daftar misi.
    const sabaqList = Array.isArray(m.sabaq) ? m.sabaq : (m.sabaq ? [m.sabaq] : []);
    sabaqList.forEach(unit => {
      html += this.createMissionCardHTML('Sabaq', unit, 'tag-sabaq', 'Hafalan Baru Hari Ini', unit.xp || 5);
    });

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
    const esc = (v) => UI.escapeHTML(v);
    const isCompleted = unit.completed;
    const statusColor = unit.retentionStatus === 'Merah' ? 'status-red' : (unit.retentionStatus === 'Kuning' ? 'status-yellow' : 'status-green');
    const statusText = unit.retentionStatus || 'Hijau';

    // Bahasa lebih sederhana saat Mode Anak aktif.
    const kid = document.body.classList.contains('kid-mode');
    const kidSubtitles = {
      Sabaq: 'Hafalan baru hari ini ✨',
      Sabqi: 'Hafalan yang masih segar 🔄',
      Manzil: 'Hafalan lama, ayo diulang 📚'
    };
    const shownSubtitle = kid ? (kidSubtitles[type] || subtitle) : subtitle;

    return `
      <div class="mission-card ${isCompleted ? 'completed' : ''}">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span class="mission-tag ${tagClass}">${esc(type)}</span>
            <span class="status-pill ${statusColor}" style="font-size: 0.7rem;">${esc(statusText)}</span>
            <span style="font-size: 0.75rem; color: var(--gold-600); font-weight: 700;">+${Number(xp) || 0} XP</span>
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--emerald-950);">
            ${esc(unit.surah)} (Ayat ${Number(unit.ayatMulai) || 0} - ${Number(unit.ayatAkhir) || 0})
          </h4>
          <p style="font-size: 0.8rem; color: var(--text-muted);">${esc(shownSubtitle)}</p>
        </div>
        <div>
          ${isCompleted ? `
            <span class="status-pill status-green" style="font-size: 0.8rem;">
              ✓ Selesai
            </span>
          ` : `
            <button class="btn btn-primary btn-sm" type="button"
              data-murojaah="1"
              data-id-master="${esc(unit.idMaster)}"
              data-jenis="${esc(type)}"
              data-surah="${esc(unit.surah)}"
              data-ayat-mulai="${Number(unit.ayatMulai) || 0}"
              data-ayat-akhir="${Number(unit.ayatAkhir) || 0}">
              ${kid ? '▶ Kerjakan' : 'Murojaah'}
            </button>
          `}
        </div>
      </div>
    `;
  },

  openMurojaahModal(idMaster, jenisMisi, surah, ayatMulai, ayatAkhir) {
    const modal = document.getElementById('modal-murojaah-confirm');
    if (!modal) return;

    const idMasterEl = document.getElementById('murojaah-id-master');
    if (idMasterEl) idMasterEl.value = idMaster || '';
    const jenisEl = document.getElementById('murojaah-jenis-misi');
    if (jenisEl) jenisEl.value = jenisMisi || 'Sabaq';

    // Rentang ayat dikirim ke backend agar riwayat Murojaah tercatat tepat
    // (dan misi bisa ditandai selesai PER UNIT, bukan per jenis misi).
    const mulaiEl = document.getElementById('murojaah-ayat-mulai');
    if (mulaiEl) mulaiEl.value = Number(ayatMulai) || 1;
    const akhirEl = document.getElementById('murojaah-ayat-akhir');
    if (akhirEl) akhirEl.value = Number(ayatAkhir) || 1;

    const surahEl = document.getElementById('murojaah-surah-val');
    if (surahEl) surahEl.textContent = surah;
    const ayatEl = document.getElementById('murojaah-ayat-val');
    if (ayatEl) ayatEl.textContent = `Ayat ${Number(ayatMulai) || 1} - ${Number(ayatAkhir) || 1}`;

    UI.openModal('modal-murojaah-confirm');
  },

  async submitMurojaahConfirmation(kualitas) {
    const val = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    const idMaster = val('murojaah-id-master');
    const jenisMisi = val('murojaah-jenis-misi');
    const ayatMulai = Number(val('murojaah-ayat-mulai')) || 1;
    const ayatAkhir = Number(val('murojaah-ayat-akhir')) || ayatMulai;
    const surahEl = document.getElementById('murojaah-surah-val');
    const surah = surahEl ? surahEl.textContent : '';

    // runOnce: cegah klik ganda pada tombol Lancar/Tersendat/Lupa. Tanpa ini,
    // satu klik ganda bisa mencatat murojaah (dan XP) dua kali.
    await UI.runOnce('santri-murojaah', async () => {
      UI.showLoading(true, 'Menyimpan riwayat murojaah...');
      try {
        const res = await API.request('santri_confirm_murojaah', {
          data: {
            idMaster,
            jenisMisi,
            surah,
            ayatMulai,
            ayatAkhir,
            kualitas // Lancar, Tersendat, Lupa
          }
        });
        UI.showLoading(false);

        if (res.success) {
          UI.closeModal('modal-murojaah-confirm');
          UI.celebrate();
          UI.toast(res.message || 'Murojaah berhasil dicatat!', 'success');
          this.load(); // Refresh data
          return;
        }

        // Tampilkan pesan spesifik per kode error (timeout / offline / sibuk /
        // sesi habis) — bukan lagi satu kalimat "koneksi putus".
        UI.toast(res.message || 'Gagal menyimpan murojaah', 'error', res.uncertain ? 7000 : 4500);

        if (res.uncertain) {
          // Status belum pasti: JANGAN biarkan user menekan ulang. Tutup modal
          // dan muat ulang data supaya ia melihat keadaan sebenarnya.
          UI.closeModal('modal-murojaah-confirm');
          this.load();
        }
      } catch (e) {
        UI.showLoading(false);
        UI.toast('Error menyimpan data: ' + e.message, 'error');
      }
    }, 'Murojaah sedang disimpan, mohon tunggu...');
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
        <span>${UI.escapeHTML(b.nama)}</span>
      </div>
    `).join('');
  },

  renderHeatmap() {
    const container = document.getElementById('santri-heatmap-grid');
    if (!container) return;

    const actMap = this.data.activityMap || {};
    let html = '';

    // Render 30 hari terakhir (memakai tanggal lokal, bukan UTC)
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = appTodayStr(d);
      const count = actMap[dateStr] || 0;

      let levelClass = '';
      if (count === 1) levelClass = 'level-1';
      else if (count === 2) levelClass = 'level-2';
      else if (count >= 3) levelClass = 'level-3';

      html += `<div class="heatmap-cell ${levelClass}" title="${dateStr}: ${count} aktivitas murojaah"></div>`;
    }

    container.innerHTML = html;
  },

  /** Klik notifikasi => tandai sudah dibaca (endpoint santri_mark_notif_read). */
  bindNotificationEvents() {
    const container = document.getElementById('santri-notifs-list');
    if (!container || container.dataset.bound === 'true') return;
    container.dataset.bound = 'true';
    container.addEventListener('click', (e) => {
      const item = e.target.closest('[data-notif-id]');
      if (!item || item.getAttribute('data-unread') !== '1') return;
      this.markNotificationRead(item.getAttribute('data-notif-id'), item);
    });
  },

  async markNotificationRead(idNotif, itemEl) {
    if (!idNotif) return;
    // Optimistis: tampilan langsung berubah, server menyusul.
    itemEl.setAttribute('data-unread', '0');
    itemEl.classList.remove('notif-unread');
    const res = await API.request('santri_mark_notif_read', { notifId: idNotif });
    if (!res || !res.success) {
      // Gagal -> kembalikan penanda "belum dibaca" agar tampilan tidak menipu.
      itemEl.setAttribute('data-unread', '1');
      itemEl.classList.add('notif-unread');
    }
  },

  renderNotifications() {
    const container = document.getElementById('santri-notifs-list');
    if (!container) return;

    this.bindNotificationEvents();

    const notifs = this.data.notifications || [];
    if (notifs.length === 0) {
      container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Belum ada notifikasi baru.</p>`;
      return;
    }

    const unread = notifs.filter(n => !n.dibaca).length;
    const header = unread > 0
      ? `<div style="font-size: 0.72rem; color: var(--gold-700); font-weight: 700; margin-bottom: 0.5rem;">${unread} pesan belum dibaca — ketuk untuk menandai sudah dibaca</div>`
      : '';

    // Semua nilai dari server di-escape: pesan feedback/broadcast/doa berasal
    // dari input pengguna (Ustaz/Ortu) sehingga rawan stored XSS bila mentah.
    container.innerHTML = header + notifs.map(n => {
      const tipe = String(n.tipe || '');
      const icon = tipe.includes('Ortu') ? '❤️' : (tipe.includes('Ustaz') ? '📖' : '🔔');
      const isUnread = !n.dibaca;
      return `
      <div class="notif-item ${isUnread ? 'notif-unread' : ''}"
           data-notif-id="${UI.escapeHTML(n.idNotif || '')}"
           data-unread="${isUnread ? '1' : '0'}"
           title="${isUnread ? 'Ketuk untuk menandai sudah dibaca' : ''}">
        <span style="font-size: 1.25rem;">${icon}</span>
        <div>
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--emerald-800); text-transform: uppercase;">
            ${UI.escapeHTML(tipe)} ${isUnread ? '<span class="status-pill status-yellow" style="font-size:0.6rem; padding:0.05rem 0.35rem;">Baru</span>' : ''}
          </div>
          <div style="font-size: 0.85rem; color: var(--text-main);">${UI.escapeHTML(n.pesan)}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem;">${UI.escapeHTML(n.tgl)}</div>
        </div>
      </div>
    `;
    }).join('');
  },

  // --- FLASHCARD ENGINE ---

  // Escape data eksternal (teks ayat live dari backend) sebelum masuk HTML.
  escapeHTML(str) {
    return UI.escapeHTML(str);
  },

  // Pengecoh aman dari bank ayat sampel surah lain (tanpa request network baru).
  getForeignDistractor(excludeTexts) {
    const bank = QURAN_DATA.sampleAyahs || {};
    const names = Object.keys(bank);
    for (let i = 0; i < 12; i++) {
      const list = bank[names[Math.floor(Math.random() * names.length)]];
      if (!list || !list.length) continue;
      const ayah = list[Math.floor(Math.random() * list.length)];
      if (ayah && ayah.arabic && !excludeTexts.includes(ayah.arabic)) return ayah.arabic;
    }
    return null;
  },

  // Kartu contoh statis: dipakai di Mode Demo atau bila santri belum punya misi.
  fallbackFlashcards: [
    {
      idMaster: null,
      surah: "An-Naba'",
      targetAyah: 1,
      questionArabic: "عَمَّ يَتَسَآءَلُونَ",
      questionTranslation: "Tentang apakah mereka saling bertanya-tanya?",
      nextAyahArabic: "عَنِ ٱلنَّبَإِ ٱلْعَظِيمِ",
      nextAyahTranslation: "Tentang berita yang besar (hari berbangkit)",
      audioUrl: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078001.mp3",
      options: [
        "عَنِ ٱلنَّبَإِ ٱلْعَظِيمِ",
        "ٱلَّذِى هُمْ فِيهِ مُخْتَلِفُونَ",
        "كَلَّا سَيَعْلَمُونَ"
      ]
    },
    {
      idMaster: null,
      surah: "An-Nazi'at",
      targetAyah: 1,
      questionArabic: "وَٱلنَّٰزِعَٰتِ غَرْقًا",
      questionTranslation: "Demi (malaikat) yang mencabut (nyawa) dengan keras,",
      nextAyahArabic: "وَٱلنَّٰشِطَٰتِ نَشْطًا",
      nextAyahTranslation: "demi (malaikat) yang mencabut (nyawa) dengan lemah lembut,",
      audioUrl: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/079001.mp3",
      options: [
        "وَٱلنَّٰشِطَٰتِ نَشْطًا",
        "وَٱلسَّٰبِحَٰتِ سَبْحًا",
        "فَٱلسَّٰبِقَٰتِ سَبْقًا"
      ]
    },
    {
      idMaster: null,
      surah: "Al-Ikhlas",
      targetAyah: 1,
      questionArabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
      questionTranslation: "Katakanlah (Muhammad), 'Dialah Allah, Yang Maha Esa.'",
      nextAyahArabic: "ٱللَّهُ ٱلصَّمَدُ",
      nextAyahTranslation: "Allah tempat meminta segala sesuatu.",
      audioUrl: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/112001.mp3",
      options: [
        "ٱللَّهُ ٱلصَّمَدُ",
        "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ"
      ]
    }
  ],

  async initFlashcards() {
    // Mode Demo -> kartu contoh statis agar stabil & instan.
    if (typeof APP_CONFIG === 'undefined' || APP_CONFIG.DATA_MODE !== 'api') {
      this.flashcardPool = [...this.fallbackFlashcards];
      this.currentFlashcardIndex = 0;
      this.renderCurrentFlashcard();
      return;
    }

    // Mode Live -> susun kartu dari surah yang sedang dimurojaah (misi aktif).
    // FIX: backend mengirim `sabaq` sebagai ARRAY (beberapa setoran/hari).
    // Sebelumnya array itu di-push apa adanya sehingga jadi unit tidak valid
    // dan seluruh kartu gagal dibangun di Mode Live.
    const missions = (this.data && this.data.missions) || {};
    const sabaqList = Array.isArray(missions.sabaq) ? missions.sabaq : (missions.sabaq ? [missions.sabaq] : []);
    const units = [];
    sabaqList.forEach(u => units.push(u));
    (missions.sabqi || []).forEach(u => units.push(u));
    (missions.manzil || []).forEach(u => units.push(u));

    if (units.length === 0) {
      this.flashcardPool = [...this.fallbackFlashcards];
      this.currentFlashcardIndex = 0;
      this.renderCurrentFlashcard();
      return;
    }

    // PRIORITAS RETENSI: unit Merah/Kuning & review overdue dijadwalkan lebih dulu.
    const scoreOf = (u) => {
      let score = 0;
      if (u.retentionStatus === 'Merah') score += 40;
      else if (u.retentionStatus === 'Kuning') score += 20;
      const nextReview = u.nextReview ? new Date(u.nextReview).getTime() : 0;
      if (nextReview && nextReview < Date.now()) score += 15; // overdue
      return score;
    };
    const ranked = units
      .map(u => ({ u, s: scoreOf(u) + Math.random() * 10 }))
      .sort((a, b) => b.s - a.s)
      .map(x => x.u);
    // Ambil maks 5 kartu per sesi latihan.
    const picked = ranked.slice(0, 5);
    const pool = [];
    for (const u of picked) {
      try {
        const card = await this.buildFlashcardFromUnit(u);
        if (card) pool.push(card);
      } catch (e) {
        console.warn('[Flashcard] gagal menyusun kartu:', e.message);
      }
    }
    this.flashcardPool = pool.length > 0 ? pool : this.fallbackFlashcards;
    this.currentFlashcardIndex = 0;
    this.renderCurrentFlashcard();
  },

  // Susun 1 kartu "tebak kelanjutan ayat" dari 1 unit murojaah:
  // pilih 1 ayat acak di dalam rentang hafalan sebagai soal,
  // ayat tepat setelahnya sebagai jawaban, plus 2 pengecoh.
  async buildFlashcardFromUnit(unit) {
    const meta = QURAN_DATA.getSurahByName(unit.surah);
    // Surah tidak dikenali -> lewati unit ini (jangan menebak surah lain).
    if (!meta) return null;

    const surahNum = meta.number;
    const surahName = meta.name;

    // Rentang dibatasi jumlah ayat surah agar tidak pernah meminta ayat fiktif.
    const mulai = Math.min(Math.max(1, Number(unit.ayatMulai) || 1), meta.verses);
    const akhir = Math.min(Math.max(mulai, Number(unit.ayatAkhir) || mulai), meta.verses);
    // Soal memerlukan ayat sesudahnya sebagai jawaban -> maksimal akhir-1.
    const maxTarget = Math.min(akhir - 1, meta.verses - 1);
    if (maxTarget < mulai) return null;
    const target = mulai + Math.floor(Math.random() * (maxTarget - mulai + 1));

    const [q, next, d1] = await Promise.all([
      QURAN_DATA.getAyahLive(surahNum, target),
      QURAN_DATA.getAyahLive(surahNum, target + 1),
      QURAN_DATA.getAyahLive(surahNum, Math.min(target + 2, akhir))
    ]);
    if (!q.arabic || !next.arabic) return null; // data tidak memadai -> lewati unit ini

    // Pengecoh kedua: ayat acak lain dalam rentang hafalan (bukan jawaban benar).
    let otherNum = mulai + Math.floor(Math.random() * (akhir - mulai + 1));
    if (otherNum === target + 1) otherNum = (mulai !== target + 1) ? mulai : akhir;
    const d2 = (otherNum === target + 1)
      ? { arabic: '', audio: '', translation: '', available: false }
      : await QURAN_DATA.getAyahLive(surahNum, otherNum);

    // Dedupe tanpa pernah menggandakan jawaban benar.
    const seen = new Set();
    const options = [];
    [next.arabic, d1.arabic, d2.arabic].forEach(t => {
      if (t && !seen.has(t)) { seen.add(t); options.push(t); }
    });
    // Pengecoh tambahan dari bank lokal bila kurang (tanpa duplikat, tanpa network).
    while (options.length < 3) {
      const cand = this.getForeignDistractor([...seen]);
      if (!cand) break;
      seen.add(cand);
      options.push(cand);
    }
    if (options.length < 2) return null; // data tidak memadai -> lewati unit ini

    return {
      idMaster: unit.idMaster || null,
      surah: surahName,
      targetAyah: target,
      questionArabic: q.arabic,
      questionTranslation: q.translation || '',
      nextAyahArabic: next.arabic,
      nextAyahTranslation: next.translation || '',
      audioUrl: q.audio || next.audio || '',
      options: options.sort(() => Math.random() - 0.5)
    };
  },
  
  renderCurrentFlashcard() {
    // Empty state: pool kosong -> tampilkan pesan ramah, jangan diam.
    if (!this.flashcardPool.length) {
      this.renderFlashcardEmptyState();
      return;
    }
    const card = this.flashcardPool[this.currentFlashcardIndex];
    if (!card) return;

    this.flashcardLocked = false;
    const surahEl = document.getElementById('flashcard-surah-title');
    if (surahEl) surahEl.textContent = `${card.surah} (Ayat ${card.targetAyah})`;

    const qArabicEl = document.getElementById('flashcard-question-arabic');
    if (qArabicEl) qArabicEl.textContent = card.questionArabic;

    const qTransEl = document.getElementById('flashcard-question-trans');
    if (qTransEl) qTransEl.textContent = card.questionTranslation ? `"${card.questionTranslation}"` : '';

    // Reset flipped state
    const flashcardEl = document.getElementById('interactive-flashcard');
    if (flashcardEl) flashcardEl.classList.remove('flipped');

    // Sembunyikan panel sambungan ayat dari kartu sebelumnya.
    const contEl = document.getElementById('flashcard-continuation');
    if (contEl) contEl.classList.add('hidden');

    // Render Pilihan Jawaban
    const optionsContainer = document.getElementById('flashcard-options-container');
    if (optionsContainer) {
      // Render via DOM API (textContent) -> kebal XSS, tanpa inline onclick.
      optionsContainer.innerHTML = '';
      card.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-full flashcard-option';
        btn.setAttribute('data-option', opt);
        btn.style.cssText = 'justify-content: center; padding: 0.85rem;';
        const span = document.createElement('span');
        span.style.cssText = 'direction: rtl; font-family: var(--font-family-arabic); font-size: 1.25rem; width: 100%; color: var(--emerald-900);';
        span.textContent = opt; // aman: tidak pernah di-parse sebagai HTML
        btn.appendChild(span);
        btn.addEventListener('click', () => this.answerFlashcard(opt, card.nextAyahArabic, btn));
        optionsContainer.appendChild(btn);
      });
    }

    // Bind Audio Button
    const audioBtn = document.getElementById('flashcard-audio-btn');
    if (audioBtn) {
      audioBtn.onclick = () => UI.playAyahAudio(card.audioUrl, `${card.surah} Ayat ${card.targetAyah}`);
    }
  },

  renderFlashcardEmptyState() {
    const optionsContainer = document.getElementById('flashcard-options-container');
    if (optionsContainer) {
      optionsContainer.innerHTML = `
        <div class="text-center" style="padding: 1.5rem 1rem; color: var(--text-muted); font-size: 0.9rem;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📝</div>
          Belum ada latihan tersedia.<br>
          Selesaikan setoran hafalan bersama Ustaz, lalu kembali ke tab ini.
        </div>`;
    }
    const titleEl = document.getElementById('flashcard-surah-title');
    if (titleEl) titleEl.textContent = 'Flashcard';
    const qArabicEl = document.getElementById('flashcard-question-arabic');
    if (qArabicEl) qArabicEl.textContent = '';
    const qTransEl = document.getElementById('flashcard-question-trans');
    if (qTransEl) qTransEl.textContent = '';
    const contEl = document.getElementById('flashcard-continuation');
    if (contEl) contEl.classList.add('hidden');
  },

  async answerFlashcard(selected, correct, btnEl) {
    if (this.flashcardLocked) return; // cegah klik ganda / spam
    if (!this.flashcardPool.length) return;
    this.flashcardLocked = true;

    const isCorrect = String(selected).trim() === String(correct).trim();

    // Umpan balik visual: kunci semua pilihan, tandai jawaban benar & salah.
    document.querySelectorAll('#flashcard-options-container .flashcard-option').forEach((btn) => {
      const value = btn.getAttribute('data-option') || '';
      if (value === correct) {
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');
      }
      btn.disabled = true;
      btn.style.opacity = '0.75';
    });
    if (btnEl && !isCorrect) {
      btnEl.classList.remove('btn-outline');
      btnEl.classList.add('btn-danger');
      btnEl.style.opacity = '1';
    }

    // Tampilkan sambungan ayat (jawaban benar) sebagai penguatan.
    const card = this.flashcardPool[this.currentFlashcardIndex];
    if (!card) { this.advanceFlashcard(); return; }
    const contEl = document.getElementById('flashcard-continuation');
    if (contEl) {
      const contText = contEl.querySelector('[data-continuation-text]');
      if (contText) contText.textContent = card.nextAyahArabic;
      const contTrans = contEl.querySelector('[data-continuation-trans]');
      if (contTrans) contTrans.textContent = card.nextAyahTranslation ? `"${card.nextAyahTranslation}"` : '';
      contEl.classList.remove('hidden');
    }

    // XP & pesan diambil dari respons backend (sumber kebenaran tunggal).
    let gamif = null;
    let message = isCorrect ? 'MasyaAllah! Tebakan Benar' : 'Belum tepat, coba ingat kembali!';
    try {
      const res = await API.request('santri_submit_flashcard_test', {
        data: { isCorrect, idMaster: card.idMaster || null }
      });
      if (res && res.success) {
        gamif = res.gamifikasi || null;
        if (res.message) message = res.message;
      }
    } catch (e) {
      console.warn('[Flashcard] gagal submit hasil:', e.message);
    }

    if (isCorrect) UI.celebrate();
    UI.toast(message, isCorrect ? 'gold' : 'error');

    // Update XP/level tanpa reload penuh (mencegah pool ter-reshuffle).
    if (gamif) {
      this.data = this.data || {};
      this.data.gamifikasi = gamif;
      this.renderGamification();
    }

    // Geser ke kartu berikutnya
    setTimeout(() => this.advanceFlashcard(), 1800);
  },

  advanceFlashcard() {
    if (!this.flashcardPool.length) { this.renderCurrentFlashcard(); return; }
    this.currentFlashcardIndex = (this.currentFlashcardIndex + 1) % this.flashcardPool.length;
    this.renderCurrentFlashcard();
  },

  skipFlashcard() {
    if (this.flashcardLocked) return;
    if (!this.flashcardPool.length) {
      UI.toast('Belum ada latihan yang tersedia', 'error');
      return;
    }
    this.advanceFlashcard();
    UI.toast('Beralih ke ayat berikutnya', 'gold');
  }
};
