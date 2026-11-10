'use strict';
/* CI: cài APK (bản có selftest) lên Android emulator rồi lái bằng adb. Dùng: node android-run.js <app-debug.apk> */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const D = require('./driver');
const APK = process.argv[2], PKG = 'com.luoin.stonebalance';
const OUT = path.join(__dirname, '..', '.out', 'android'); fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'logcat.txt');
const adb = a => D.sh('adb ' + a);
const shot = name => { try { fs.writeFileSync(path.join(OUT, name), execSync('adb exec-out screencap -p', { maxBuffer: 64 * 1024 * 1024, timeout: 60000 })); return path.join(OUT, name); } catch (e) { return null; } };
const resumed = () => D.sh(`adb shell "dumpsys activity activities | grep -E 'ResumedActivity' | head -3"`);

/* cửa sổ đang nhận phím/chạm; onApp = đúng là Activity của game (không phải hộp thoại hệ thống đè lên) */
function focus() {
  const raw = D.sh(`adb shell "dumpsys window | grep -E 'mCurrentFocus=' | head -2"`).replace(/\s+/g, ' ');
  return { raw, onApp: D.appHasFocus(raw, PKG), dialog: /Not Responding|Application Error/.test(raw) };
}
/* gạt một hộp thoại hệ thống (ANR "isn't responding" / "keeps stopping"…): ưu tiên nút Wait, không bao giờ gửi phím Back */
function dismissOnce(label, f) {
  const nodes = D.parseUi(D.sh(`adb shell "uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml"`, { timeout: 90000 }));
  const texts = nodes.filter(n => n.text).map(n => n.text).join(' | ').slice(0, 260);
  const btn = D.pickDialogButton(nodes);
  D.note(`[${label}] game không giữ focus: ${f.raw.replace(/mCurrentFocus=/g, '').slice(0, 150)} — trên màn hình: ${texts || '(không đọc được)'} — ${btn ? 'bấm "' + btn.text + '"' : 'gửi CLOSE_SYSTEM_DIALOGS'}`);
  if (btn) adb(`shell input tap ${btn.x} ${btn.y}`); else adb('shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS');
}
/* bảo đảm game đang ở trước mặt và nhận được phím/chạm; had = đã phải gạt hộp thoại */
async function clearDialogs(label) {
  let had = false;
  for (let i = 0; i < 6; i++) {
    const f = focus();
    if (f.onApp) return { ok: true, had };
    if (/mCurrentFocus=null/.test(f.raw) && i < 2) { await D.sleep(1500); continue; }     // đang chuyển cửa sổ
    had = true;
    dismissOnce(label, f);
    if (i >= 2 && !focus().onApp && !focus().dialog) adb(`shell am start -n ${PKG}/.MainActivity`);
    await D.sleep(2000);
  }
  const f = focus();
  return { ok: f.onApp, had, raw: f.raw };
}
/* chờ máy ảo "nguội" sau khi boot (API mới + Google APIs khởi động rất nặng, dễ sinh hộp thoại "System UI isn't responding") */
async function settle() {
  const t0 = Date.now(); let load = '', f = { raw: '' };
  while (Date.now() - t0 < 150000) {
    load = adb('shell cat /proc/loadavg'); f = focus();
    if (f.dialog) dismissOnce('trước khi cài', f);
    else if (parseFloat(load) < 3 && /mCurrentFocus=Window\{/.test(f.raw) && Date.now() - t0 > 8000) break;
    await D.sleep(4000);
  }
  console.log(`# máy ảo trước khi cài: chờ ${Math.round((Date.now() - t0) / 1000)}s, loadavg ${load.split(' ').slice(0, 3).join(' ')}, focus ${f.raw.replace(/mCurrentFocus=/g, '').slice(0, 110)}`);
}

(async () => {
  console.log('# thiết bị: Android ' + adb('shell getprop ro.build.version.release') + ' (API ' + adb('shell getprop ro.build.version.sdk') + '), WebView: ' +
    D.sh(`adb shell "dumpsys webviewupdate | grep -i 'Current WebView package' | head -1"`).replace(/\s+/g, ' '));
  await settle();
  adb('logcat -c');
  const fd = fs.openSync(LOG, 'w');
  const lc = spawn('adb', ['logcat', '-v', 'brief'], { stdio: ['ignore', fd, fd] });
  const inst = adb(`install -r "${APK}"`);
  D.rec('cài APK', /Success/.test(inst), inst.slice(-200));
  console.log('# gói: ' + D.sh(`adb shell "dumpsys package ${PKG} | grep -E 'versionName|versionCode' | head -2"`).replace(/\s+/g, ' '));
  adb(`shell am start -W -n ${PKG}/.MainActivity`);

  const r = await D.waitTag(LOG, 'RESULT', null, 300);
  D.checkResult(r, 'android');
  if (!r) { console.log(D.sh(`tail -n 60 "${LOG}"`)); const s = shot('0-khong-co-ket-qua.png'); if (s) D.samplePng(s); }

  if (r && r.ready) {
    // chạm thật
    if (await D.waitTag(LOG, 'PHASE', v => v === 'touch-ready', 60)) {
      await D.sleep(700);
      const m = adb('shell wm size').match(/(\d+)x(\d+)\s*$/m); const cx = m ? Math.round(+m[1] / 2) : 540, cy = m ? Math.round(+m[2] * 0.45) : 1000;
      let t = null, foc = null;
      for (let a = 1; a <= 3 && !t; a++) {
        foc = await clearDialogs('chạm'); await D.sleep(400);
        adb(`shell input tap ${cx} ${cy}`);
        t = await D.waitTag(LOG, 'TOUCH', null, 22);
      }
      D.rec('chạm thật trên màn hình thả được đá (sự kiện tin cậy từ hệ điều hành)', !!(t && t.ok && t.ev && t.ev.trusted), t || { focus: foc });
      await D.sleep(1500);
      D.checkShot('ảnh màn hình khi chơi: nền tối, vùng status bar không bị trắng, không có hộp thoại đè lên', shot('1-dang-choi.png'), s => s.sang_tren < 110 && s.ti_le_trang < 0.08 && s.sang_tb < 120);
    } else D.rec('tới pha chạm', false);
    // Back đóng bảng xếp hạng
    if (await D.waitTag(LOG, 'PHASE', v => v === 'board-open', 130)) {
      await D.sleep(800); shot('2-bang-xep-hang.png');
      let b = null;
      for (let a = 1; a <= 3 && !b; a++) {
        const c = await clearDialogs('Back khi mở bảng');
        adb('shell input keyevent 4');
        b = await D.waitTag(LOG, 'BACKBOARD', null, 15);
        if (!b && !c.had && focus().onApp) break;      // phím đã tới game mà không có tác dụng: lỗi thật, không bấm lại
      }
      b = b || await D.waitTag(LOG, 'BACKBOARD', null, 110);
      D.rec('nút Back khi đang mở bảng xếp hạng: chỉ đóng bảng, app vẫn ở trước mặt', !!(b && b.closed && !b.hidden) && resumed().includes(PKG), { b, top: resumed().slice(0, 160) });
    } else D.rec('tới pha bảng xếp hạng', false);
    // Back lần nữa: thu nhỏ app, mở lại vẫn nguyên trạng
    if (await D.waitTag(LOG, 'PHASE', v => v === 'back-ready', 30)) {
      await D.sleep(600);
      let top = '';
      for (let a = 1; a <= 3; a++) {
        const c = await clearDialogs('Back ở màn chính');
        adb('shell input keyevent 4'); await D.sleep(3000);
        top = resumed();
        if (!top.includes(PKG) || (!c.had && focus().onApp)) break;
      }
      D.rec('nút Back ở màn chính: app thu nhỏ về màn hình chính (trước đây bấm không có tác dụng)', !top.includes(PKG), top.slice(0, 200));
      adb(`shell am start -n ${PKG}/.MainActivity`);
      const h = await D.waitTag(LOG, 'BACKHOME', null, 110);
      const reloaded = D.events(LOG).filter(e => e.tag === 'RESULT').length > 1;
      D.rec('mở lại app: quay về đúng trạng thái cũ, không tải lại trang', !!(h && h.hidden && h.resumed && h.overShown) && !reloaded, { h, reloaded });
    } else D.rec('tới pha Back', false);
    // deep link
    if (await D.waitTag(LOG, 'PHASE', v => v === 'deeplink-ready', 80)) {
      await D.sleep(500);
      const o = D.sh(`adb shell "am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'com.luoin.stonebalance://auth#p=google&s=0123456789abcdef'"`);
      const d = await D.waitTag(LOG, 'DEEPLINK', null, 70);
      D.rec('deep link com.luoin.stonebalance://auth tới được game; link giả (không có phiên chờ) bị từ chối', !!(d && d.ok && !d.user), { d, am: o.replace(/\s+/g, ' ').slice(0, 160) });
      await D.sleep(800); const s2 = shot('3-ket-thuc.png'); if (s2) D.samplePng(s2, true);
    } else D.rec('tới pha deep link', false);
    const done = await D.waitTag(LOG, 'DONE', null, 40);
    D.rec('kịch bản chạy hết, không có lỗi JS', !!(done && done.errors.length === 0), done);

    // khởi động lại app: kỷ lục còn nguyên (dữ liệu bền qua lần mở sau / cài đè)
    adb(`shell am force-stop ${PKG}`); await D.sleep(1000);
    const again = adb(`install -r "${APK}"`); adb(`shell am start -W -n ${PKG}/.MainActivity`);
    const r2 = await D.waitTag(LOG, 'RESULT', null, 300, 2);
    D.rec('cài đè + mở lại: kỷ lục vẫn còn', /Success/.test(again) && !!r2 && +r2.storedAtStart >= 1, r2 ? { storedAtStart: r2.storedAtStart, install: again.slice(-30) } : again.slice(-200));
  }
  const lines = fs.readFileSync(LOG, 'utf8').split('\n');
  const fatal = lines.filter(l => /FATAL EXCEPTION|AndroidRuntime.*com\.luoin/.test(l));
  D.rec('không có crash native (FATAL EXCEPTION)', fatal.length === 0, fatal.slice(0, 3));
  const anr = lines.filter(l => /ANR in /.test(l)).map(l => l.replace(/\s+/g, ' ').slice(0, 150));
  D.rec('game không bị ANR (treo luồng giao diện)', !anr.some(l => l.includes(PKG)), anr.slice(0, 4));
  if (anr.length) D.note('ANR của tiến trình hệ thống trên máy ảo (không phải game): ' + anr.filter(l => !l.includes(PKG)).slice(0, 3).join(' ; '));
  const cerr = lines.filter(l => /^E\/Capacitor/.test(l) && !/Failed to load resource|ERR_|net::/.test(l));
  const kinds = {}; cerr.forEach(l => { const k = l.replace(/\(\s*\d+\)/, '').slice(0, 150); kinds[k] = (kinds[k] || 0) + 1; });
  console.log('# lỗi Capacitor trong logcat (không tính lỗi mạng): ' + cerr.length); Object.keys(kinds).slice(0, 5).forEach(k => console.log('#   ' + kinds[k] + '× ' + k));
  const ev = D.events(LOG).map(e => e.tag + (e.tag === 'PHASE' ? ':' + e.v : '')).join(' ');
  try { lc.kill(); } catch (e) {}
  D.summary('android-run', '# thiết bị: API ' + adb('shell getprop ro.build.version.sdk') + (r ? ', ' + (r.ua || '') + ', fps ' + r.fps : '') + '\n# sự kiện: ' + ev);
  process.exit(D.failCount() ? 1 : 0);
})();
