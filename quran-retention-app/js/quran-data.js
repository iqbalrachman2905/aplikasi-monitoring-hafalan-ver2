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
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078001.mp3"
      },
      {
        number: 2,
        arabic: "عَنِ ٱلنَّبَإِ ٱلْعَظِيمِ",
        transliteration: "'Anin-naba-il 'azhiim",
        translation: "Tentang berita yang besar (hari berbangkit),",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078002.mp3"
      },
      {
        number: 3,
        arabic: "ٱلَّذِى هُمْ فِيهِ مُخْتَلِفُونَ",
        transliteration: "Alladzii hum fiihi mukhtalifuun",
        translation: "yang dalam hal itu mereka berselisih.",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078003.mp3"
      },
      {
        number: 4,
        arabic: "كَلَّا سَيَعْلَمُونَ",
        transliteration: "Kallaa saya'lamuun",
        translation: "Sekali-kali tidak! Kelak mereka akan mengetahui,",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078004.mp3"
      },
      {
        number: 5,
        arabic: "ثُمَّ كَلَّا سَيَعْلَمُونَ",
        transliteration: "Tsumma kallaa saya'lamuun",
        translation: "kemudian sekali-kali tidak! Kelak mereka akan mengetahui.",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078005.mp3"
      },
      {
        number: 6,
        arabic: "أَلَمْ نَجْعَلِ ٱلْأَرْضَ مِهَٰدًا",
        transliteration: "Alam naj'alil ardha mihaadaa",
        translation: "Bukankah Kami telah menjadikan bumi sebagai hamparan?",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/078006.mp3"
      }
    ],
    "An-Nazi'at": [
      {
        number: 1,
        arabic: "وَٱلنَّٰزِعَٰتِ غَرْقًا",
        transliteration: "Wan-naazi'aati gharqaa",
        translation: "Demi (malaikat) yang mencabut (nyawa) dengan keras,",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/079001.mp3"
      },
      {
        number: 2,
        arabic: "وَٱلنَّٰشِطَٰتِ نَشْطًا",
        transliteration: "Wan-naasyithaati nasythaa",
        translation: "demi (malaikat) yang mencabut (nyawa) dengan lemah lembut,",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/079002.mp3"
      },
      {
        number: 3,
        arabic: "وَٱلسَّٰبِحَٰتِ سَبْحًا",
        transliteration: "Was-saabihaati sabhaa",
        translation: "demi (malaikat) yang turun dari langit dengan cepat,",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/079003.mp3"
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
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/080002.mp3"
      }
    ],
    "Al-Ikhlas": [
      {
        number: 1,
        arabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        transliteration: "Qul huwallahu ahad",
        translation: "Katakanlah (Muhammad), 'Dialah Allah, Yang Maha Esa.'",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/112001.mp3"
      },
      {
        number: 2,
        arabic: "ٱللَّهُ ٱلصَّمَدُ",
        transliteration: "Allahus-samad",
        translation: "Allah tempat meminta segala sesuatu.",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/112002.mp3"
      },
      {
        number: 3,
        arabic: "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        transliteration: "Lam yalid wa lam yuulad",
        translation: "(Allah) tidak beranak dan tidak pula diperanakkan,",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/112003.mp3"
      },
      {
        number: 4,
        arabic: "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ",
        transliteration: "Wa lam yakul lahu kufuwan ahad",
        translation: "dan tidak ada sesuatu yang setara dengan Dia.",
        audio: "https://equran.nos.wjv-1.neo.id/audio-partial/Misyari-Rasyid-Al-Afasi/112004.mp3"
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
