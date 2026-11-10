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

(async () => {
  console.log('# thiết bị: Android ' + adb('shell getprop ro.build.version.release') + ' (API ' + adb('shell getprop ro.build.version.sdk') + '), WebView: ' +
    D.sh(`adb shell "dumpsys webviewupdate | grep -i 'Current WebView package' | head -1"`).replace(/\s+/g, ' '));
  adb('logcat -c');
  const fd = fs.openSync(LOG, 'w');
  const lc = spawn('adb', ['logcat', '-v', 'brief'], { stdio: ['ignore', fd, fd] });
  const inst = adb(`install -r "${APK}"`);
  D.rec('cài APK', /Success/.test(inst), inst.slice(-200));
  console.log('# gói: ' + D.sh(`adb shell "dumpsys package ${PKG} | grep -E 'versionName|versionCode' | head -2"`).replace(/\s+/g, ' '));
  adb(`shell am start -W -n ${PKG}/.MainActivity`);

  const r = await D.waitTag(LOG, 'RESULT', null, 240);
  D.checkResult(r, 'android');
  if (!r) { console.log(D.sh(`tail -n 60 "${LOG}"`)); }

  if (r && r.ready) {
    // chạm thật
    if (await D.waitTag(LOG, 'PHASE', v => v === 'touch-ready', 40)) {
      await D.sleep(700);
      const m = adb('shell wm size').match(/(\d+)x(\d+)\s*$/m); const cx = m ? Math.round(+m[1] / 2) : 540, cy = m ? Math.round(+m[2] * 0.45) : 1000;
      adb(`shell input tap ${cx} ${cy}`);
      const t = await D.waitTag(LOG, 'TOUCH', null, 60);
      D.rec('chạm thật trên màn hình thả được đá (sự kiện tin cậy từ hệ điều hành)', !!(t && t.ok && t.ev && t.ev.trusted), t);
      await D.sleep(1500); const s1 = shot('1-dang-choi.png');
      if (s1) { const s = D.samplePng(s1); D.rec('ảnh màn hình khi chơi: nền tối, vùng status bar không bị trắng', !!s && s.sang_tren < 110 && s.ti_le_trang < 0.2 && s.sang_tb < 120, s); }
    } else D.rec('tới pha chạm', false);
    // Back đóng bảng xếp hạng
    if (await D.waitTag(LOG, 'PHASE', v => v === 'board-open', 60)) {
      await D.sleep(800); shot('2-bang-xep-hang.png'); adb('shell input keyevent 4');
      const b = await D.waitTag(LOG, 'BACKBOARD', null, 50);
      D.rec('nút Back khi đang mở bảng xếp hạng: chỉ đóng bảng, app vẫn ở trước mặt', !!(b && b.closed && !b.hidden) && resumed().includes(PKG), { b, top: resumed().slice(0, 160) });
    } else D.rec('tới pha bảng xếp hạng', false);
    // Back lần nữa: thu nhỏ app, mở lại vẫn nguyên trạng
    if (await D.waitTag(LOG, 'PHASE', v => v === 'back-ready', 30)) {
      await D.sleep(600); adb('shell input keyevent 4'); await D.sleep(2500);
      const top = resumed();
      D.rec('nút Back ở màn chính: app thu nhỏ về màn hình chính (trước đây bấm không có tác dụng)', !top.includes(PKG), top.slice(0, 200));
      adb(`shell am start -n ${PKG}/.MainActivity`);
      const h = await D.waitTag(LOG, 'BACKHOME', null, 70);
      const reloaded = D.events(LOG).filter(e => e.tag === 'RESULT').length > 1;
      D.rec('mở lại app: quay về đúng trạng thái cũ, không tải lại trang', !!(h && h.hidden && h.resumed && h.overShown) && !reloaded, { h, reloaded });
    } else D.rec('tới pha Back', false);
    // deep link
    if (await D.waitTag(LOG, 'PHASE', v => v === 'deeplink-ready', 80)) {
      await D.sleep(500);
      const o = D.sh(`adb shell "am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'com.luoin.stonebalance://auth#p=google&s=0123456789abcdef'"`);
      const d = await D.waitTag(LOG, 'DEEPLINK', null, 70);
      D.rec('deep link com.luoin.stonebalance://auth tới được game; link giả (không có phiên chờ) bị từ chối', !!(d && d.ok && !d.user), { d, am: o.replace(/\s+/g, ' ').slice(0, 160) });
      await D.sleep(800); const s2 = shot('3-ket-thuc.png'); if (s2) D.samplePng(s2);
    } else D.rec('tới pha deep link', false);
    const done = await D.waitTag(LOG, 'DONE', null, 40);
    D.rec('kịch bản chạy hết, không có lỗi JS', !!(done && done.errors.length === 0), done);

    // khởi động lại app: kỷ lục còn nguyên (dữ liệu bền qua lần mở sau / cài đè)
    adb(`shell am force-stop ${PKG}`); await D.sleep(1000);
    const again = adb(`install -r "${APK}"`); adb(`shell am start -W -n ${PKG}/.MainActivity`);
    const r2 = await D.waitTag(LOG, 'RESULT', null, 240, 2);
    D.rec('cài đè + mở lại: kỷ lục vẫn còn', /Success/.test(again) && !!r2 && +r2.storedAtStart >= 1, r2 ? { storedAtStart: r2.storedAtStart, install: again.slice(-30) } : again.slice(-200));
  }
  const log = fs.readFileSync(LOG, 'utf8');
  const fatal = log.split('\n').filter(l => /FATAL EXCEPTION|AndroidRuntime.*com\.luoin/.test(l));
  D.rec('không có crash native (FATAL EXCEPTION)', fatal.length === 0, fatal.slice(0, 3));
  const cerr = log.split('\n').filter(l => /^E\/Capacitor/.test(l) && !/Failed to load resource|ERR_|net::/.test(l));
  console.log('# lỗi Capacitor trong logcat (không tính lỗi mạng): ' + cerr.length); cerr.slice(0, 6).forEach(l => console.log('#   ' + l.slice(0, 260)));
  console.log('# các sự kiện selftest: ' + D.events(LOG).map(e => e.tag + (e.tag === 'PHASE' ? ':' + e.v : '')).join(' '));
  try { lc.kill(); } catch (e) {}
  console.log('\nandroid-run: ' + (D.failCount() ? D.failCount() + ' FAIL' : 'tất cả PASS'));
  process.exit(D.failCount() ? 1 : 0);
})();
