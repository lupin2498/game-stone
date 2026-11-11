'use strict';
/* CI (macOS): cài App.app (bản có selftest) lên iOS Simulator, đọc console của app. Dùng: node ios-run.js <đường dẫn App.app> */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const D = require('./driver');
const APP = process.argv[2], PKG = 'com.luoin.stonebalance';
const OUT = path.join(__dirname, '..', '.out', 'ios'); fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'console.txt'), LOG2 = path.join(OUT, 'console-lan-2.txt');

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
  const EXT = 'com.luoin.stonebalance://auth#p=google&s=e2e2e2e2e2e2e2e2';
  // iOS hỏi "Open in <app>?" khi mở URL scheme riêng bằng simctl openurl; thử ghi sẵn sự chấp thuận (có bản iOS bỏ qua)
  const appr = D.sh(`xcrun simctl spawn ${dev.udid} defaults write com.apple.launchservices.schemeapproval "com.apple.CoreSimulator.CoreSimulatorBridge-->${PKG}" -string "${PKG}"`);
  if (appr) console.log('# chấp thuận sẵn URL scheme: ' + appr.replace(/\s+/g, ' ').slice(0, 160));
  const inst = D.sh(`xcrun simctl install ${dev.udid} "${APP}"`, { timeout: 300000 });
  D.rec('cài app lên Simulator', !/^ERR/.test(inst), inst.slice(0, 300));
  const shot = name => { const f = path.join(OUT, name); const o = D.sh(`xcrun simctl io ${dev.udid} screenshot "${f}"`); return fs.existsSync(f) ? f : (console.log(o), null); };

  /* Capacitor in console.log của trang bằng Swift print() -> stdout. stdout không phải terminal thì bị đệm cả khối (không thấy gì
     cho tới khi app thoát), nên luôn đặt NSUnbufferedIO=YES cho app; --console đã chạy được trên CI, hai cách sau chỉ để dự phòng.
     Lần mở đầu tiên trên Simulator vừa boot rất chậm (~1,5 phút mới tới trang) nên chờ dài. */
  const MODES = [
    { name: 'console', args: () => ['--console'] },
    { name: 'console-pty', args: () => ['--console-pty'] },
    { name: 'stdout-file', file: true, args: f => ['--stdout=' + f, '--stderr=' + f] },    // app tự ghi thẳng vào file
  ];
  const env = Object.assign({}, process.env, { SIMCTL_CHILD_NSUnbufferedIO: 'YES' });
  const launch = (mode, file) => {
    let out = 'ignore';
    if (mode.file) fs.writeFileSync(file, ''); else out = fs.openSync(file, 'a');
    // stdin là một pipe để mở (không bao giờ đóng) để simctl không thấy EOF rồi tự thoát
    const p = spawn('xcrun', ['simctl', 'launch'].concat(mode.args(file), ['--terminate-running-process', dev.udid, PKG]), { stdio: ['pipe', out, out], env });
    p.on('error', () => {});
    return p;
  };
  const boots = () => D.events(LOG).filter(e => e.tag === 'BOOT').length;
  let proc = null, mode = null;
  for (const m of MODES) {
    const before = boots();
    proc = launch(m, LOG);
    if (await D.waitTag(LOG, 'BOOT', null, m === MODES[0] ? 240 : 120, m.file ? 1 : before + 1)) { mode = m; break; }
    D.note(`không đọc được log của app ở chế độ ${m.name}; đuôi console: ` + D.sh(`tail -c 600 "${LOG}"`).replace(/\s+/g, ' '));
    try { proc.kill(); } catch (e) {}
    D.sh(`xcrun simctl terminate ${dev.udid} ${PKG}`); await D.sleep(1500);
  }
  if (!D.rec('đọc được log của app trên Simulator', !!mode, mode ? 'chế độ ' + mode.name : 'không chế độ nào cho ra log')) {
    const s = shot('0-khong-co-log.png'); if (s) D.samplePng(s);
    console.log(D.sh(`xcrun simctl spawn ${dev.udid} log show --last 3m --style compact --predicate 'process == "App"' | tail -n 40`, { timeout: 120000 }));
    D.summary('ios-run', '# thiết bị: ' + dev.name + ' / ' + dev.rt);
    process.exit(1);
  }

  const r = await D.waitTag(LOG, 'RESULT', null, 300);
  D.checkResult(r, 'ios');
  if (!r) { console.log(D.sh(`tail -n 60 "${LOG}"`)); const s = shot('0-khong-co-ket-qua.png'); if (s) D.samplePng(s); }

  if (r && r.ready) {
    D.checkShot('ảnh màn hình: nền tối, không trắng trơn', shot('1-ket-thuc.png'), s => s.sang_tb < 120 && s.ti_le_trang < 0.2);
    if (await D.waitTag(LOG, 'PHASE', v => v === 'deeplink-ready', 60)) {
      // App tự điều hướng tới URL scheme của chính nó -> iOS mở -> AppDelegate -> Capacitor -> game (xem selftest.js)
      const d = await D.waitTag(LOG, 'DEEPLINK', null, 70);
      if (!(d && d.ok)) { const s = shot('2-deep-link-loi.png'); if (s) D.samplePng(s); }
      D.rec('deep link com.luoin.stonebalance://auth: iOS giao được URL cho app, game nhận và từ chối link giả', !!(d && d.ok && !d.user && d.opens >= 1 && d.sameDoc), d);
      await D.sleep(800); const s2 = shot('2-sau-deep-link.png'); if (s2) D.samplePng(s2, true);
    } else D.rec('tới pha deep link', false);
    const done = await D.waitTag(LOG, 'DONE', null, 40);
    D.rec('kịch bản chạy hết, không có lỗi JS', !!(done && done.errors.length === 0), done);
    try { proc.kill(); } catch (e) {}
    D.sh(`xcrun simctl terminate ${dev.udid} ${PKG}`); await D.sleep(1000);
    proc = launch(mode, LOG2);
    const r2 = await D.waitTag(LOG2, 'RESULT', null, 300);
    D.rec('mở lại app: kỷ lục vẫn còn', !!r2 && +r2.storedAtStart >= 1, r2 ? { storedAtStart: r2.storedAtStart } : null);
    // Cuối cùng mới thử mở link từ BÊN NGOÀI app (simctl openurl): nếu iOS hiện hộp thoại "Open in …?" thì CI không bấm được,
    // nên đây chỉ là ghi nhận thêm — đường giao URL vào app đã được kiểm ở trên.
    if (r2) {
      await D.waitTag(LOG2, 'DONE', null, 90);
      const o = D.sh(`xcrun simctl openurl ${dev.udid} "${EXT}"`);
      const ext = await D.waitTag(LOG2, 'URLOPEN', v => v && /e2e2e2e2/.test(v.url || ''), 25);
      if (ext) D.rec('mở link từ ngoài app (simctl openurl) cũng tới được game', true, ext);
      else { D.note('simctl openurl: link chưa tới app trong 25 giây (iOS hỏi "Open in …?" — người dùng thật bấm Open; CI không bấm được)' + (o ? ' | ' + o.slice(0, 120) : '')); const s3 = shot('3-openurl-ngoai.png'); if (s3) D.samplePng(s3, true); }
    }
  }
  const ev = D.events(LOG).map(e => e.tag + (e.tag === 'PHASE' ? ':' + e.v : '')).join(' ');
  try { proc.kill(); } catch (e) {}
  D.summary('ios-run', '# thiết bị: ' + dev.name + ' / ' + dev.rt + (r ? ', ' + (r.ua || '') + ', fps ' + r.fps : '') + ', log: ' + mode.name + '\n# sự kiện: ' + ev);
  process.exit(D.failCount() ? 1 : 0);
})();
