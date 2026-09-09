/**
 * ============================================================================
 * API CLIENT LAYER
 * ============================================================================
 * Mengirim request ke Google Apps Script Web App dengan Content-Type: text/plain
 * untuk menghindari CORS preflight (OPTIONS) browser.
 */

const API = {
  /**
   * Request wrapper utama
   */
  async request(action, data = {}) {
    const token = Auth.getToken();
    const payload = {
      action: action,
      token: token,
      ...data
    };

    // Jika mode mock aktif, proses secara instan lokal
    if (APP_CONFIG.DATA_MODE === 'mock') {
      return this.handleMockRequest(action, payload);
    }

    try {
      // Timeout controller 8 detik
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      // WAJIB text/plain;charset=utf-8 agar tidak kena CORS preflight pada GAS
      const response = await fetch(APP_CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const result = await response.json();

      // Cek unauthorized
      if (result.unauthorized) {
        Auth.logout();
        UI.toast('Sesi telah berakhir, silakan login kembali', 'error');
        return { success: false, message: 'Session expired' };
      }

      return result;
    } catch (err) {
      console.warn(`[API] Gagal menghubungi backend GAS (${err.message}). Menggunakan simulasi lokal.`);
      return this.handleMockRequest(action, payload);
    }
  },

  /**
   * Handler simulasi Mock Data Lokal (Identik dengan Code.gs)
   */
  handleMockRequest(action, payload) {
    const user = Auth.getCurrentUser();
    const todayStr = new Date().toISOString().split('T')[0];

    switch (action) {
      case 'login': {
        const u = MOCK_STATE.users.find(
          x => x.username.toLowerCase() === (payload.username || '').toLowerCase()
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
          const gamif = MOCK_STATE.gamifikasi[s.idSantri] || { xp: 0, level: 1, currentStreak: 0 };
          const target = MOCK_STATE.targetList.find(t => t.idSantri === s.idSantri);
          
          const flags = [];
          if (merah > 0) flags.push(`Kritis: ${merah} unit hafalan status Merah`);
          if (kuning >= 2) flags.push(`Perhatian: ${kuning} unit hafalan perlu review`);
          if (gamif.currentStreak === 0) flags.push('Streak terputus');

          return {
            idSantri: s.idSantri,
            nama: s.nama,
            status: s.status,
            totalHafalan: masters.length,
            retention: { hijau, kuning, merah, overdue: 1 },
            gamifikasi: gamif,
            target: target ? { surah: target.surah, ayatMulai: target.ayatMulai, ayatAkhir: target.ayatAkhir } : null,
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
        const newHafalan = {
          idHafalan: 'HAF-' + Date.now().toString().slice(-4),
          tgl: d.tgl || todayStr,
          idSantri: d.idSantri,
          surah: d.surah,
          ayatMulai: Number(d.ayatMulai),
          ayatAkhir: Number(d.ayatAkhir),
          nilai: d.nilai || 'A',
          catatan: d.catatan || ''
        };
        MOCK_STATE.setoranHistory.push(newHafalan);

        // Tambah/update master hafalan
        MOCK_STATE.masterHafalan.push({
          idMaster: 'MST-' + Date.now().toString().slice(-4),
          idSantri: d.idSantri,
          surah: d.surah,
          ayatMulai: Number(d.ayatMulai),
          ayatAkhir: Number(d.ayatAkhir),
          tglMulai: todayStr,
          diffDays: 0,
          status: 'Aktif',
          retentionStatus: 'Hijau',
          nextReview: todayStr,
          interval: 2,
          consecutiveLupa: 0
        });

        // Update gamifikasi
        if (!MOCK_STATE.gamifikasi[d.idSantri]) {
          MOCK_STATE.gamifikasi[d.idSantri] = { xp: 0, level: 1, currentStreak: 1, longestStreak: 1, lastQualifyingDate: todayStr };
        }
        MOCK_STATE.gamifikasi[d.idSantri].xp += 10;
        MOCK_STATE.gamifikasi[d.idSantri].level = Math.floor(MOCK_STATE.gamifikasi[d.idSantri].xp / 100) + 1;

        return { success: true, message: 'Setoran hafalan baru berhasil dicatat!' };
      }

      case 'ustaz_save_target': {
        const d = payload.data || {};
        const existing = MOCK_STATE.targetList.find(t => t.idSantri === d.idSantri);
        if (existing) {
          existing.surah = d.surah;
          existing.ayatMulai = d.ayatMulai;
          existing.ayatAkhir = d.ayatAkhir;
        } else {
          MOCK_STATE.targetList.push({
            idTarget: 'TGT-' + Date.now().toString().slice(-4),
            bulan: new Date().toISOString().slice(0, 7),
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
        const sId = (user && user.role === 'santri') ? user.userId : 'USR-SANTRI-01';
        const sMasters = MOCK_STATE.masterHafalan.filter(m => m.idSantri === sId);
        
        // Buat Daily Missions
        const sabaq = sMasters[0] || null;
        const sabqi = sMasters.filter((m, i) => i > 0 && i < 3);
        const manzil = sMasters.filter((m, i) => i >= 3 || m.retentionStatus === 'Merah');

        const gamif = MOCK_STATE.gamifikasi[sId] || { xp: 345, level: 4, currentStreak: 7, longestStreak: 14 };
        const badges = MOCK_STATE.badges[sId] || [];
        const notifs = MOCK_STATE.notifications[sId] || [];
        const heatmap = MOCK_STATE.activityHeatmap[sId] || {};

        return {
          success: true,
          nama: (user && user.role === 'santri') ? user.nama : 'Muhammad Hafizh Al-Fatih',
          santriId: sId,
          missions: {
            sabaq: sabaq ? { ...sabaq, completed: false, xp: 5 } : null,
            sabqi: sabqi.map(m => ({ ...m, completed: false, xp: 8 })),
            manzil: manzil.map(m => ({ ...m, completed: false, xp: 12 }))
          },
          gamifikasi: gamif,
          badges: badges,
          notifications: notifs,
          activityMap: heatmap
        };
      }

      case 'santri_confirm_murojaah': {
        const d = payload.data || {};
        const sId = (user && user.role === 'santri') ? user.userId : 'USR-SANTRI-01';
        
        let xpAdd = 5;
        if (d.jenisMisi === 'Sabqi') xpAdd = 8;
        if (d.jenisMisi === 'Manzil') xpAdd = 12;

        if (MOCK_STATE.gamifikasi[sId]) {
          MOCK_STATE.gamifikasi[sId].xp += xpAdd;
          MOCK_STATE.gamifikasi[sId].level = Math.floor(MOCK_STATE.gamifikasi[sId].xp / 100) + 1;
        }

        if (d.idMaster) {
          const m = MOCK_STATE.masterHafalan.find(x => x.idMaster === d.idMaster);
          if (m && m.retentionStatus === 'Merah') {
            m.retentionStatus = 'Kuning'; // Recovery policy
            if (MOCK_STATE.gamifikasi[sId]) MOCK_STATE.gamifikasi[sId].xp += 15;
          }
        }

        return {
          success: true,
          message: `Alhamdulillah! Misi Murojaah ${d.jenisMisi} selesai (+${xpAdd} XP)`,
          gamifikasi: MOCK_STATE.gamifikasi[sId]
        };
      }

      case 'santri_submit_flashcard_test': {
        const d = payload.data || {};
        const sId = (user && user.role === 'santri') ? user.userId : 'USR-SANTRI-01';
        const xpGain = d.isCorrect ? 5 : 1;

        if (MOCK_STATE.gamifikasi[sId]) {
          MOCK_STATE.gamifikasi[sId].xp += xpGain;
          MOCK_STATE.gamifikasi[sId].level = Math.floor(MOCK_STATE.gamifikasi[sId].xp / 100) + 1;
        }

        return {
          success: true,
          message: d.isCorrect ? 'MasyaAllah! Jawaban Tepat (+5 XP)' : 'Terus berlatih ya! (+1 XP)',
          gamifikasi: MOCK_STATE.gamifikasi[sId]
        };
      }

      case 'ortu_get_dashboard': {
        const sId = 'USR-SANTRI-01';
        const masters = MOCK_STATE.masterHafalan.filter(m => m.idSantri === sId);
        const hijau = masters.filter(m => m.retentionStatus === 'Hijau').length;
        const kuning = masters.filter(m => m.retentionStatus === 'Kuning').length;
        const merah = masters.filter(m => m.retentionStatus === 'Merah').length;
        const gamif = MOCK_STATE.gamifikasi[sId] || { xp: 345, level: 4, currentStreak: 7 };

        return {
          success: true,
          ortuName: (user && user.role === 'ortu') ? user.nama : 'Bapak Ridwan (Ortu Hafizh)',
          santriId: sId,
          santriName: 'Muhammad Hafizh Al-Fatih',
          retention: { hijau, kuning, merah, total: masters.length },
          gamifikasi: gamif,
          unitList: masters,
          recentTests: MOCK_STATE.riwayatTes
        };
      }

      case 'ortu_get_random_test': {
        const sId = 'USR-SANTRI-01';
        const masters = MOCK_STATE.masterHafalan.filter(m => m.idSantri === sId && m.diffDays >= 0);
        
        // Prioritaskan yang Merah atau Kuning
        const weak = masters.filter(m => m.retentionStatus === 'Merah' || m.retentionStatus === 'Kuning');
        const candidate = weak.length > 0 ? weak[Math.floor(Math.random() * weak.length)] : (masters[0] || {
          idMaster: 'MST-001',
          surah: "An-Naba'",
          ayatMulai: 1,
          ayatAkhir: 20,
          retentionStatus: 'Kuning'
        });

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
        const sId = 'USR-SANTRI-01';
        
        MOCK_STATE.riwayatTes.unshift({
          idTes: 'TES-' + Date.now().toString().slice(-4),
          tgl: todayStr,
          idSantri: sId,
          surah: d.surah,
          ayatMulai: d.targetAyat || 1,
          ayatAkhir: d.targetAyat || 1,
          kualitas: d.kualitas,
          pelapor: 'Orang Tua'
        });

        // Event-driven retention cache update
        if (d.idMaster) {
          const m = MOCK_STATE.masterHafalan.find(x => x.idMaster === d.idMaster);
          if (m) {
            if (d.kualitas === 'Lancar') {
              if (m.retentionStatus === 'Merah') m.retentionStatus = 'Kuning';
              else m.retentionStatus = 'Hijau';
              m.interval = Math.min(60, Math.ceil((m.interval || 1) * 1.5));
            } else if (d.kualitas === 'Tersendat') {
              if (m.retentionStatus !== 'Merah') m.retentionStatus = 'Kuning';
              m.interval = Math.max(1, Math.floor((m.interval || 1) * 0.5));
            } else if (d.kualitas === 'Lupa') {
              m.retentionStatus = 'Merah';
              m.interval = 1;
            }
          }
        }

        const xpAdd = d.kualitas === 'Lancar' ? 10 : 5;
        if (MOCK_STATE.gamifikasi[sId]) {
          MOCK_STATE.gamifikasi[sId].xp += xpAdd;
          MOCK_STATE.gamifikasi[sId].level = Math.floor(MOCK_STATE.gamifikasi[sId].xp / 100) + 1;
        }

        return {
          success: true,
          message: `Evaluasi "${d.kualitas}" berhasil disimpan! Ananda mendapat +${xpAdd} XP`,
          gamifikasi: MOCK_STATE.gamifikasi[sId]
        };
      }

      case 'ortu_send_apresiasi': {
        const d = payload.data || {};
        const sId = 'USR-SANTRI-01';
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

      default:
        return { success: true, message: 'Mock response OK' };
    }
  }
};
