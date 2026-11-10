'use strict';
/* CI (macOS): cài App.app (bản có selftest) lên iOS Simulator, đọc console của app. Dùng: node ios-run.js <đường dẫn App.app> */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const D = require('./driver');
const APP = process.argv[2], PKG = 'com.luoin.stonebalance';
const OUT = path.join(__dirname, '..', '.out', 'ios'); fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'console.txt');

(async () => {
  let dev = null;
  try {
    const all = JSON.parse(D.sh('xcrun simctl list devices available -j')).devices;
    const list = []; for (const rt of Object.keys(all)) for (const d of all[rt]) if (/^iPhone/.test(d.name)) list.push(Object.assign({ rt: rt.replace(/.*SimRuntime\./, '') }, d));
    list.sort((a, b) => (b.rt > a.rt ? 1 : b.rt < a.rt ? -1 : 0));
    dev = list.find(d => /iPhone 1[5-9]( Pro)?$/.test(d.name)) || list[0];
  } catch (e) {}
  if (!D.rec('tìm được iOS Simulator', !!dev, dev && (dev.name + ' / ' + dev.rt))) process.exit(1);
  D.sh(`xcrun simctl boot ${dev.udid}`); D.sh(`xcrun simctl bootstatus ${dev.udid} -b`, { timeout: 600000 });
  const inst = D.sh(`xcrun simctl install ${dev.udid} "${APP}"`, { timeout: 300000 });
  D.rec('cài app lên Simulator', !/^ERR/.test(inst), inst.slice(0, 300));

  const launch = () => { const fd = fs.openSync(LOG, 'a'); return spawn('xcrun', ['simctl', 'launch', '--console', '--terminate-running-process', dev.udid, PKG], { stdio: ['ignore', fd, fd] }); };
  let proc = launch();
  const r = await D.waitTag(LOG, 'RESULT', null, 300);
  D.checkResult(r, 'ios');
  if (!r) console.log(D.sh(`tail -n 60 "${LOG}"`));
  const shot = name => { const f = path.join(OUT, name); const o = D.sh(`xcrun simctl io ${dev.udid} screenshot "${f}"`); return fs.existsSync(f) ? f : (console.log(o), null); };

  if (r && r.ready) {
    const s1 = shot('1-ket-thuc.png');
    if (s1) { const s = D.samplePng(s1); D.rec('ảnh màn hình: nền tối, không trắng trơn', !!s && s.sang_tb < 120 && s.ti_le_trang < 0.2, s); }
    if (await D.waitTag(LOG, 'PHASE', v => v === 'deeplink-ready', 60)) {
      await D.sleep(500);
      const o = D.sh(`xcrun simctl openurl ${dev.udid} "com.luoin.stonebalance://auth#p=google&s=0123456789abcdef"`);
      const d = await D.waitTag(LOG, 'DEEPLINK', null, 70);
      D.rec('deep link com.luoin.stonebalance://auth tới được game; link giả bị từ chối', !!(d && d.ok && !d.user), { d, openurl: o.slice(0, 160) });
      await D.sleep(800); const s2 = shot('2-sau-deep-link.png'); if (s2) D.samplePng(s2);
    } else D.rec('tới pha deep link', false);
    const done = await D.waitTag(LOG, 'DONE', null, 40);
    D.rec('kịch bản chạy hết, không có lỗi JS', !!(done && done.errors.length === 0), done);
    try { proc.kill(); } catch (e) {}
    D.sh(`xcrun simctl terminate ${dev.udid} ${PKG}`); await D.sleep(1000);
    proc = launch();
    const r2 = await D.waitTag(LOG, 'RESULT', null, 300, 2);
    D.rec('mở lại app: kỷ lục vẫn còn', !!r2 && +r2.storedAtStart >= 1, r2 ? { storedAtStart: r2.storedAtStart } : null);
  }
  console.log('# các sự kiện selftest: ' + D.events(LOG).map(e => e.tag + (e.tag === 'PHASE' ? ':' + e.v : '')).join(' '));
  try { proc.kill(); } catch (e) {}
  console.log('\nios-run: ' + (D.failCount() ? D.failCount() + ' FAIL' : 'tất cả PASS'));
  process.exit(D.failCount() ? 1 : 0);
})();
