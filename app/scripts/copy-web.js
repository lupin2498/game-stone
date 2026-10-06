/* Sao chép game (ở gốc repo) vào app/www/ để Capacitor đóng gói */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const www = path.join(__dirname, '..', 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(path.join(www, 'icons'), { recursive: true });
fs.copyFileSync(path.join(root, 'stone-balance.html'), path.join(www, 'index.html'));
for (const f of ['manifest.webmanifest', 'sw.js', 'online.js', 'firebase-config.js']) {
  fs.copyFileSync(path.join(root, f), path.join(www, f));
}
for (const f of fs.readdirSync(path.join(root, 'icons'))) {
  fs.copyFileSync(path.join(root, 'icons', f), path.join(www, 'icons', f));
}
console.log('www/ updated from', root);
