/**
 * ============================================================================
 * UI UTILITIES, MODAL & AUDIO CONTROLLER
 * ============================================================================
 */

const UI = {
  currentAudio: null,
  isPlayingAudio: false,

  init() {
    // Event listener tombol close modal
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = btn.closest('.modal-backdrop');
        if (modal) modal.classList.remove('active');
      });
    });

    // Close modal ketika klik di backdrop
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  },

  /**
   * Toast notification
   */
  toast(message, type = 'success', duration = 3200) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : (type === 'gold' ? 'toast-gold' : '')}`;
    
    let icon = '✨';
    if (type === 'error') icon = '⚠️';
    if (type === 'gold') icon = '⭐';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span>${icon}</span>
        <span>${message}</span>
      </div>
      <button style="background:none; border:none; color: var(--text-muted); cursor:pointer; font-size:1.1rem;" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Loading overlay
   */
  showLoading(show = true, text = 'Memuat data...') {
    const loader = document.getElementById('global-loader');
    if (!loader) return;

    if (show) {
      loader.classList.remove('hidden');
      const label = loader.querySelector('.loader-text');
      if (label) label.textContent = text;
    } else {
      loader.classList.add('hidden');
    }
  },

  /**
   * Modal Open / Close
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  },

  /**
   * Audio Murattal Controller
   */
  playAyahAudio(audioUrl, title = 'Ayat Al-Qur\'an') {
    if (!audioUrl) {
      this.toast('Audio untuk ayat ini belum tersedia', 'error');
      return;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }

    this.currentAudio = new Audio(audioUrl);
    this.isPlayingAudio = true;
    this.updateAudioWidgets(true, title);

    this.currentAudio.play().catch(e => {
      console.warn('Audio autoplay prevented:', e);
      this.toast('Klik play sekali lagi untuk memutar audio', 'gold');
      this.updateAudioWidgets(false);
    });

    this.currentAudio.onended = () => {
      this.isPlayingAudio = false;
      this.updateAudioWidgets(false);
    };

    this.currentAudio.onerror = () => {
      this.isPlayingAudio = false;
      this.updateAudioWidgets(false);
      this.toast('Gagal memuat streaming audio', 'error');
    };
  },

  stopAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.isPlayingAudio = false;
      this.updateAudioWidgets(false);
    }
  },

  updateAudioWidgets(isPlaying, title = '') {
    const waveforms = document.querySelectorAll('.waveform-anim');
    waveforms.forEach(w => {
      if (isPlaying) w.classList.add('playing');
      else w.classList.remove('playing');
    });

    const playIcons = document.querySelectorAll('.audio-play-icon');
    playIcons.forEach(icon => {
      icon.innerHTML = isPlaying 
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>' 
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    });
  },

  /**
   * Confetti Celebration effect
   */
  celebrate() {
    const colors = ['#10B981', '#F59E0B', '#6366F1', '#EC4899', '#3B82F6', '#FCD34D'];
    const total = 35;

    for (let i = 0; i < total; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-piece';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.top = '-10px';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      confetti.style.width = Math.random() * 8 + 6 + 'px';
      confetti.style.height = Math.random() * 8 + 6 + 'px';
      confetti.style.animationDuration = Math.random() * 1.5 + 1.5 + 's';
      confetti.style.animationDelay = Math.random() * 0.2 + 's';
      
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 3000);
    }
  },

  /**
   * Format Tanggal Hijriah & Masehi
   */
  getIslamicGreeting() {
    const hour = new Date().getHours();
    if (hour < 11) return 'Sobahul Khair ☀️ (Selamat Pagi)';
    if (hour < 15) return 'Naharuka Sa\'id 🌤️ (Selamat Siang)';
    if (hour < 18) return 'Masa\'ul Khair 🌇 (Selamat Sore)';
    return 'Lailah Sa\'idah 🌙 (Selamat Malam)';
  }
};
