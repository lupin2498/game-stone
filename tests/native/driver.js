'use strict';
/* Dùng chung cho android-run.js / ios-run.js: đọc các dòng "[SELFTEST] TAG json" từ file log đang được ghi, ghi nhận PASS/FAIL. */
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const failed = [], notes = [];
let passed = 0;
function rec(name, ok, detail) {
  let d = detail === undefined ? '' : ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
  if (d.length > 700) d = d.slice(0, 700) + '…';
  const line = (ok ? 'PASS' : 'FAIL') + ' | ' + name + d;
  if (ok) passed++; else failed.push(line.replace(/\s+/g, ' '));
  console.log(line);
  return ok;
}
/* ghi chú (không tính đạt/trượt) — in ngay và nhắc lại trong phần tóm tắt cuối */
function note(msg) { msg = String(msg).replace(/\s+/g, ' ').slice(0, 600); notes.push(msg); console.log('# ' + msg); }
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
/* tóm tắt ảnh chụp màn hình; quiet = không in lưới màu */
function samplePng(file, quiet) {
  const args = [path.join(__dirname, 'png-sample.js'), file, '9']; if (quiet) args.push('q');
  let o = '', flat = false;
  try { o = execFileSync(process.execPath, args, { encoding: 'utf8' }); }
  catch (e) { o = String(e.stdout || e.message); flat = e.status === 2; }      // mã 2 = ảnh gần như một màu (app không vẽ được gì)
  console.log(o.trim());
  const m = o.match(/TOMTAT (.*)/); if (!m) return null;
  const s = JSON.parse(m[1]); if (flat) s.mot_mau = true;
  return s;
}
/* kiểm tra ảnh: nếu trượt thì in thêm lưới màu để nhìn được trong log */
function checkShot(name, file, pred) {
  if (!file) return rec(name, false, 'không chụp được ảnh màn hình');
  const s = samplePng(file, true), ok = !!s && !s.mot_mau && pred(s);
  if (!ok) samplePng(file, false);
  return rec(name, ok, s);
}
/* các kiểm tra chung cho RESULT của selftest */
function checkResult(r, platform) {
  rec('app khởi động, game sẵn sàng trong WebView thật', !!(r && r.ready && r.native && r.platform === platform), r && { platform: r.platform, native: r.native, ua: r.ua, size: r.size });
  if (!r || !r.ready) return;
  // Máy ảo CI vẽ bằng CPU nên fps rất thấp: chỉ đòi vòng lặp game thật sự chạy (biến thời gian của game tăng) và canvas có hình.
  rec('vòng lặp game chạy và canvas vẽ được (trăng sáng, trời xanh đậm)', r.loop >= 2 && !r.frameErr && Array.isArray(r.pixels.moon) && r.pixels.moon[0] > 180 && Array.isArray(r.pixels.sky) && r.pixels.sky[2] >= r.pixels.sky[0],
    { fps: r.fps, frameGame: r.loop, mocRaf: r.rafTs, trongMs: r.loopMs, frameErr: r.frameErr, pixels: r.pixels });
  const e = r.early;
  if (e && e.game < 2) note('2 giây đầu sau khi mở app: rAF được gọi ' + e.raf + ' lần nhưng chỉ có ' + e.ts + ' mốc thời gian khác nhau, game ghi nhận ' + e.game +
    ' frame — WebView chưa cấp khung hình thật (máy ảo còn đang dựng cửa sổ); sau đó game chạy bình thường');
  if (r.fps < 5) note('fps trên máy ảo thấp (' + r.fps + ') — máy ảo CI không có GPU, không phản ánh máy thật');
  rec('chơi thử 3 viên: tính điểm, vật lý hữu hạn, màn kết thúc hiện', r.play.score >= 1 && r.play.finite && r.overShown, r.play);
  rec('lưu kỷ lục vào bộ nhớ máy', String(r.stored) !== 'ERR' && +r.stored >= 1, { stored: r.stored });
  rec('không đăng ký service worker trong app', r.sw === 0 || r.sw === -1, { sw: r.sw });
  rec('module đăng nhập (online.js + Firebase) nạp và khởi tạo được trong WebView', r.online.configured && r.online.api && r.online.known && r.online.native && !r.online.failed, r.online);
  const s = r.safe, top = s.varTop !== 9999 ? s.varTop : (s.envTop !== 9999 ? s.envTop : 0);
  rec('HUD né vùng an toàn (status bar / tai thỏ)', Math.abs(r.safe.hudTop - (top + 12)) <= 2, r.safe);
  rec('không có lỗi JS khi chạy', (r.errors || []).length === 0, r.errors);
}
/* ---- hàm thuần cho Android (có test ở tests/game/08) ---- */
/* dòng mCurrentFocus của "dumpsys window": đúng là Activity của game, không phải hộp thoại hệ thống đè lên */
function appHasFocus(raw, pkg) { return new RegExp('mCurrentFocus=Window\\{[^}]*\\s' + pkg.replace(/\./g, '\\.') + '/').test(raw); }
/* XML của "uiautomator dump" -> danh sách nút/chữ kèm toạ độ tâm */
function parseUi(xml) {
  const nodes = [], re = /<node\b([^>]*)>/g; let m;
  while ((m = re.exec(String(xml)))) {
    const a = m[1], g = k => { const x = a.match(new RegExp('(?:^|\\s)' + k + '="([^"]*)"')); return x ? x[1].replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') : ''; };
    const b = g('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    nodes.push({ text: g('text'), id: g('resource-id'), pkg: g('package'), clickable: g('clickable') === 'true', x: b ? Math.round((+b[1] + +b[3]) / 2) : 0, y: b ? Math.round((+b[2] + +b[4]) / 2) : 0 });
  }
  return nodes;
}
/* nút nên bấm để gạt hộp thoại hệ thống (ANR "isn't responding" / "keeps stopping"): ưu tiên Wait để không giết tiến trình nào */
function pickDialogButton(nodes) {
  return nodes.find(n => /:id\/aerr_wait$/.test(n.id)) || nodes.find(n => /^(wait|chờ|đợi)$/i.test(n.text)) ||
    nodes.find(n => /:id\/aerr_close$/.test(n.id)) || nodes.find(n => /^(close app|đóng ứng dụng|ok|got it)$/i.test(n.text)) || null;
}
/* phần tóm tắt in ở CUỐI log (để đọc được chỉ với vài chục dòng cuối) */
function summary(title, extra) {
  console.log('\n===== TÓM TẮT ' + title + ' =====');
  if (extra) console.log(extra);
  notes.forEach(n => console.log('GHI CHÚ | ' + n));
  failed.forEach(f => console.log(f.length > 420 ? f.slice(0, 420) + '…' : f));
  console.log(title + ': ' + passed + ' PASS, ' + failed.length + ' FAIL' + (failed.length ? '' : ' — tất cả PASS'));
}
module.exports = { sleep, rec, note, sh, events, waitTag, samplePng, checkShot, checkResult, summary, appHasFocus, parseUi, pickDialogButton, failCount: () => failed.length };
