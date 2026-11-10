'use strict';
/* Máy chủ file tĩnh nhỏ gọn cho test (không cache, giống hosting thật ở chỗ / -> index.html) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serve(dir, port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port || 0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port + '/';
      resolve({ url, port: server.address().port, close: () => new Promise(r => server.close(r)) });
    });
  });
}
/* Dựng bản sao thư mục site (như build-site.sh) vào dest; trả về dest */
function buildSite(root, dest, overrides) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'icons'), { recursive: true });
  fs.copyFileSync(path.join(root, 'stone-balance.html'), path.join(dest, 'index.html'));
  for (const f of ['stone-balance.html', 'auth.html', 'online.js', 'firebase-config.js', 'manifest.webmanifest', 'sw.js'])
    fs.copyFileSync(path.join(root, f), path.join(dest, f));
  for (const f of fs.readdirSync(path.join(root, 'icons'))) fs.copyFileSync(path.join(root, 'icons', f), path.join(dest, 'icons', f));
  for (const k of Object.keys(overrides || {})) fs.writeFileSync(path.join(dest, k), overrides[k]);
  return dest;
}
module.exports = { serve, buildSite };
