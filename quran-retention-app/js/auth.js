/**
 * ============================================================================
 * AUTHENTICATION & SESSION CONTROLLER
 * ============================================================================
 */

const Auth = {
  token: null,
  currentUser: null,

  init() {
    // Muat mode data dari localStorage jika ada. Nilai di luar 'mock'/'api'
    // (mis. sisa versi lama) diabaikan agar aplikasi tidak macet tanpa mode.
    const savedMode = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.DATA_MODE);
    if (savedMode === 'mock' || savedMode === 'api') {
      APP_CONFIG.DATA_MODE = savedMode;
    }

    // Cek token tersimpan di localStorage
    const savedToken = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    const savedUser = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.USER_DATA);

    if (savedToken && savedUser) {
      try {
        this.token = savedToken;
        this.currentUser = JSON.parse(savedUser);
      } catch (e) {
        this.logout();
      }
    }
  },

  getToken() {
    return this.token;
  },

  getCurrentUser() {
    return this.currentUser;
  },

  isLoggedIn() {
    return !!this.token && !!this.currentUser;
  },

  setSession(token, user) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.AUTH_TOKEN, token);
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  },

  async login(username, password) {
    UI.showLoading(true, 'Memverifikasi akun...');
    try {
      const res = await API.request('login', { username, password });
      UI.showLoading(false);

      if (res.success) {
        this.setSession(res.token, {
          userId: res.userId,
          role: res.role,
          nama: res.nama,
          idTerkait: res.idTerkait
        });
        UI.toast(`Ahlan wa Sahlan, ${res.nama}!`, 'gold');
        App.routeUserToDashboard();
        return true;
      } else {
        // TIDAK ada fallback login tanpa alternatif kredensial: bila server
        // menolak, login harus gagal (mencegah bypass autentikasi).
        const code = res.code || '';

        // Server sibuk BUKAN masalah kredensial maupun koneksi: user cukup
        // menunggu lalu mencoba lagi (jangan diarahkan ke Mode Demo).
        if (code === 'E_BUSY') {
          UI.toast(res.message || 'Server sedang sibuk membuat sesi. Coba lagi sebentar.', 'gold', 6000);
          return false;
        }

        // Kredensial salah / data tidak lengkap: pesan apa adanya dari server.
        if (code === 'E_AUTH' || code === 'E_VALIDATION' || code === 'E_FORBIDDEN') {
          UI.toast(res.message || 'Login gagal, periksa username/password', 'error', 5000);
          return false;
        }

        let msg = res.message || 'Login gagal, periksa username/password';
        // Kegagalan koneksi/deployment di Mode Live bukan soal kredensial —
        // beri jalan keluar agar pengguna tidak buntu: sarankan Mode Demo.
        if (res.offline) {
          msg += ' Klik "Gunakan Mode Demo" di bawah untuk masuk dengan akun uji.';
          if (typeof App !== 'undefined' && App.showLoginModeHint) App.showLoginModeHint();
        }
        console.warn(`[Auth] Login gagal. kode=${code || '(tidak ada)'} pesan=${res.message || '-'}`);
        UI.toast(msg, 'error', 6000);
        return false;
      }
    } catch (err) {
      UI.showLoading(false);
      UI.toast('Terjadi kesalahan saat login: ' + err.message, 'error');
      return false;
    }
  },

  /**
   * Kembalikan aplikasi ke Mode Demo (mock) — jalan keluar bila Mode Live
   * tidak dapat dihubungi. Dipakai tombol pada layar login.
   */
  useDemoMode() {
    APP_CONFIG.DATA_MODE = 'mock';
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DATA_MODE, 'mock');
    if (typeof App !== 'undefined' && App.updateModeUI) App.updateModeUI();
    if (typeof App !== 'undefined' && App.showLoginModeHint) App.showLoginModeHint();
    UI.toast('Beralih ke Mode Demo. Silakan masuk dengan akun uji.', 'gold');
  },

  /**
   * Shortcut login instan untuk eksplorasi peran di preview
   */
  async quickDemoLogin(role) {
   // Token demo/mock TIDAK valid di backend GAS. Kalau user sedang di Mode Live,
    // paksa pindah ke Mode Demo dulu agar tidak langsung kena auto-logout
    // "session expired" saat dashboard pertama kali load.
    if (APP_CONFIG.DATA_MODE === 'api') {
      APP_CONFIG.DATA_MODE = 'mock';
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DATA_MODE, 'mock');
      if (typeof App !== 'undefined' && App.updateModeUI) App.updateModeUI();
      UI.toast('Mode Live butuh akun spreadsheet — dialihkan ke Mode Demo', 'gold');
    } 
   
    const demoUsers = {
      ustaz: { userId: 'USR-USTAZ-01', role: 'ustaz', nama: 'Ustaz Ahmad Fauzi, Al-Hafizh', idTerkait: '' },
      santri: { userId: 'USR-SANTRI-01', role: 'santri', nama: 'Muhammad Hafizh Al-Fatih', idTerkait: '' },
      ortu: { userId: 'USR-ORTU-01', role: 'ortu', nama: 'Bapak Ridwan (Ortu Hafizh)', idTerkait: 'USR-SANTRI-01' }
    };

    const user = demoUsers[role] || demoUsers.santri;
    this.setSession('demo-token-' + Date.now(), user);
    UI.toast(`Beralih ke Dashboard: ${user.nama}`, 'gold');
    App.routeUserToDashboard();
  },

  async logout() {
    if (this.token && APP_CONFIG.DATA_MODE === 'api') {
      try {
        await API.request('logout');
      } catch (e) {}
    }

    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.USER_DATA);

    UI.toast('Anda telah keluar dari aplikasi', 'gold');
    App.showLoginView();
  }
};
