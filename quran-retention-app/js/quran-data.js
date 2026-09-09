/**
 * ============================================================================
 * QURAN DATA & AYAH DATABASE
 * ============================================================================
 * Metadata 114 Surah Al-Qur'an dan sampel data ayat untuk Flashcard & Random Test
 */

const QURAN_DATA = {
  // Daftar 114 Surah
  surahs: [
    { number: 1, name: "Al-Fatihah", arabic: "الفاتحة", verses: 7, type: "Makkiyah", juz: 1 },
    { number: 2, name: "Al-Baqarah", arabic: "البقرة", verses: 286, type: "Madaniyah", juz: 1 },
    { number: 3, name: "Ali 'Imran", arabic: "آل عمران", verses: 200, type: "Madaniyah", juz: 3 },
    { number: 4, name: "An-Nisa'", arabic: "النساء", verses: 176, type: "Madaniyah", juz: 4 },
    { number: 5, name: "Al-Ma'idah", arabic: "المائدة", verses: 120, type: "Madaniyah", juz: 6 },
    { number: 6, name: "Al-An'am", arabic: "الأنعام", verses: 165, type: "Makkiyah", juz: 7 },
    { number: 7, name: "Al-A'raf", arabic: "الأعراف", verses: 206, type: "Makkiyah", juz: 8 },
    { number: 8, name: "Al-Anfal", arabic: "الأنفال", verses: 75, type: "Madaniyah", juz: 9 },
    { number: 9, name: "At-Taubah", arabic: "التوبة", verses: 129, type: "Madaniyah", juz: 10 },
    { number: 10, name: "Yunus", arabic: "يونس", verses: 109, type: "Makkiyah", juz: 11 },
    { number: 11, name: "Hud", arabic: "هود", verses: 123, type: "Makkiyah", juz: 11 },
    { number: 12, name: "Yusuf", arabic: "يوسف", verses: 111, type: "Makkiyah", juz: 12 },
    { number: 13, name: "Ar-Ra'd", arabic: "الرعد", verses: 43, type: "Madaniyah", juz: 13 },
    { number: 14, name: "Ibrahim", arabic: "إبراهيم", verses: 52, type: "Makkiyah", juz: 13 },
    { number: 15, name: "Al-Hijr", arabic: "الحجر", verses: 99, type: "Makkiyah", juz: 14 },
    { number: 16, name: "An-Nahl", arabic: "النحل", verses: 128, type: "Makkiyah", juz: 14 },
    { number: 17, name: "Al-Isra'", arabic: "الإسراء", verses: 111, type: "Makkiyah", juz: 15 },
    { number: 18, name: "Al-Kahf", arabic: "الكهف", verses: 110, type: "Makkiyah", juz: 15 },
    { number: 19, name: "Maryam", arabic: "مريم", verses: 98, type: "Makkiyah", juz: 16 },
    { number: 20, name: "Taha", arabic: "طه", verses: 135, type: "Makkiyah", juz: 16 },
    { number: 21, name: "Al-Anbiya'", arabic: "الأنبياء", verses: 112, type: "Makkiyah", juz: 17 },
    { number: 22, name: "Al-Hajj", arabic: "الحج", verses: 78, type: "Madaniyah", juz: 17 },
    { number: 23, name: "Al-Mu'minun", arabic: "المؤمنون", verses: 118, type: "Makkiyah", juz: 18 },
    { number: 24, name: "An-Nur", arabic: "النور", verses: 64, type: "Madaniyah", juz: 18 },
    { number: 25, name: "Al-Furqan", arabic: "الفرقان", verses: 77, type: "Makkiyah", juz: 18 },
    { number: 26, name: "Asy-Syu'ara'", arabic: "الشعراء", verses: 227, type: "Makkiyah", juz: 19 },
    { number: 27, name: "An-Naml", arabic: "النمل", verses: 93, type: "Makkiyah", juz: 19 },
    { number: 28, name: "Al-Qasas", arabic: "القصص", verses: 88, type: "Makkiyah", juz: 20 },
    { number: 29, name: "Al-'Ankabut", arabic: "العنكبوت", verses: 69, type: "Makkiyah", juz: 20 },
    { number: 30, name: "Ar-Rum", arabic: "الروم", verses: 60, type: "Makkiyah", juz: 21 },
    { number: 31, name: "Luqman", arabic: "لقمان", verses: 34, type: "Makkiyah", juz: 21 },
    { number: 32, name: "As-Sajdah", arabic: "السجدة", verses: 30, type: "Makkiyah", juz: 21 },
    { number: 33, name: "Al-Ahzab", arabic: "الأحزاب", verses: 73, type: "Madaniyah", juz: 21 },
    { number: 34, name: "Saba'", arabic: "سبأ", verses: 54, type: "Makkiyah", juz: 22 },
    { number: 35, name: "Fatir", arabic: "فاطر", verses: 45, type: "Makkiyah", juz: 22 },
    { number: 36, name: "Yasin", arabic: "يس", verses: 83, type: "Makkiyah", juz: 22 },
    { number: 37, name: "As-Saffat", arabic: "الصافات", verses: 182, type: "Makkiyah", juz: 23 },
    { number: 38, name: "Sad", arabic: "ص", verses: 88, type: "Makkiyah", juz: 23 },
    { number: 39, name: "Az-Zumar", arabic: "الزمر", verses: 75, type: "Makkiyah", juz: 23 },
    { number: 40, name: "Ghafir", arabic: "غافر", verses: 85, type: "Makkiyah", juz: 24 },
    { number: 41, name: "Fussilat", arabic: "فصلت", verses: 54, type: "Makkiyah", juz: 24 },
    { number: 42, name: "Asy-Syura", arabic: "الشورى", verses: 53, type: "Makkiyah", juz: 25 },
    { number: 43, name: "Az-Zukhruf", arabic: "الزخرف", verses: 89, type: "Makkiyah", juz: 25 },
    { number: 44, name: "Ad-Dukhan", arabic: "الدخان", verses: 59, type: "Makkiyah", juz: 25 },
    { number: 45, name: "Al-Jasiyah", arabic: "الجاثية", verses: 37, type: "Makkiyah", juz: 25 },
    { number: 46, name: "Al-Ahqaf", arabic: "الأحقاف", verses: 35, type: "Makkiyah", juz: 26 },
    { number: 47, name: "Muhammad", arabic: "محمد", verses: 38, type: "Madaniyah", juz: 26 },
    { number: 48, name: "Al-Fath", arabic: "الفتح", verses: 29, type: "Madaniyah", juz: 26 },
    { number: 49, name: "Al-Hujurat", arabic: "الحجرات", verses: 18, type: "Madaniyah", juz: 26 },
    { number: 50, name: "Qaf", arabic: "ق", verses: 45, type: "Makkiyah", juz: 26 },
    { number: 51, name: "Az-Zariyat", arabic: "الذاريات", verses: 60, type: "Makkiyah", juz: 26 },
    { number: 52, name: "At-Tur", arabic: "الطور", verses: 49, type: "Makkiyah", juz: 27 },
    { number: 53, name: "An-Najm", arabic: "النجم", verses: 62, type: "Makkiyah", juz: 27 },
    { number: 54, name: "Al-Qamar", arabic: "القمر", verses: 55, type: "Makkiyah", juz: 27 },
    { number: 55, name: "Ar-Rahman", arabic: "الرحمن", verses: 78, type: "Makkiyah", juz: 27 },
    { number: 56, name: "Al-Waqi'ah", arabic: "الواقعة", verses: 96, type: "Makkiyah", juz: 27 },
    { number: 57, name: "Al-Hadid", arabic: "الحديد", verses: 29, type: "Madaniyah", juz: 27 },
    { number: 58, name: "Al-Mujadalah", arabic: "المجادلة", verses: 22, type: "Madaniyah", juz: 28 },
    { number: 59, name: "Al-Hasyr", arabic: "الحشر", verses: 24, type: "Madaniyah", juz: 28 },
    { number: 60, name: "Al-Mumtahanah", arabic: "الممتحنة", verses: 13, type: "Madaniyah", juz: 28 },
    { number: 61, name: "As-Saff", arabic: "الصف", verses: 14, type: "Madaniyah", juz: 28 },
    { number: 62, name: "Al-Jumu'ah", arabic: "الجمعة", verses: 11, type: "Madaniyah", juz: 28 },
    { number: 63, name: "Al-Munafiqun", arabic: "المنافقون", verses: 11, type: "Madaniyah", juz: 28 },
    { number: 64, name: "At-Tagabun", arabic: "التغابن", verses: 18, type: "Madaniyah", juz: 28 },
    { number: 65, name: "At-Talaq", arabic: "الطلاق", verses: 12, type: "Madaniyah", juz: 28 },
    { number: 66, name: "At-Tahrim", arabic: "التحريم", verses: 12, type: "Madaniyah", juz: 28 },
    { number: 67, name: "Al-Mulk", arabic: "الملك", verses: 30, type: "Makkiyah", juz: 29 },
    { number: 68, name: "Al-Qalam", arabic: "القلم", verses: 52, type: "Makkiyah", juz: 29 },
    { number: 69, name: "Al-Haqqah", arabic: "الحاقة", verses: 52, type: "Makkiyah", juz: 29 },
    { number: 70, name: "Al-Ma'arij", arabic: "المعارج", verses: 44, type: "Makkiyah", juz: 29 },
    { number: 71, name: "Nuh", arabic: "نوح", verses: 28, type: "Makkiyah", juz: 29 },
    { number: 72, name: "Al-Jinn", arabic: "الجن", verses: 28, type: "Makkiyah", juz: 29 },
    { number: 73, name: "Al-Muzzammil", arabic: "المزمل", verses: 20, type: "Makkiyah", juz: 29 },
    { number: 74, name: "Al-Muddassir", arabic: "المدثر", verses: 56, type: "Makkiyah", juz: 29 },
    { number: 75, name: "Al-Qiyamah", arabic: "القيامة", verses: 40, type: "Makkiyah", juz: 29 },
    { number: 76, name: "Al-Insan", arabic: "الإنسان", verses: 31, type: "Madaniyah", juz: 29 },
    { number: 77, name: "Al-Mursalat", arabic: "المرسلات", verses: 50, type: "Makkiyah", juz: 29 },
    { number: 78, name: "An-Naba'", arabic: "النبإ", verses: 40, type: "Makkiyah", juz: 30 },
    { number: 79, name: "An-Nazi'at", arabic: "النازعات", verses: 46, type: "Makkiyah", juz: 30 },
    { number: 80, name: "'Abasa", arabic: "عبس", verses: 42, type: "Makkiyah", juz: 30 },
    { number: 81, name: "At-Takwir", arabic: "التكوير", verses: 29, type: "Makkiyah", juz: 30 },
    { number: 82, name: "Al-Infitar", arabic: "الانفطار", verses: 19, type: "Makkiyah", juz: 30 },
    { number: 83, name: "Al-Muthaffifin", arabic: "المطففين", verses: 36, type: "Makkiyah", juz: 30 },
    { number: 84, name: "Al-Insyiqaq", arabic: "الانشقاق", verses: 25, type: "Makkiyah", juz: 30 },
    { number: 85, name: "Al-Buruj", arabic: "البروج", verses: 22, type: "Makkiyah", juz: 30 },
    { number: 86, name: "Ath-Thariq", arabic: "الطارق", verses: 17, type: "Makkiyah", juz: 30 },
    { number: 87, name: "Al-A'la", arabic: "الأعلى", verses: 19, type: "Makkiyah", juz: 30 },
    { number: 88, name: "Al-Ghasyiyah", arabic: "الغاشية", verses: 26, type: "Makkiyah", juz: 30 },
    { number: 89, name: "Al-Fajr", arabic: "الفجر", verses: 30, type: "Makkiyah", juz: 30 },
    { number: 90, name: "Al-Balad", arabic: "البلد", verses: 20, type: "Makkiyah", juz: 30 },
    { number: 91, name: "Asy-Syams", arabic: "الشمس", verses: 15, type: "Makkiyah", juz: 30 },
    { number: 92, name: "Al-Lail", arabic: "الليل", verses: 21, type: "Makkiyah", juz: 30 },
    { number: 93, name: "Adh-Dhuha", arabic: "الضحى", verses: 11, type: "Makkiyah", juz: 30 },
    { number: 94, name: "Asy-Syarh", arabic: "الشرح", verses: 8, type: "Makkiyah", juz: 30 },
    { number: 95, name: "At-Tin", arabic: "التين", verses: 8, type: "Makkiyah", juz: 30 },
    { number: 96, name: "Al-'Alaq", arabic: "العلق", verses: 19, type: "Makkiyah", juz: 30 },
    { number: 97, name: "Al-Qadr", arabic: "القدر", verses: 5, type: "Makkiyah", juz: 30 },
    { number: 98, name: "Al-Bayyinah", arabic: "البينة", verses: 8, type: "Madaniyah", juz: 30 },
    { number: 99, name: "Az-Zalzalah", arabic: "الزلزلة", verses: 8, type: "Madaniyah", juz: 30 },
    { number: 100, name: "Al-'Adiyat", arabic: "العاديات", verses: 11, type: "Makkiyah", juz: 30 },
    { number: 101, name: "Al-Qari'ah", arabic: "القارعة", verses: 11, type: "Makkiyah", juz: 30 },
    { number: 102, name: "At-Takatsur", arabic: "التكاثر", verses: 8, type: "Makkiyah", juz: 30 },
    { number: 103, name: "Al-'Asr", arabic: "العصر", verses: 3, type: "Makkiyah", juz: 30 },
    { number: 104, name: "Al-Humazah", arabic: "الهمزة", verses: 9, type: "Makkiyah", juz: 30 },
    { number: 105, name: "Al-Fil", arabic: "الفيل", verses: 5, type: "Makkiyah", juz: 30 },
    { number: 106, name: "Quraisy", arabic: "قريش", verses: 4, type: "Makkiyah", juz: 30 },
    { number: 107, name: "Al-Ma'un", arabic: "الماعون", verses: 7, type: "Makkiyah", juz: 30 },
    { number: 108, name: "Al-Kautsar", arabic: "الكوثر", verses: 3, type: "Makkiyah", juz: 30 },
    { number: 109, name: "Al-Kafirun", arabic: "الكافرون", verses: 6, type: "Makkiyah", juz: 30 },
    { number: 110, name: "An-Nasr", arabic: "النصر", verses: 3, type: "Madaniyah", juz: 30 },
    { number: 111, name: "Al-Lahab", arabic: "اللهب", verses: 5, type: "Makkiyah", juz: 30 },
    { number: 112, name: "Al-Ikhlas", arabic: "الإخلاص", verses: 4, type: "Makkiyah", juz: 30 },
    { number: 113, name: "Al-Falaq", arabic: "الفلق", verses: 5, type: "Makkiyah", juz: 30 },
    { number: 114, name: "An-Nas", arabic: "الناس", verses: 6, type: "Makkiyah", juz: 30 }
  ],

  // Sample Ayah Bank for fast interactive flashcard & audio testing
  sampleAyahs: {
    "An-Naba'": [
      {
        number: 1,
        arabic: "عَمَّ يَتَسَآءَلُونَ",
        transliteration: "'Amma yatasaa-aluun",
        translation: "Tentang apakah mereka saling bertanya-tanya?",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078001.mp3"
      },
      {
        number: 2,
        arabic: "عَنِ ٱلنَّبَإِ ٱلْعَظِيمِ",
        transliteration: "'Anin-naba-il 'azhiim",
        translation: "Tentang berita yang besar (hari berbangkit),",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078002.mp3"
      },
      {
        number: 3,
        arabic: "ٱلَّذِى هُمْ فِيهِ مُخْتَلِفُونَ",
        transliteration: "Alladzii hum fiihi mukhtalifuun",
        translation: "yang dalam hal itu mereka berselisih.",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078003.mp3"
      },
      {
        number: 4,
        arabic: "كَلَّا سَيَعْلَمُونَ",
        transliteration: "Kallaa saya'lamuun",
        translation: "Sekali-kali tidak! Kelak mereka akan mengetahui,",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078004.mp3"
      },
      {
        number: 5,
        arabic: "ثُمَّ كَلَّا سَيَعْلَمُونَ",
        transliteration: "Tsumma kallaa saya'lamuun",
        translation: "kemudian sekali-kali tidak! Kelak mereka akan mengetahui.",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078005.mp3"
      },
      {
        number: 6,
        arabic: "أَلَمْ نَجْعَلِ ٱلْأَرْضَ مِهَٰدًا",
        transliteration: "Alam naj'alil ardha mihaadaa",
        translation: "Bukankah Kami telah menjadikan bumi sebagai hamparan?",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/078006.mp3"
      }
    ],
    "An-Nazi'at": [
      {
        number: 1,
        arabic: "وَٱلنَّٰزِعَٰتِ غَرْقًا",
        transliteration: "Wan-naazi'aati gharqaa",
        translation: "Demi (malaikat) yang mencabut (nyawa) dengan keras,",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/079001.mp3"
      },
      {
        number: 2,
        arabic: "وَٱلنَّٰشِطَٰتِ نَشْطًا",
        transliteration: "Wan-naasyithaati nasythaa",
        translation: "demi (malaikat) yang mencabut (nyawa) dengan lemah lembut,",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/079002.mp3"
      },
      {
        number: 3,
        arabic: "وَٱلسَّٰبِحَٰتِ سَبْحًا",
        transliteration: "Was-saabihaati sabhaa",
        translation: "demi (malaikat) yang turun dari langit dengan cepat,",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/079003.mp3"
      }
    ],
    "'Abasa": [
      {
        number: 1,
        arabic: "عَبَسَ وَتَوَلَّىٰٓ",
        transliteration: "'Abasa wa tawallaa",
        translation: "Dia (Muhammad) berwajah masam dan berpaling,",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/080001.mp3"
      },
      {
        number: 2,
        arabic: "أَن جَآءَهُ ٱلْأَعْمَىٰ",
        transliteration: "An jaa-ahul a'maa",
        translation: "karena seorang buta telah datang kepadanya (Ibnu Ummi Maktum).",
       audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/080002.mp3"
      }
    ],
    "Al-Ikhlas": [
      {
        number: 1,
        arabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        transliteration: "Qul huwallahu ahad",
        translation: "Katakanlah (Muhammad), 'Dialah Allah, Yang Maha Esa.'",
         audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/080001.mp3"
      },
      {
        number: 2,
        arabic: "ٱللَّهُ ٱلصَّمَدُ",
        transliteration: "Allahus-samad",
        translation: "Allah tempat meminta segala sesuatu.",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/080002.mp3"
      },
      {
        number: 3,
        arabic: "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        transliteration: "Lam yalid wa lam yuulad",
        translation: "(Allah) tidak beranak dan tidak pula diperanakkan,",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/112003.mp3"
      },
      {
        number: 4,
        arabic: "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ",
        transliteration: "Wa lam yakul lahu kufuwan ahad",
        translation: "dan tidak ada sesuatu yang setara dengan Dia.",
        audio: "https://cdn.equran.id/audio-partial/Misyari-Rasyid-Al-Afasi/112004.mp3"
      }
    ]
  },

  // Helper untuk mencari data surah
  getSurahByName: function(name) {
    if (!name) return null;
    const cleanName = name.replace(/['`’]/g, '').toLowerCase();
    return this.surahs.find(s => s.name.replace(/['`’]/g, '').toLowerCase() === cleanName) || this.surahs[0];
  },

  // Helper untuk mendapatkan ayat
  getAyah: function(surahName, ayahNum) {
    const list = this.sampleAyahs[surahName] || this.sampleAyahs["An-Naba'"];
    const found = list.find(a => a.number === Number(ayahNum));
    return found || list[0];
  }
};
// Helper async: ambil 1 ayat apa pun.
  // Mode Live -> minta ke backend (baca Cache_Ayat, miss -> fetch equran.id lalu cache).
  // Mode Demo / gagal -> fallback ke bank sampel lokal.
  // @param surahNum nomor surah (1-114). @returns { arabic, audio, translation }
  getAyahLive: async function(surahNum, ayahNum) {
    const num = Number(surahNum) || 78;
    const ayah = Math.max(1, Number(ayahNum) || 1);

    if (typeof API !== 'undefined' && typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DATA_MODE === 'api') {
      try {
        const res = await API.request('get_ayah_content', { surah: num, ayah: ayah });
        if (res && res.success && res.arabic) {
          return { arabic: res.arabic, audio: res.audio || '', translation: res.translation || '' };
        }
      } catch (e) {
        console.warn('[QURAN_DATA] get_ayah_content gagal, pakai bank lokal:', e.message);
      }
    }

    const meta = this.surahs.find(s => s.number === num);
    const local = this.getAyah(meta ? meta.name : "An-Naba'", ayah);
    return { arabic: local.arabic, audio: local.audio || '', translation: local.translation || '' };
  }
};
