'use strict';
/* Chạy mọi file *.test.js / *.test.mjs trong thư mục chỉ định, in bảng tổng kết.
   Dùng: node run.js game | e2e | <file...>   (ONLY=<chuỗi> để lọc theo tên file) */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let files = [];
for (const a of (args.length ? args : ['game'])) {
  const p = path.resolve(__dirname, a);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory())
    files.push(...fs.readdirSync(p).filter(f => /\.test\.m?js$/.test(f)).sort().map(f => path.join(p, f)));
  else files.push(p);
}
if (process.env.ONLY) files = files.filter(f => f.includes(process.env.ONLY));

const summary = [];
let failed = 0;
for (const f of files) {
  console.log('\n━━━ ' + path.relative(__dirname, f) + ' ━━━');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [f], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
  process.stdout.write(r.stdout || '');
  const out = r.stdout || '';
  const c = s => (out.match(new RegExp('^' + s + ' \\|', 'gm')) || []).length;
  const row = { file: path.relative(__dirname, f), pass: c('PASS'), fail: c('FAIL'), skip: c('SKIP'), sec: ((Date.now() - t0) / 1000).toFixed(1), code: r.status };
  if (r.status !== 0 && row.fail === 0) row.fail = 1;       // script chết giữa chừng
  failed += row.fail; summary.push(row);
}
console.log('\n════════ TỔNG KẾT ════════');
for (const r of summary) console.log((r.fail ? '✗' : '✓') + ' ' + r.file.padEnd(34) + ' pass=' + String(r.pass).padStart(3) + ' fail=' + String(r.fail).padStart(2) + ' skip=' + String(r.skip).padStart(2) + '  ' + r.sec + 's');
const tot = k => summary.reduce((a, r) => a + r[k], 0);
console.log('TỔNG: ' + tot('pass') + ' PASS, ' + tot('fail') + ' FAIL, ' + tot('skip') + ' SKIP');
process.exit(failed ? 1 : 0);
