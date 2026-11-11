'use strict';
/* Chạy thử kịch bản tự kiểm tra của app (tests/native/selftest.js) trong trình duyệt với cầu nối Capacitor giả,
   đóng vai CI: chạm thật, bấm Back 2 lần, mở lại app, gửi deep link. Đảm bảo kịch bản dùng trên Android/iOS không hỏng. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, test, check, newPage, finish } = require('../lib/harness');
const { serve, buildSite } = require('../lib/server');
const FAKE_CAP = require('../lib/fake-capacitor');

(async () => {
  await test('D1 selftest trong vỏ app giả lập Android: chơi thử, chạm thật, Back đóng bảng, Back thu nhỏ, deep link giả bị từ chối', async () => {
    const dir = buildSite(ROOT, fs.mkdtempSync(path.join(os.tmpdir(), 'sb-self-')), {
      'firebase-config.js': "window.FIREBASE_CONFIG={apiKey:'demo-key',authDomain:'demo-stone.firebaseapp.com',projectId:'demo-stone',appId:'1:1:web:1'};window.STONE_ONLINE={appScheme:'com.luoin.stonebalance'};" });
    fs.copyFileSync(path.join(ROOT, 'tests', 'native', 'selftest.js'), path.join(dir, 'selftest.js'));
    const idx = path.join(dir, 'index.html'); fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('</body>', '<script src="selftest.js"></script></body>'));
    const srv = await serve(dir);
    const p = await newPage({}, FAKE_CAP);
    const log = {}; const seen = [];
    p.on('console', m => { const t = m.text(); const k = t.match(/^\[SELFTEST\] (\S+) (.*)$/); if (k) { seen.push(k[1] + ' ' + k[2]); try { (log[k[1]] = log[k[1]] || []).push(JSON.parse(k[2])); } catch (e) {} } });
    const has = (tag, val, ms) => { const t0 = Date.now(); return (async () => { while (Date.now() - t0 < ms) { if ((log[tag] || []).some(v => val === undefined || JSON.stringify(v) === JSON.stringify(val))) return true; await p.waitForTimeout(100); } return false; })(); };
    await p.goto(srv.url);
    check(await has('BOOT', undefined, 20000), 'không có BOOT (dòng báo hiệu đầu tiên mà CI dùng để biết đã đọc được log)', seen.slice(-5));
    check(await has('RESULT', undefined, 90000), 'không có RESULT', seen.slice(-5));
    const r = log.RESULT[0];
    check(r.fps >= 1 && r.loop >= 2 && r.rafTs >= 2 && r.early && r.early.game >= 2 && r.early.ts >= 2 && r.frameErr === false, 'số đo vòng lặp game sai', { fps: r.fps, loop: r.loop, rafTs: r.rafTs, early: r.early, frameErr: r.frameErr });
    check(r.lastRaw >= 2 && r.lastCopy >= 2, 'đọc biến last của game từ script khác không thấy đổi', { lastRaw: r.lastRaw, lastCopy: r.lastCopy });
    check(r.engine && r.engine.same && r.engine.slot && !r.engine.crossAlias && !r.engine.crossStale && !r.engine.err, 'phép dò engine JS báo sai trên Chromium chuẩn', r.engine);
    check(r.ready && r.native && r.platform === 'android' && r.play.score >= 1 && r.play.finite && r.overShown && r.sw === 0, 'RESULT sai', r);
    check(r.online.configured && r.online.api && r.online.known && r.online.native && !r.online.failed, 'online.js không khởi tạo trong vỏ app', r.online);
    check(Array.isArray(r.pixels.moon) && r.pixels.moon[0] > 200 && r.pixels.sky[2] > r.pixels.sky[0], 'canvas không vẽ đúng', r.pixels);
    check(await has('PHASE', 'touch-ready', 15000), 'không tới pha chạm'); await p.waitForTimeout(450); await p.mouse.click(206, 430);
    check(await has('TOUCH', undefined, 15000) && log.TOUCH[0].ok && log.TOUCH[0].ev.trusted, 'chạm thật không thả đá', log.TOUCH);
    check(await has('PHASE', 'board-open', 15000), 'không tới pha bảng xếp hạng'); await p.evaluate(`__cap.fire('App','backButton',{canGoBack:false})`);
    check(await has('BACKBOARD', undefined, 10000) && log.BACKBOARD[0].closed && !log.BACKBOARD[0].hidden, 'Back không đóng bảng', log.BACKBOARD);
    check(await has('PHASE', 'back-ready', 10000), 'không tới pha Back');
    await p.evaluate(`__cap.fire('App','backButton',{canGoBack:false})`); await p.waitForTimeout(200);
    check((await p.evaluate(`__cap.calls.filter(c=>c==='App.minimizeApp').length`)) === 1, 'Back không gọi thu nhỏ app');
    await p.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))`); await p.waitForTimeout(300);
    await p.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange'))`);
    check(await has('BACKHOME', undefined, 10000) && log.BACKHOME[0].hidden && log.BACKHOME[0].resumed && log.BACKHOME[0].overShown, 'thu nhỏ/mở lại sai', log.BACKHOME);
    check(await has('PHASE', 'deeplink-ready', 10000), 'không tới pha deep link');
    await p.evaluate(`__cap.fire('App','appUrlOpen',{url:'com.luoin.stonebalance://auth#p=google&s=0123456789abcdef'})`);
    check(await has('DEEPLINK', undefined, 15000) && log.DEEPLINK[0].ok && !log.DEEPLINK[0].user, 'deep link giả không bị từ chối đúng cách', log.DEEPLINK);
    check(await has('DONE', undefined, 10000) && log.DONE[0].errors.length === 0, 'selftest báo lỗi JS', log.DONE);
    // bảng xếp hạng toàn cầu gọi Firestore thật với dự án giả -> 403/404/mất mạng là đúng; ngoài ra không được có lỗi
    const errs = p.errs.filter(e => !/Failed to load resource|ERR_/.test(e));
    check(errs.length === 0, 'lỗi JS', errs.slice(0, 3));
    await p.context().close(); await srv.close();
    return { fps: r.fps, safe: r.safe, ua: r.ua };
  });
  await test('D2 bộ lái CI: nhận diện cửa sổ đang giữ focus, đọc hộp thoại hệ thống, chọn đúng nút để gạt', async () => {
    const D = require('../native/driver');
    const PKG = 'com.luoin.stonebalance';
    check(D.appHasFocus('mCurrentFocus=Window{2b81a7e u0 com.luoin.stonebalance/com.luoin.stonebalance.MainActivity}', PKG), 'không nhận ra cửa sổ game');
    check(!D.appHasFocus('mCurrentFocus=Window{d0e1f2 u0 Application Not Responding: com.luoin.stonebalance}', PKG), 'nhầm hộp thoại ANR của chính game là cửa sổ game');
    check(!D.appHasFocus('mCurrentFocus=Window{d0e1f2 u0 Application Not Responding: com.android.systemui}', PKG), 'nhầm hộp thoại ANR là cửa sổ game');
    check(!D.appHasFocus('mCurrentFocus=Window{aa u0 com.google.android.apps.nexuslauncher/com.google.android.apps.nexuslauncher.NexusLauncherActivity}', PKG), 'nhầm launcher là game');
    check(!D.appHasFocus('mCurrentFocus=null', PKG) && !D.appHasFocus('ERR: adb: device offline', PKG), 'nhầm trạng thái lỗi là game');
    check(!D.appHasFocus('mCurrentFocus=Window{aa u0 com.luoin.stonebalancer/x.Main}', PKG), 'nhầm gói có tên gần giống');
    const attrs = 'content-desc="" checkable="false" checked="false" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="true" password="false" selected="false"';
    const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">` +
      `<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="android" clickable="false" ${attrs} bounds="[42,957][1038,1443]">` +
      `<node index="0" text="System UI isn&apos;t responding" resource-id="android:id/alertTitle" class="android.widget.TextView" package="android" clickable="false" ${attrs} bounds="[147,1062][933,1136]" />` +
      `<node index="1" text="Close app" resource-id="android:id/aerr_close" class="android.widget.Button" package="android" clickable="true" ${attrs} bounds="[84,1149][996,1275]" />` +
      `<node index="2" text="Wait" resource-id="android:id/aerr_wait" class="android.widget.Button" package="android" clickable="true" ${attrs} bounds="[84,1275][996,1401]" /></node></hierarchy>`;
    const nodes = D.parseUi(xml);
    check(nodes.length === 4 && nodes[1].text === "System UI isn't responding" && nodes[1].clickable === false, 'đọc cây giao diện sai', nodes);
    const b = D.pickDialogButton(nodes);
    check(b && b.text === 'Wait' && b.x === 540 && b.y === 1338 && b.clickable === true, 'không chọn nút Wait / sai toạ độ', b);
    const crash = D.parseUi(xml.replace(/<node index="2"[^>]*\/>/, ''));
    check(D.pickDialogButton(crash).text === 'Close app', 'không có Wait thì phải bấm Close app');
    check(D.pickDialogButton(D.parseUi('<hierarchy><node text="Cân Bằng Đá" resource-id="" bounds="[0,0][10,10]" /></hierarchy>')) === null, 'màn hình không có hộp thoại thì không được bấm gì');
    check(D.parseUi('ERR: không dump được').length === 0, 'dump lỗi phải cho danh sách rỗng');
    return { nodes: nodes.length };
  });
  await finish();
})();
