/**
 * ============================================================================
 * MOCK DATA & CLIENT-SIDE STATE ENGINE
 * ============================================================================
 * Menyediakan simulasi data lokal yang 100% selaras dengan PRD v4 dan Code.gs.
 * Digunakan saat mode Mock diaktifkan atau jika koneksi backend GAS belum dideploy.
 */

const MOCK_STATE = {
  users: [
    { id: 'USR-USTAZ-01', username: 'ustaz1', role: 'ustaz', nama: 'Ustaz Ahmad Fauzi, Al-Hafizh', idTerkait: '' },
    { id: 'USR-SANTRI-01', username: 'santri1', role: 'santri', nama: 'Muhammad Hafizh Al-Fatih', idTerkait: '' },
    { id: 'USR-SANTRI-02', username: 'santri2', role: 'santri', nama: 'Aisyah Humaira', idTerkait: '' },
    { id: 'USR-ORTU-01', username: 'ortu1', role: 'ortu', nama: 'Bapak Ridwan (Ortu Hafizh)', idTerkait: 'USR-SANTRI-01' }
  ],

  santriList: [
    { idSantri: 'USR-SANTRI-01', nama: 'Muhammad Hafizh Al-Fatih', idUstaz: 'USR-USTAZ-01', status: 'Aktif' },
    { idSantri: 'USR-SANTRI-02', nama: 'Aisyah Humaira', idUstaz: 'USR-USTAZ-01', status: 'Aktif' }
  ],

  targetList: [
    { idTarget: 'TGT-001', bulan: new Date().toISOString().slice(0, 7), idSantri: 'USR-SANTRI-01', surah: 'An-Naba', ayatMulai: 1, ayatAkhir: 40 },
    { idTarget: 'TGT-002', bulan: new Date().toISOString().slice(0, 7), idSantri: 'USR-SANTRI-02', surah: "An-Nazi'at", ayatMulai: 1, ayatAkhir: 46 }
  ],

  masterHafalan: [
    { idMaster: 'MST-001', idSantri: 'USR-SANTRI-01', surah: "An-Naba'", ayatMulai: 1, ayatAkhir: 20, tglMulai: new Date().toISOString().split('T')[0], diffDays: 0, status: 'Aktif', retentionStatus: 'Hijau', nextReview: new Date().toISOString().split('T')[0], interval: 2, consecutiveLupa: 0 },
    { idMaster: 'MST-002', idSantri: 'USR-SANTRI-01', surah: "An-Nazi'at", ayatMulai: 1, ayatAkhir: 15, tglMulai: '2026-08-15', diffDays: 23, status: 'Aktif', retentionStatus: 'Kuning', nextReview: new Date().toISOString().split('T')[0], interval: 1, consecutiveLupa: 0 },
    { idMaster: 'MST-003', idSantri: 'USR-SANTRI-01', surah: "'Abasa", ayatMulai: 1, ayatAkhir: 25, tglMulai: '2026-07-01', diffDays: 68, status: 'Aktif', retentionStatus: 'Merah', nextReview: new Date().toISOString().split('T')[0], interval: 1, consecutiveLupa: 2 },
    { idMaster: 'MST-004', idSantri: 'USR-SANTRI-01', surah: "Al-Ikhlas", ayatMulai: 1, ayatAkhir: 4, tglMulai: '2026-06-10', diffDays: 89, status: 'Aktif', retentionStatus: 'Hijau', nextReview: '2026-09-20', interval: 15, consecutiveLupa: 0 },
    { idMaster: 'MST-005', idSantri: 'USR-SANTRI-02', surah: "Al-Infitar", ayatMulai: 1, ayatAkhir: 19, tglMulai: new Date().toISOString().split('T')[0], diffDays: 0, status: 'Aktif', retentionStatus: 'Hijau', nextReview: new Date().toISOString().split('T')[0], interval: 3, consecutiveLupa: 0 }
  ],

  gamifikasi: {
    'USR-SANTRI-01': { xp: 345, level: 4, currentStreak: 7, longestStreak: 14, lastQualifyingDate: new Date().toISOString().split('T')[0] },
    'USR-SANTRI-02': { xp: 180, level: 2, currentStreak: 3, longestStreak: 5, lastQualifyingDate: new Date().toISOString().split('T')[0] }
  },

  badges: {
    'USR-SANTRI-01': [
      { idBadge: 'BDG-001', nama: 'Streak 3 Hari 🔥', tgl: '2026-09-03' },
      { idBadge: 'BDG-002', nama: 'Pejuang Istiqomah (7 Hari) 🌟', tgl: new Date().toISOString().split('T')[0] },
      { idBadge: 'BDG-003', nama: 'Level 4: Penjaga Ayat 🛡️', tgl: new Date().toISOString().split('T')[0] }
    ],
    'USR-SANTRI-02': [
      { idBadge: 'BDG-004', nama: 'Streak 3 Hari 🔥', tgl: new Date().toISOString().split('T')[0] }
    ]
  },

  notifications: {
    'USR-SANTRI-01': [
      { idNotif: 'NTF-001', tipe: 'Motivasi', pesan: 'MasyaAllah Hafizh, pertahankan streak murojaah 7 harimu!', tgl: new Date().toISOString().split('T')[0], dibaca: false },
      { idNotif: 'NTF-002', tipe: 'Apresiasi Ortu', pesan: 'Semangat terus ya nak, Ayah & Bunda sangat bangga!', tgl: new Date().toISOString().split('T')[0], dibaca: false },
      { idNotif: 'NTF-003', tipe: 'Feedback Ustaz', pesan: 'Perhatikan dengung (ghunnah) pada Surat An-Naba ayat 1-5.', tgl: '2026-09-06', dibaca: true }
    ]
  },

  activityHeatmap: {
    'USR-SANTRI-01': {
      '2026-09-07': 3,
      '2026-09-06': 2,
      '2026-09-05': 1,
      '2026-09-04': 2,
      '2026-09-03': 3,
      '2026-09-02': 1,
      '2026-09-01': 2
    }
  },

  riwayatTes: [
    { idTes: 'TES-001', tgl: '2026-09-06', idSantri: 'USR-SANTRI-01', surah: "An-Naba'", ayatMulai: 1, ayatAkhir: 10, kualitas: 'Lancar', pelapor: 'Orang Tua: Bapak Ridwan' },
    { idTes: 'TES-002', tgl: '2026-09-05', idSantri: 'USR-SANTRI-01', surah: "'Abasa", ayatMulai: 1, ayatAkhir: 15, kualitas: 'Lupa', pelapor: 'Orang Tua: Bapak Ridwan' }
  ],

  setoranHistory: [
    { idHafalan: 'HAF-001', tgl: '2026-09-06', idSantri: 'USR-SANTRI-01', surah: "An-Naba'", ayatMulai: 1, ayatAkhir: 20, nilai: 'A', catatan: 'Makhraj huruf shad dan tho sangat rapi.' },
    { idHafalan: 'HAF-002', tgl: '2026-09-04', idSantri: 'USR-SANTRI-01', surah: "An-Nazi'at", ayatMulai: 1, ayatAkhir: 15, nilai: 'B+', catatan: 'Lancar, perhatikan mad jaiz munfashil.' }
  ]
};
