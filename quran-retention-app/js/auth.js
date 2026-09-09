/**
 * ============================================================================
 * AUTHENTICATION & SESSION CONTROLLER
 * ============================================================================
 */

const Auth = {
  token: null,
  currentUser: null,

  init() {
    // Muat mode data dari localStorage jika ada
    const savedMode = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.DATA_MODE);
    if (savedMode) {
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
        // Jika mode API gagal kredensial, cek fallback mock user
        const mockUser = MOCK_STATE.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (mockUser) {
          this.setSession('mock-token-' + Date.now(), {
            userId: mockUser.id,
            role: mockUser.role,
            nama: mockUser.nama,
            idTerkait: mockUser.idTerkait
          });
          UI.toast(`Masuk sebagai ${mockUser.nama} (Simulasi)`, 'gold');
          App.routeUserToDashboard();
          return true;
        }

        UI.toast(res.message || 'Login gagal, periksa username/password', 'error');
        return false;
      }
    } catch (err) {
      UI.showLoading(false);
      UI.toast('Terjadi kesalahan saat login: ' + err.message, 'error');
      return false;
    }
  },

  /**
   * Shortcut login instan untuk eksplorasi peran di preview
   */
  async quickDemoLogin(role) {
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
