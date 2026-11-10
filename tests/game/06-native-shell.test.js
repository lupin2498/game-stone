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

  await test('N6 tai thỏ / thanh home / edge-to-edge (env safe-area thật): mọi nút và chữ ở mọi màn hình đều đưa được trọn vào vùng an toàn', async () => {
    // Emulation.setSafeAreaInsetsOverride cho env(safe-area-inset-*) giá trị thật như trên iPhone có tai thỏ hay Android vẽ tràn viền
    const AUDIT = `(ins => { const W = innerWidth, H = innerHeight, bad = [];
      const shown = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false; } return true; };
      const sel = 'button, .stat, #hint, #bar, #barLb, .logo, .rules > div, .acct-lb, .board-title, .tabs, .board-list, .board-foot, #overTitle, #overSub, .res, #rankLine';
      for (const el of document.querySelectorAll(sel)) {
        if (!shown(el) || el.closest('.board-list li')) continue;
        if (el.closest('.sheet')) el.scrollIntoView({ block: 'center' });        // lớp phủ cuộn được: đưa phần tử ra giữa rồi mới đo
        const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
        const fitsV = r.height <= H - ins.top - ins.bottom;
        if (r.left < ins.left - 0.5 || r.right > W - ins.right + 0.5 || (fitsV && (r.top < ins.top - 0.5 || r.bottom > H - ins.bottom + 0.5)))
          bad.push((el.id || el.className || el.tagName) + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ']');
      }
      // đầu và cuối lớp phủ: cuộn hết cỡ thì mép nội dung không được chui dưới tai thỏ / thanh home
      const sh = document.querySelector('.sheet.on:last-of-type') || document.querySelector('.sheet.on');
      for (const s of document.querySelectorAll('.sheet.on')) { const card = s.querySelector('.card'); if (!shown(s)) continue;
        s.scrollTop = 0; let r = card.getBoundingClientRect(); if (r.top < ins.top + 19.5) bad.push(s.id + ' mép trên ' + Math.round(r.top));
        s.scrollTop = 1e6; r = card.getBoundingClientRect(); if (r.bottom > H - ins.bottom - 19.5) bad.push(s.id + ' mép dưới ' + Math.round(r.bottom) + '/' + H);
        s.scrollTop = 0; }
      return bad; })`;
    const CASES = [
      { name: 'iPhone tai thỏ, dọc', vp: { width: 393, height: 852 }, ins: { top: 59, bottom: 34, left: 0, right: 0 } },
      { name: 'iPhone tai thỏ, ngang', vp: { width: 852, height: 393 }, ins: { top: 0, bottom: 21, left: 59, right: 59 } },
      { name: 'Android vẽ tràn viền, 3 nút điều hướng', vp: { width: 412, height: 915 }, ins: { top: 52, bottom: 48, left: 0, right: 0 } },
      { name: 'máy nhỏ', vp: { width: 320, height: 568 }, ins: { top: 44, bottom: 34, left: 0, right: 0 } },
    ];
    const out = {};
    for (const c of CASES) {
      const p = await openGame({ viewport: c.vp });
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.ins });
      await p.waitForTimeout(150);
      const envTop = await p.evaluate(`(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;padding-top:env(safe-area-inset-top,0px);padding-left:env(safe-area-inset-left,0px)';document.body.appendChild(d);const c=getComputedStyle(d);const v=[parseFloat(c.paddingTop),parseFloat(c.paddingLeft)];d.remove();return v})()`);
      check(envTop[0] === c.ins.top && envTop[1] === c.ins.left, 'trình duyệt không giả lập được env(safe-area-inset-*)', { envTop, c: c.name });
      const ins = JSON.stringify(c.ins), bad = {};
      bad.menu = await p.evaluate(`${AUDIT}(${ins})`);
      await p.click('#menu [data-board]'); await p.waitForTimeout(350);
      bad.board = await p.evaluate(`${AUDIT}(${ins})`);
      await p.click('#board [data-tab=local]'); await p.waitForTimeout(150);
      bad.boardLocal = await p.evaluate(`${AUDIT}(${ins})`);
      await p.click('#btnBoardClose'); await p.waitForTimeout(350);
      await p.evaluate(`document.getElementById('menu').scrollTop=0`); await startByClick(p);
      bad.play = await p.evaluate(`${AUDIT}(${ins})`);
      const hud = await p.evaluate(`({top: document.querySelector('.stat').getBoundingClientRect().top, hint: innerHeight - hint.getBoundingClientRect().bottom, left: document.querySelector('.stat').getBoundingClientRect().left})`);
      check(Math.abs(hud.top - (c.ins.top + 12)) < 1 && Math.abs(hud.hint - (c.ins.bottom + 20)) < 1 && Math.abs(hud.left - (c.ins.left + 14)) < 1, 'HUD không cách mép an toàn đúng khoảng', { c: c.name, hud });
      await p.evaluate(`gameOver('test')`); check(await waitOverlay(p, 'over'), 'không hiện màn kết thúc'); await p.waitForTimeout(350);
      bad.over = await p.evaluate(`${AUDIT}(${ins})`);
      const all = [].concat(...Object.keys(bad).map(k => bad[k].map(x => k + ': ' + x)));
      check(all.length === 0, c.name + ': có phần tử nằm ngoài vùng an toàn', all.slice(0, 8));
      check(p.errs.length === 0, 'lỗi JS', p.errs.slice(0, 3));
      out[c.name] = hud; await p.context().close();
    }
    return out;
  });

  await finish();
})();
