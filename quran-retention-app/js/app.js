/**
 * ============================================================================
 * MAIN APPLICATION BOOTSTRAP & ROUTER
 * ============================================================================
 */

const App = {
  activeTab: 'home',

  init() {
    Auth.init();
    UI.init();
    this.initKidMode();
    this.updateModeUI();
    this.bindEvents();

    // Cek status login
    if (Auth.isLoggedIn()) {
      this.routeUserToDashboard();
    } else {
      this.showLoginView();
    }
  },

  bindEvents() {
    // Form Login Submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        await Auth.login(u, p);
      });
    }

    // Quick Demo Buttons in Login View
    document.querySelectorAll('[data-demo-role]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const role = btn.getAttribute('data-demo-role');
        await Auth.quickDemoLogin(role);
      });
    });

    // Logout Button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => Auth.logout());
    }

    // Role Switcher in Bottom Bar
    document.querySelectorAll('[data-switch-role]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const role = btn.getAttribute('data-switch-role');
        await Auth.quickDemoLogin(role);
      });
    });

    // Toggle Data Mode (Mock vs Live GAS)
    const toggleModeBtn = document.getElementById('btn-toggle-mode');
    if (toggleModeBtn) {
      toggleModeBtn.addEventListener('click', () => {
        APP_CONFIG.DATA_MODE = (APP_CONFIG.DATA_MODE === 'mock') ? 'api' : 'mock';
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DATA_MODE, APP_CONFIG.DATA_MODE);
        this.updateModeUI();
        UI.toast(`Mode beralih ke: ${APP_CONFIG.DATA_MODE === 'api' ? '🌐 Live API (Google Apps Script)' : '⚡ Simulasi Instan (Mock)'}`, 'gold');
        if (Auth.isLoggedIn()) {
          this.routeUserToDashboard();
        }
      });
    }

    // Tombol jalan keluar Mode Live -> Mode Demo pada layar login.
    const useDemoBtn = document.getElementById('btn-use-demo');
    if (useDemoBtn) {
      useDemoBtn.addEventListener('click', () => Auth.useDemoMode());
    }

    // Toggle Mode Anak (dashboard Santri)
    const kidToggleBtn = document.getElementById('btn-toggle-kid-mode');
    if (kidToggleBtn) {
      kidToggleBtn.addEventListener('click', () => this.toggleKidMode());
    }
  },

  /**
   * Mode Anak: memperbesar teks, tombol, dan menyederhanakan sapaan agar
   * ramah anak. Preferensi disimpan di localStorage.
   */
  initKidMode() {
    let active = false;
    try {
      active = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.KID_MODE) === '1';
    } catch (e) { active = false; }
    document.body.classList.toggle('kid-mode', active);
    this.updateKidModeUI(active);
  },

  toggleKidMode() {
    const active = !document.body.classList.contains('kid-mode');
    document.body.classList.toggle('kid-mode', active);
    try {
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.KID_MODE, active ? '1' : '0');
    } catch (e) { /* localStorage bisa diblokir */ }
    this.updateKidModeUI(active);
    UI.toast(active ? 'Mode Anak aktif — tampilan lebih besar & ramah anak 🧒' : 'Mode Anak nonaktif', 'gold');
  },

  updateKidModeUI(active) {
    const btn = document.getElementById('btn-toggle-kid-mode');
    if (!btn) return;
    btn.innerHTML = active
      ? '<span>🧒 Mode Anak: ON</span>'
      : '<span>🧒 Mode Anak</span>';
    btn.classList.toggle('btn-gold', active);
    btn.classList.toggle('btn-outline', !active);
    btn.setAttribute('aria-pressed', String(active));
  },

  /**
   * Tampilkan/sembunyikan peringatan Mode Live pada layar login.
   */
  showLoginModeHint() {
    const hint = document.getElementById('login-mode-hint');
    if (!hint) return;
    if (APP_CONFIG.DATA_MODE === 'api') {
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  },

  updateModeUI() {
    const modeText = document.getElementById('mode-status-text');
    if (modeText) {
      if (APP_CONFIG.DATA_MODE === 'api') {
        modeText.innerHTML = '🌐 Mode Live (GAS)';
        modeText.style.color = 'var(--emerald-700)';
      } else {
        modeText.innerHTML = '⚡ Mode Demo';
        modeText.style.color = 'var(--gold-700)';
      }
    }
    this.showLoginModeHint();
  },

  showLoginView() {
    this.hideAllViews();
    const loginView = document.getElementById('view-login');
    if (loginView) {
      loginView.classList.remove('hidden');
      loginView.classList.add('view-enter');
    }

    // Hide profile and logout in header
    const userBadge = document.getElementById('header-user-badge');
    if (userBadge) userBadge.classList.add('hidden');
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.classList.add('hidden');

    // Hide bottom nav on login view
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.classList.add('hidden');

    // Peringatan bila app masih di Mode Live (penyebab umum gagal login).
    this.showLoginModeHint();
  },

  routeUserToDashboard() {
    const user = Auth.getCurrentUser();
    if (!user) {
      this.showLoginView();
      return;
    }

    this.hideAllViews();

    // Show header badges & logout
    const userBadge = document.getElementById('header-user-badge');
    if (userBadge) userBadge.classList.remove('hidden');
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    const userRoleBadge = document.getElementById('header-user-role');
    if (userRoleBadge) {
      const roleNames = { ustaz: 'Ustaz', santri: 'Santri', ortu: 'Orang Tua' };
      userRoleBadge.textContent = roleNames[user.role] || user.role;
    }

    const userNameBadge = document.getElementById('header-user-name');
    if (userNameBadge) {
      userNameBadge.textContent = user.nama ? user.nama.split(' ')[0] : 'Pengguna';
    }

    // Show bottom nav and update active state
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      bottomNav.classList.remove('hidden');
      document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        const itemRole = item.getAttribute('data-switch-role');
        if (itemRole === user.role) {
          item.classList.add('active');
        } else if (!itemRole && !['santri', 'ortu', 'ustaz'].includes(user.role)) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    // Route berdasarkan role
    if (user.role === 'ustaz') {
      const ustazView = document.getElementById('view-ustaz');
      if (ustazView) {
        ustazView.classList.remove('hidden');
        ustazView.classList.add('view-enter');
      }
      DashboardUstaz.load();
    } else if (user.role === 'ortu') {
      const ortuView = document.getElementById('view-ortu');
      if (ortuView) {
        ortuView.classList.remove('hidden');
        ortuView.classList.add('view-enter');
      }
      DashboardOrtu.load();
    } else {
      // Santri default
      const santriView = document.getElementById('view-santri');
      if (santriView) {
        santriView.classList.remove('hidden');
        santriView.classList.add('view-enter');
      }
      DashboardSantri.load();
    }
  },

  hideAllViews() {
    const views = ['view-login', 'view-santri', 'view-ortu', 'view-ustaz'];
    views.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  },

  // Tab switcher di dashboard santri (Misi vs Flashcard)
  switchSantriTab(tabName) {
    const missionsSection = document.getElementById('santri-section-missions');
    const flashcardSection = document.getElementById('santri-section-flashcard');
    const tabMissionsBtn = document.getElementById('tab-btn-missions');
    const tabFlashcardBtn = document.getElementById('tab-btn-flashcard');

    if (tabName === 'flashcard') {
      if (missionsSection) missionsSection.classList.add('hidden');
      if (flashcardSection) {
        flashcardSection.classList.remove('hidden');
        flashcardSection.classList.add('view-enter');
      }
      if (tabMissionsBtn) {
        tabMissionsBtn.className = 'btn btn-outline btn-sm';
        tabMissionsBtn.setAttribute('aria-pressed', 'false');
      }
      if (tabFlashcardBtn) {
        tabFlashcardBtn.className = 'btn btn-primary btn-sm';
        tabFlashcardBtn.setAttribute('aria-pressed', 'true');
      }
    } else {
      if (flashcardSection) flashcardSection.classList.add('hidden');
      if (missionsSection) {
        missionsSection.classList.remove('hidden');
        missionsSection.classList.add('view-enter');
      }
      if (tabFlashcardBtn) {
        tabFlashcardBtn.className = 'btn btn-outline btn-sm';
        tabFlashcardBtn.setAttribute('aria-pressed', 'false');
      }
      if (tabMissionsBtn) {
        tabMissionsBtn.className = 'btn btn-primary btn-sm';
        tabMissionsBtn.setAttribute('aria-pressed', 'true');
      }
    }
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
