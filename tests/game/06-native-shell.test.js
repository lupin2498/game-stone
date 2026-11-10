'use strict';
/* Giả lập vỏ app (Capacitor) ngay trong trình duyệt: nút Back của Android, không đăng ký SW, vùng an toàn. */
const { test, check, openGame, finish, ROOT } = require('../lib/harness');
const { waitOverlay, startByClick } = require('../lib/game-helpers');
const { serve } = require('../lib/server');

const FAKE_CAP = require('../lib/fake-capacitor');

(async () => {
  await test('N1 Android: có đăng ký xử lý nút Back (nếu không, plugin App nuốt nút Back -> bấm không có tác dụng)', async () => {
    const p = await openGame({}, FAKE_CAP);
    const n = await p.evaluate(`__cap.count('App:backButton')`);
    check(n === 1, 'không có listener backButton', { n }); await p.context().close();
  });

  await test('N2 nút Back: đang mở bảng xếp hạng -> đóng bảng; ngoài ra -> thu nhỏ app (không mất ván)', async () => {
    const p = await openGame({}, FAKE_CAP);
    await p.click('#menu [data-board]'); await p.waitForTimeout(200);
    await p.evaluate(`__cap.fire('App','backButton',{canGoBack:false})`); await p.waitForTimeout(200);
    const mini = `__cap.calls.filter(c=>c==='App.minimizeApp')`;
    const a = await p.evaluate(`({board:boardEl.classList.contains('on'), calls:${mini}})`);
    await p.evaluate(`__cap.fire('App','backButton',{canGoBack:false})`);
    const b = await p.evaluate(mini);
    await startByClick(p);
    await p.evaluate(`__cap.fire('App','backButton',{canGoBack:false})`);
    const c = await p.evaluate(`({calls:${mini}, state})`);
    check(!a.board && a.calls.length === 0, 'Back không đóng bảng xếp hạng', a);
    check(b.length === 1 && b[0] === 'App.minimizeApp', 'Back ở menu không thu nhỏ app', b);
    check(c.calls.length === 2 && c.state === 'aim', 'Back khi đang chơi làm mất ván', c); await p.context().close();
  });

  await test('N3 trong app không đăng ký service worker; trên web thì có', async () => {
    const srv = await serve(ROOT);
    const p = await openGame({}, FAKE_CAP, srv.url + 'stone-balance.html'); await p.waitForTimeout(900);
    const nat = await p.evaluate(`navigator.serviceWorker.getRegistrations().then(r=>r.length)`); await p.context().close();
    const q = await openGame({}, null, srv.url + 'stone-balance.html');
    let web = 0;
    for (let i = 0; i < 32 && !web; i++) { web = await q.evaluate(`navigator.serviceWorker.getRegistrations().then(r=>r.length)`); if (!web) await q.waitForTimeout(250); } await q.context().close(); await srv.close();
    check(nat === 0 && web === 1, 'đăng ký SW sai', { nat, web });
  });

  await test('N4 vùng an toàn: HUD/nút né status bar + thanh điều hướng theo biến Capacitor tiêm vào', async () => {
    const p = await openGame();
    const base = await p.evaluate(`({top: document.querySelector('.stat').getBoundingClientRect().top, hint: innerHeight-hint.getBoundingClientRect().bottom})`);
    await p.evaluate(`document.documentElement.style.setProperty('--safe-area-inset-top','40px'); document.documentElement.style.setProperty('--safe-area-inset-bottom','30px')`);
    await p.waitForTimeout(100);
    const withInset = await p.evaluate(`({top: document.querySelector('.stat').getBoundingClientRect().top, hint: innerHeight-hint.getBoundingClientRect().bottom,
       menuPadTop: parseFloat(getComputedStyle(menu).paddingTop), menuPadBot: parseFloat(getComputedStyle(menu).paddingBottom)})`);
    check(Math.abs(withInset.top - base.top - 40) < 1 && Math.abs(withInset.hint - base.hint - 30) < 1 && withInset.menuPadTop >= 60 && withInset.menuPadBot >= 50, 'không né vùng an toàn', { base, withInset });
    await p.context().close(); return withInset;
  });

  await test('N5 app vào nền rồi quay lại (visibilitychange): không lỗi, ván giữ nguyên', async () => {
    const p = await openGame({}, FAKE_CAP); await startByClick(p);
    const s0 = await p.evaluate('({state, n:world.bodies.length})');
    await p.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange')); __cap.fire('App','pause'); __cap.fire('App','appStateChange',{isActive:false})`);
    await p.waitForTimeout(300);
    await p.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange')); __cap.fire('App','resume'); __cap.fire('App','appStateChange',{isActive:true})`);
    await p.waitForTimeout(300);
    const s1 = await p.evaluate('({state, n:world.bodies.length})');
    check(s0.state === s1.state && s0.n === s1.n && p.errs.length === 0, 'lỗi khi vào/ra nền', { s0, s1, errs: p.errs }); await p.context().close();
  });

  await finish();
})();
