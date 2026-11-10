'use strict';
/* Fuzz dài: (1) tua nhanh hàng nghìn ván với bot nhiều chiến thuật + đổi kích thước, (2) thao tác ngẫu nhiên thời gian thực.
   Thời lượng: FUZZ_MIN (mặc định 0.5 phút thực) và MONKEY_MIN (mặc định 0.5). Mọi bất biến trong monitor.inpage.js phải giữ. */
const { test, check, openGame, FREEZE_RAF, inpage, finish } = require('../lib/harness');
const FUZZ_MS = (+process.env.FUZZ_MIN || 0.5) * 60000, MONKEY_MS = (+process.env.MONKEY_MIN || 0.5) * 60000;
const SIZES = [[412, 860], [360, 640], [1280, 800], [768, 1024], [320, 480], [860, 412], [412, 780]];

(async () => {
  await test('F1 tua nhanh: không NaN / kẹt / xuyên đất / lệch trạng thái qua mọi chiến thuật và kích thước màn hình', async () => {
    const p = await openGame({}, FREEZE_RAF); p.setDefaultTimeout(120000);
    await p.evaluate(inpage('monitor.inpage.js')); await p.evaluate(inpage('sim.inpage.js')); await p.evaluate('startGame()');
    const t0 = Date.now(); let i = 0, lastResize = Date.now();
    while (Date.now() - t0 < FUZZ_MS) {
      await p.evaluate('__sim.run(3600)');
      if (Date.now() - lastResize > Math.max(4000, FUZZ_MS / 8)) { const s = SIZES[++i % SIZES.length]; await p.setViewportSize({ width: s[0], height: s[1] }); lastResize = Date.now(); }
    }
    const r = await p.evaluate(`(()=>{ if(window.gc) gc(); const M=__mon; return {simMin:+(__sim.t/60).toFixed(0), games:M.games, drops:M.drops, settles:M.settles, maxScore:M.maxScore, maxHeight:M.maxHeight,
      maxBodies:M.maxBodies, stuckMax:+M.stuckMax.toFixed(1), heapMB: performance.memory? +(performance.memory.usedJSHeapSize/1048576).toFixed(1):null, bugKeys:M.bugKeys, bugs:M.bugs.slice(0,3), over:M.overReasons,
      modes:Object.keys(__sim.modeStats).map(k=>k+':'+(__sim.modeStats[k].sum/__sim.modeStats[k].games).toFixed(1)).join(' ')}; })()`);
    await p.context().close();
    check(Object.keys(r.bugKeys).length === 0, 'vi phạm bất biến', { bugKeys: r.bugKeys, bugs: r.bugs });
    check(r.games > 5 && r.drops > 20 && p.errs.length === 0, 'chạy không đủ / lỗi JS', { r, errs: p.errs.slice(0, 3) });
    check(r.heapMB === null || r.heapMB < 40, 'nghi rò bộ nhớ', r.heapMB);
    return { simMin: r.simMin, games: r.games, drops: r.drops, maxScore: r.maxScore, stuckMax: r.stuckMax, heapMB: r.heapMB, modes: r.modes };
  });

  await test('F2 thao tác ngẫu nhiên (chạm, phím, đổi kích thước, đơ máy, mở/đóng bảng xếp hạng)', async () => {
    const p = await openGame({ hasTouch: true }); await p.evaluate(inpage('monitor.inpage.js'));
    const ids = ['#btnAgain', '#btnStart', '#menu [data-board]', '#over [data-board]', '#btnBoardClose', '.tab[data-tab=local]', '.tab[data-tab=global]'];
    const keys = ['Space', 'Enter', 'ArrowDown', 'Tab', 'Escape', 'a', 'Space', 'Shift+Tab'];
    const t0 = Date.now(); const n = {};
    const A = k => { n[k] = (n[k] || 0) + 1; };
    while (Date.now() - t0 < MONKEY_MS) {
      const r = Math.random();
      try {
        if (r < 0.38) { await p.mouse.click(Math.random() * 400, 60 + Math.random() * 700); A('click'); }
        else if (r < 0.52) { await p.touchscreen.tap(Math.random() * 400, 60 + Math.random() * 700); A('tap'); }
        else if (r < 0.68) { await p.keyboard.press(keys[Math.random() * keys.length | 0]); A('key'); }
        else if (r < 0.80) { const id = ids[Math.random() * ids.length | 0]; await p.evaluate(s => { const e = document.querySelector(s); if (e && e.closest('.sheet.on')) e.click(); }, id); A('ui'); }
        else if (r < 0.84) { const s = SIZES[Math.random() * SIZES.length | 0]; await p.setViewportSize({ width: s[0], height: s[1] }); A('resize'); }
        else if (r < 0.87) { await p.mouse.dblclick(200, 400); A('dbl'); }
        else if (r < 0.89) { await p.evaluate(() => { const t = Date.now(); while (Date.now() - t < 600) {} }); A('freeze'); }
        else { await p.waitForTimeout(150 + Math.random() * 1200); A('wait'); }
      } catch (e) { A('harness-err'); }
      await p.waitForTimeout(20 + Math.random() * 200);
    }
    const r = await p.evaluate(`({games:__mon.games, drops:__mon.drops, bugKeys:__mon.bugKeys, bugs:__mon.bugs.slice(0,3)})`);
    await p.context().close();
    check(Object.keys(r.bugKeys).length === 0 && p.errs.length === 0, 'lỗi khi thao tác ngẫu nhiên', { r, errs: p.errs.slice(0, 3) });
    return { actions: Object.values(n).reduce((a, b) => a + b, 0), games: r.games, drops: r.drops };
  });

  await finish();
})();
