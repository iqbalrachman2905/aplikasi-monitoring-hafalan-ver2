/**
 * ============================================================================
 * CEK SINTAKS SEMUA MODUL FRONTEND
 * ============================================================================
 * Menjalankan parse (new Function) pada setiap file js/*.js agar kesalahan
 * sintaks terdeteksi dini tanpa perlu membuka browser.
 * Jalankan: `npm run check`
 */

const fs = require('fs');
const path = require('path');

const JS_DIR = path.resolve(__dirname, '..', 'quran-retention-app', 'js');
const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort();

let failed = 0;
for (const file of files) {
  const full = path.join(JS_DIR, file);
  const src = fs.readFileSync(full, 'utf8');
  try {
    // eslint-disable-next-line no-new-func
    new Function(src);
    console.log(`  ✓ ${file}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${file} -> ${e.message}`);
  }
}

console.log('');
if (failed > 0) {
  console.error(`${failed} file gagal diparse.`);
  process.exit(1);
}
console.log(`Semua ${files.length} file JS valid.`);
