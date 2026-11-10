'use strict';
/* Tình huống biên: thao tác dồn dập, đổi kích thước, thiếu API, lưu trữ, âm thanh, khởi động bất thường. */
const { test, check, newPage, openGame, FREEZE_RAF, finish, GAME_URL } = require('../lib/harness');
const { placeOne, waitOverlay, startByClick } = require('../lib/game-helpers');

(async () => {
  await test('E1 chạm 50 lần trong 1 frame chỉ thả 1 viên', async () => {
    const p = await openGame(); await startByClick(p);
    const r = await p.evaluate(`(()=>{ const n0=world.bodies.length; for(let i=0;i<50;i++) cv.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return {added:world.bodies.length-n0, state}; })()`);
    check(r.added === 1 && r.state === 'falling', 'thả sai số viên', r); check(p.errs.length === 0, 'lỗi JS', p.errs); await p.context().close();
  });

  await test('E2 chạm trong lúc đá đang rơi bị bỏ qua', async () => {
    const p = await openGame(); await startByClick(p);
    await p.mouse.click(200, 400); await p.waitForTimeout(60);
    const n1 = await p.evaluate('world.bodies.length');
    for (let i = 0; i < 8; i++) { await p.mouse.click(200, 400); await p.waitForTimeout(25); }
    const r = await p.evaluate('({n:world.bodies.length, state})');
    check(r.n === n1 || r.state === 'aim', 'thả thêm khi đang rơi', { n1, r }); await p.context().close();
  });

  await test('E4 chạm đúp "Bắt đầu" / "Thử lại" không tự thả viên đầu', async () => {
    const p = await openGame();
    let box = await p.locator('#btnStart').boundingBox(); let x = box.x + box.width / 2, y = box.y + box.height / 2;
    await p.mouse.click(x, y); await p.waitForTimeout(60); await p.mouse.click(x, y); await p.waitForTimeout(300);
    const a = await p.evaluate('({state, bodies:world.bodies.length})');
    await p.evaluate(`gameOver('x')`); await waitOverlay(p, 'over');
    box = await p.locator('#btnAgain').boundingBox(); x = box.x + box.width / 2; y = box.y + box.height / 2;
    await p.mouse.click(x, y); await p.waitForTimeout(60); await p.mouse.click(x, y); await p.waitForTimeout(300);
    const b = await p.evaluate('({state, bodies:world.bodies.length})');
    check(a.state === 'aim' && a.bodies === 2 && b.state === 'aim' && b.bodies === 2, 'tự thả đá', { a, b }); await p.context().close();
  });

  await test('E5 chạm/Space trong lúc chờ màn "Đổ rồi" không lỗi, màn vẫn hiện', async () => {
    const p = await openGame(); await startByClick(p); await p.evaluate(`gameOver('x')`);
    await p.mouse.click(200, 300); await p.keyboard.press('Space');
    check(await waitOverlay(p, 'over'), 'màn Đổ rồi không hiện'); check(p.errs.length === 0, 'lỗi JS', p.errs); await p.context().close();
  });

  await test('E6 xoay ngang/dọc + đổi chiều cao giữa ván: thế giới vẫn nằm giữa, không lỗi', async () => {
    const p = await openGame(); await startByClick(p); await placeOne(p); await placeOne(p);
    const out = [];
    for (const [w, h] of [[860, 412], [412, 780], [1024, 768], [320, 480], [412, 860]]) {
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(350);
      out.push(await p.evaluate(`({W,H, cx:Math.round(centerX), ped:Math.round((centerX-W/2)*camZ+W/2), groundOk: Math.abs(ground.aabb.miny-(H-42))<1, hill: Math.abs(hills[0].pts[0].y-(H-46))<60, state})`));
    }
    check(out.every(o => o.ped > 0 && o.ped < o.W && o.groundOk && o.hill && Math.abs(o.cx - o.W / 2) < 1), 'lệch khung', out);
    await placeOne(p);
    check((await p.evaluate('score')) >= 2 && p.errs.length === 0, 'lỗi sau khi xoay', p.errs); await p.context().close();
  });

  await test('E7 localStorage bị chặn (Safari riêng tư / WebView tắt lưu trữ) vẫn chơi được', async () => {
    const p = await openGame({}, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } }); });
    await startByClick(p); await p.evaluate(`score=3; heightCm=90; gameOver('x')`);
    check(await waitOverlay(p, 'over'), 'màn Đổ rồi không hiện'); check(p.errs.length === 0, 'lỗi JS', p.errs);
    await p.click('#over [data-board]'); await p.click('.tab[data-tab="local"]'); await p.waitForTimeout(200);
    check(p.errs.length === 0, 'lỗi JS ở bảng xếp hạng', p.errs); await p.context().close();
  });

  await test('E8 không có Web Audio vẫn chơi được', async () => {
    const p = await openGame({}, () => { delete window.AudioContext; delete window.webkitAudioContext; });
    await startByClick(p); await placeOne(p); await p.evaluate(`gameOver('x')`); await waitOverlay(p, 'over');
    check(p.errs.length === 0, 'lỗi JS', p.errs); await p.context().close();
  });

  await test('E9 cảm ứng thật (tap) thả được đá', async () => {
    const p = await openGame({ hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await p.tap('#btnStart'); await p.waitForFunction(`state==='aim' && performance.now()>=inputBlockUntil`);
    const n0 = await p.evaluate('world.bodies.length'); await p.tap('#cv'); await p.waitForTimeout(120);
    check((await p.evaluate('world.bodies.length')) === n0 + 1, 'tap không thả đá'); await p.context().close();
  });

  await test('E10 treo máy 3 giây rồi chạy lại: không xuyên đất, không đổ oan', async () => {
    const p = await openGame(); await startByClick(p); await placeOne(p); await placeOne(p);
    const before = await p.evaluate('placed.map(s=>Math.round(s.pos.y))');
    await p.evaluate('(()=>{const t=Date.now(); while(Date.now()-t<3000){} })()'); await p.waitForTimeout(600);
    const after = await p.evaluate('({ys:placed.map(s=>Math.round(s.pos.y)), state})');
    check(after.state !== 'over' && JSON.stringify(before) === JSON.stringify(after.ys), 'tháp thay đổi', { before, after }); await p.context().close();
  });

  for (const [w, h, dpr] of [[320, 480, 2], [360, 640, 3], [412, 915, 2.625], [768, 1024, 2], [1280, 800, 1], [2560, 1440, 1]]) {
    await test(`E11 ${w}x${h}@${dpr}x: HUD không chồng nhau, nút trong màn hình, không lỗi`, async () => {
      const p = await openGame({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      const m = await p.evaluate(`(()=>{ const r=id=>document.getElementById(id).getBoundingClientRect(); const b=r('btnStart'); return {btnVisible: b.top>=0 && b.bottom<=innerHeight && b.left>=0 && b.right<=innerWidth, scroll: menu.scrollHeight>menu.clientHeight+1}; })()`);
      check(m.btnVisible || m.scroll, 'nút Bắt đầu nằm ngoài màn hình và không cuộn được', m);
      await startByClick(p); await placeOne(p);
      const r = await p.evaluate(`(()=>{ const s=[...document.querySelectorAll('.stat')].map(e=>e.getBoundingClientRect());
        return {overlap: s[0].right>s[1].left+0.5 || s[1].right>s[2].left+0.5, inside: s.every(q=>q.left>=0&&q.right<=innerWidth&&q.top>=0), cv:[cv.width,cv.height], dpr:DPR}; })()`);
      check(!r.overlap && r.inside && p.errs.length === 0, 'HUD lỗi', { r, errs: p.errs }); await p.context().close();
      return { canvas: r.cv.join('x') };
    });
  }

  await test('E12 kỷ lục giữ sau khi tải lại; thoát nhanh sau khi đổ vẫn lưu', async () => {
    const p = await openGame(); await startByClick(p); await p.evaluate(`score=7; heightCm=210; gameOver('x')`);
    await p.waitForTimeout(150); await p.reload(); await p.waitForFunction('typeof best!=="undefined"');
    const r = await p.evaluate(`({best, bestHeight, hud:uiBest.textContent, runs:loadRuns().length})`);
    check(r.best === 7 && r.bestHeight === 210 && r.hud === '7' && r.runs === 1, 'mất kỷ lục', r); await p.context().close();
  });

  await test('E13 dữ liệu lưu trữ hỏng không làm treo game', async () => {
    const p = await newPage(); await p.goto(GAME_URL);
    await p.evaluate(`localStorage.setItem('stone-balance-best','abc'); localStorage.setItem('stone-balance-best-h','{}'); localStorage.setItem('stone-balance-runs','{"x":1}'); localStorage.setItem('sb_auth_state','???')`);
    await p.reload(); await p.waitForFunction('typeof best!=="undefined"');
    const r = await p.evaluate(`({best, bestHeight, runs:loadRuns().length})`);
    await p.evaluate(`localStorage.setItem('stone-balance-runs', JSON.stringify([{s:"9",h:1},{s:1e999,h:2},null,{s:2,h:50,t:1},{s:-5,h:10,t:2},{s:3.7,h:10,t:3}]))`);
    await startByClick(p); await p.evaluate(`score=1; heightCm=30; gameOver('x')`); await waitOverlay(p, 'over');
    await p.click('#over [data-board]'); await p.click('.tab[data-tab="local"]'); await p.waitForTimeout(150);
    const rows = await p.evaluate(`[...document.querySelectorAll('#boardList li .sc')].map(e=>e.firstChild.textContent)`);
    check(r.best === 0 && r.bestHeight === 0 && r.runs === 0 && p.errs.length === 0, 'xử lý dữ liệu hỏng sai', { r, errs: p.errs });
    check(rows.every(x => /^\d+$/.test(x) && +x > 0), 'bảng trên máy hiện dòng rác', rows); await p.context().close();
    return { rows };
  });

  await test('E15 khung hình 0x0 lúc khởi động (WebView chưa kịp đo kích thước) rồi mới có kích thước thật', async () => {
    const p = await newPage({}, () => {
      window.__zero = true;
      const d = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth'), e = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
      Object.defineProperty(Element.prototype, 'clientWidth', { get() { return window.__zero ? 0 : d.get.call(this); } });
      Object.defineProperty(Element.prototype, 'clientHeight', { get() { return window.__zero ? 0 : e.get.call(this); } });
    });
    await p.goto(GAME_URL); await p.waitForTimeout(500);
    await p.evaluate(`window.__zero=false; window.dispatchEvent(new Event('resize'))`); await p.waitForTimeout(400);
    const f0 = await p.evaluate(`new Promise(r=>{ let n=0; const t=performance.now(); (function f(){ n++; if(performance.now()-t<500) requestAnimationFrame(f); else r(n); })(); })`);
    await p.click('#btnStart'); await p.waitForTimeout(400);
    const r = await p.evaluate(`({state, W, H, finite: world.bodies.every(b=>isFinite(b.pos.x+b.pos.y)), preview: !!preview, moving:null})`);
    const x1 = await p.evaluate('preview && preview.pos.x'); await p.waitForTimeout(200); const x2 = await p.evaluate('preview && preview.pos.x');
    check(r.state === 'aim' && r.W > 0 && r.finite && x1 !== x2, 'game chết sau khi khởi động với khung 0x0', { r, x1, x2, errs: p.errs.slice(0, 2) });
    check(p.errs.length === 0, 'lỗi JS', p.errs.slice(0, 3)); await p.context().close();
  });

  await test('E16 một frame vẽ bị lỗi không làm chết vòng lặp game', async () => {
    const p = await openGame(); await startByClick(p);
    await p.evaluate(`(()=>{ const o=ctx.fillRect.bind(ctx); let n=0; ctx.fillRect=function(){ if(n++<3) throw new Error('boom'); return o.apply(null,arguments); }; })()`);
    await p.waitForTimeout(300);
    const x1 = await p.evaluate('preview.pos.x'); await p.waitForTimeout(250); const x2 = await p.evaluate('preview.pos.x');
    check(x1 !== x2, 'vòng lặp game dừng sau một lỗi vẽ', { x1, x2 }); await p.context().close();
  });

  await test('E17 âm thanh tự bật lại sau khi hệ điều hành tạm dừng', async () => {
    const p = await openGame(); await startByClick(p);
    check((await p.evaluate('SFX.ctx && SFX.ctx.state')) === 'running', 'audio không chạy');
    await p.evaluate('SFX.ctx.suspend()'); await p.waitForTimeout(150);
    await p.mouse.click(200, 400); await p.waitForTimeout(300);
    check((await p.evaluate('SFX.ctx.state')) === 'running', 'audio không bật lại'); check(p.errs.length === 0, 'lỗi', p.errs); await p.context().close();
  });

  await test('E18 viên đá mới không nhảy vị trí ở frame đầu; luôn nằm trong màn hình', async () => {
    const p = await openGame({}, FREEZE_RAF);
    const r = await p.evaluate(`(()=>{ startGame(); const j=[]; for(let i=0;i<300;i++){ spawnPreview(); const x0=preview.pos.x; update(1/60); j.push(Math.abs(preview.pos.x-x0)); } j.sort((a,b)=>a-b); return {p50:Math.round(j[150]), max:Math.round(j[299])}; })()`);
    check(r.max <= 12, 'nhảy vị trí', r); await p.context().close(); return r;
  });

  await test('E19 mở game trong iframe ẩn (kích thước 0) rồi hiện lại vẫn chạy', async () => {
    const { serve } = require('../lib/server'); const { ROOT } = require('../lib/harness');
    const srv = await serve(ROOT);
    const p = await newPage();
    await p.route('**/wrapper.html', r => r.fulfill({ contentType: 'text/html', body: '<body style="margin:0"><iframe id="f" style="display:none;width:412px;height:800px;border:0" src="stone-balance.html"></iframe></body>' }));
    await p.goto(srv.url + 'wrapper.html'); await p.waitForTimeout(700);
    await p.evaluate(`document.getElementById('f').style.display='block'`); await p.waitForTimeout(600);
    const fr = p.frames().find(f => /stone-balance/.test(f.url()));
    await fr.click('#btnStart', { timeout: 5000 }); await p.waitForTimeout(400);
    const r = await fr.evaluate(`({state, W, H, finite: world.bodies.every(b=>isFinite(b.pos.x+b.pos.y))})`);
    const x1 = await fr.evaluate('preview && preview.pos.x'); await p.waitForTimeout(200); const x2 = await fr.evaluate('preview && preview.pos.x');
    await p.context().close(); await srv.close();
    check(r.state === 'aim' && r.W > 0 && r.finite && x1 !== x2, 'iframe ẩn làm hỏng game', { r, x1, x2, errs: p.errs.slice(0, 2) });
  });

  await finish();
})();
