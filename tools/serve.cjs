/**
 * ============================================================================
 * DEV SERVER STATIS (TANPA DEPENDENCY)
 * ============================================================================
 * Aplikasi ini murni HTML + CSS + JS (tanpa build step), jadi cukup disajikan
 * sebagai file statis. Jalankan: `npm start` (atau `node tools/serve.cjs`).
 *
 * Fitur:
 *  - Menyajikan folder quran-retention-app/ sebagai root web.
 *  - MIME type lengkap (html, css, js, json, svg, md, gs).
 *  - Redirect "/" -> "/index.html" dan fallback 404 yang jelas.
 *  - Bila port default terpakai, otomatis mencari port berikutnya.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'quran-retention-app');
const START_PORT = Number(process.env.PORT) || 8080;
// Host binding dev server. Default 0.0.0.0 agar bisa diakses dari perangkat
// lain / pratinjau jarak jauh. Set HOST=127.0.0.1 bila ingin terbatas lokal.
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PORT_TRIES = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.md': 'text/plain; charset=utf-8',
  '.gs': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}

function notFound(res, urlPath) {
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<title>404 — File tidak ditemukan</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:640px;margin:auto">
<h1>404</h1>
<p>File <code>${String(urlPath).replace(/[<>&]/g, '')}</code> tidak ditemukan.</p>
<p>Root server ini: <code>quran-retention-app/</code></p>
<p>Buka <a href="/index.html">/index.html</a> untuk memulai aplikasi.</p>
</body></html>`;
  send(res, 404, html, { 'Content-Type': 'text/html; charset=utf-8' });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // Cegah path traversal keluar dari ROOT.
  const resolved = path.resolve(ROOT, '.' + urlPath);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res, urlPath);

    const ext = path.extname(resolved).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';

    fs.createReadStream(resolved)
      .on('error', () => notFound(res, urlPath))
      .pipe(res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }));
  });
});

let port = START_PORT;
let tries = 0;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && tries < MAX_PORT_TRIES) {
    tries++;
    port++;
    console.log(`Port ${port - 1} terpakai, mencoba port ${port}...`);
    server.listen(port, HOST);
  } else {
    console.error('Gagal menjalankan server:', err.message);
    process.exit(1);
  }
});

server.on('listening', () => {
  console.log('');
  console.log('  📖 Mutaba\'ah Hafalan — server lokal aktif');
  console.log(`  ➜  http://localhost:${port}/  (bind: ${HOST})`);
  console.log(`  📂 Menyajikan: ${ROOT}`);
  console.log('  Tekan Ctrl+C untuk berhenti.');
  console.log('');
});

server.listen(port, HOST);
