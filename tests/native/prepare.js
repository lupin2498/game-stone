'use strict';
/* Chuẩn bị bản build "có tự kiểm tra" cho CI: chèn selftest.js vào app/www, bật cấu hình Firebase giả (để online.js được nạp
   và chạy thử trong WebView thật), bật log console trong mọi kiểu build. CHỈ chạy trên CI (sửa file trong app/). */
const fs = require('fs');
const path = require('path');
if (!process.env.CI && !process.argv.includes('--force')) { console.error('Chỉ dùng trên CI (thêm --force nếu chắc chắn).'); process.exit(1); }
const ROOT = path.resolve(__dirname, '..', '..'), WWW = path.join(ROOT, 'app', 'www');
if (!fs.existsSync(path.join(WWW, 'index.html'))) { console.error('Chưa có app/www — chạy "node app/scripts/copy-web.js" trước.'); process.exit(1); }
fs.copyFileSync(path.join(__dirname, 'selftest.js'), path.join(WWW, 'selftest.js'));
let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
if (!html.includes('selftest.js')) html = html.replace('</body>', '<script src="selftest.js"></script>\n</body>');
fs.writeFileSync(path.join(WWW, 'index.html'), html);
fs.writeFileSync(path.join(WWW, 'firebase-config.js'),
  "window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-stone.firebaseapp.com',projectId:'demo-stone',appId:'1:1:web:1'};\nwindow.STONE_ONLINE={appScheme:'com.luoin.stonebalance'};\n");
const cfgFile = path.join(ROOT, 'app', 'capacitor.config.json');
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
cfg.loggingBehavior = 'production';          // in console.log ra log hệ thống ở cả bản Release
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
console.log('Đã chèn selftest vào app/www và bật log.');
