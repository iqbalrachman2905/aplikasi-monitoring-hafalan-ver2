/**
 * ============================================================================
 * CEK SINTAKS BACKEND (backend/Code.gs)
 * ============================================================================
 * Code.gs memakai API Google Apps Script, tetapi sintaksnya bisa diparse Node.
 * Jalankan: `node tools/check-backend.cjs` (juga dipanggil oleh `npm run check`).
 */

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'quran-retention-app', 'backend', 'Code.gs');

try {
  const src = fs.readFileSync(FILE, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src);
  console.log(`  ✓ backend/Code.gs (${src.split('\n').length} baris)`);
} catch (e) {
  console.error(`  ✗ backend/Code.gs -> ${e.message}`);
  process.exit(1);
}
