'use strict';
/* Tóm tắt một ảnh chụp màn hình thành chữ để đọc trong log CI: lưới màu trung bình + dải trên cùng/dưới cùng.
   Dùng: node png-sample.js <file.png> [cols] */
const fs = require('fs');
const { PNG } = require('pngjs');
const file = process.argv[2], cols = +(process.argv[3] || 9);
const png = PNG.sync.read(fs.readFileSync(file));
const { width: w, height: h, data } = png;
const avg = (x0, y0, x1, y1) => { let r = 0, g = 0, b = 0, n = 0; const sx = Math.max(1, Math.floor((x1 - x0) / 24)), sy = Math.max(1, Math.floor((y1 - y0) / 24));
  for (let y = Math.floor(y0); y < y1; y += sy) for (let x = Math.floor(x0); x < x1; x += sx) { const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  return [r / n | 0, g / n | 0, b / n | 0]; };
const hex = c => c.map(v => v.toString(16).padStart(2, '0')).join('');
const lum = c => Math.round(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
const rows = Math.round(cols * h / w);
console.log(`ẢNH ${file}: ${w}x${h}`);
for (let j = 0; j < rows; j++) { let line = ''; for (let i = 0; i < cols; i++) line += hex(avg(i * w / cols, j * h / rows, (i + 1) * w / cols, (j + 1) * h / rows)) + ' '; console.log('  ' + line); }
const top = avg(0, 0, w, h * 0.025), bottom = avg(0, h * 0.985, w, h), all = avg(0, 0, w, h);
let white = 0, total = 0; for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const i = (y * w + x) * 4; total++; if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++; }
const out = { dai_tren: hex(top), sang_tren: lum(top), dai_duoi: hex(bottom), sang_duoi: lum(bottom), sang_tb: lum(all), ti_le_trang: +(white / total).toFixed(3) };
console.log('TOMTAT ' + JSON.stringify(out));
// Thoát mã 2 nếu ảnh gần như một màu (app trắng/đen trơn = không vẽ được gì)
let varSum = 0; const cells = []; for (let j = 0; j < 12; j++) for (let i = 0; i < 6; i++) cells.push(lum(avg(i * w / 6, j * h / 12, (i + 1) * w / 6, (j + 1) * h / 12)));
const m = cells.reduce((a, b) => a + b, 0) / cells.length; for (const c of cells) varSum += (c - m) * (c - m);
const sd = Math.sqrt(varSum / cells.length); console.log('DOLECH ' + sd.toFixed(1));
process.exit(sd < 2 ? 2 : 0);
