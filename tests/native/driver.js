'use strict';
/* Dùng chung cho android-run.js / ios-run.js: đọc các dòng "[SELFTEST] TAG json" từ file log đang được ghi, ghi nhận PASS/FAIL. */
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function rec(name, ok, detail) {
  if (!ok) fails++;
  let d = detail === undefined ? '' : ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
  if (d.length > 700) d = d.slice(0, 700) + '…';
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + d);
  return ok;
}
function sh(cmd, opts) {
  try { return execSync(cmd, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, maxBuffer: 64 * 1024 * 1024 }, opts || {})).trim(); }
  catch (e) { return 'ERR: ' + String((e.stderr || '') + (e.stdout || '') + e.message).trim().slice(0, 400); }
}
function events(logFile) {
  let txt = ''; try { txt = fs.readFileSync(logFile, 'utf8'); } catch (e) {}
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const i = line.indexOf('[SELFTEST] '); if (i < 0) continue;
    const m = line.slice(i + 11).match(/^(\S+) (.*)$/); if (!m) continue;
    let v; try { v = JSON.parse(m[2]); } catch (e) { v = m[2]; }
    out.push({ tag: m[1], v });
  }
  return out;
}
/* chờ sự kiện thứ n (mặc định 1) có tag (và thoả pred nếu có) trong tối đa sec giây */
async function waitTag(logFile, tag, pred, sec, nth) {
  const t0 = Date.now();
  while (Date.now() - t0 < sec * 1000) {
    const hit = events(logFile).filter(e => e.tag === tag && (!pred || pred(e.v)));
    if (hit.length >= (nth || 1)) return hit[(nth || 1) - 1].v;
    await sleep(500);
  }
  return null;
}
function samplePng(file) {
  try { const o = execFileSync(process.execPath, [path.join(__dirname, 'png-sample.js'), file, '9'], { encoding: 'utf8' }); console.log(o.trim()); const m = o.match(/TOMTAT (.*)/); return m ? JSON.parse(m[1]) : null; }
  catch (e) { console.log(String(e.stdout || e.message).trim()); return null; }
}
/* các kiểm tra chung cho RESULT của selftest */
function checkResult(r, platform) {
  rec('app khởi động, game sẵn sàng trong WebView thật', !!(r && r.ready && r.native && r.platform === platform), r && { platform: r.platform, native: r.native, ua: r.ua, size: r.size });
  if (!r || !r.ready) return;
  rec('vòng lặp game chạy (fps > 5) và canvas vẽ được (trăng sáng, trời xanh đậm)', r.fps > 5 && Array.isArray(r.pixels.moon) && r.pixels.moon[0] > 180 && Array.isArray(r.pixels.sky) && r.pixels.sky[2] >= r.pixels.sky[0], { fps: r.fps, pixels: r.pixels });
  rec('chơi thử 3 viên: tính điểm, vật lý hữu hạn, màn kết thúc hiện', r.play.score >= 1 && r.play.finite && r.overShown, r.play);
  rec('lưu kỷ lục vào bộ nhớ máy', String(r.stored) !== 'ERR' && +r.stored >= 1, { stored: r.stored });
  rec('không đăng ký service worker trong app', r.sw === 0 || r.sw === -1, { sw: r.sw });
  rec('module đăng nhập (online.js + Firebase) nạp và khởi tạo được trong WebView', r.online.configured && r.online.api && r.online.known && r.online.native && !r.online.failed, r.online);
  const s = r.safe, top = s.varTop !== 9999 ? s.varTop : (s.envTop !== 9999 ? s.envTop : 0);
  rec('HUD né vùng an toàn (status bar / tai thỏ)', Math.abs(r.safe.hudTop - (top + 12)) <= 2, r.safe);
  rec('không có lỗi JS khi chạy', (r.errors || []).length === 0, r.errors);
}
module.exports = { sleep, rec, sh, events, waitTag, samplePng, checkResult, failCount: () => fails };
