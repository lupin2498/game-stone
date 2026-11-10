'use strict';
/* Bàn phím + tiêu điểm (focus): chơi bằng phím, nút ẩn không nhận focus, hộp thoại bảng xếp hạng. */
const { test, check, openGame, finish } = require('../lib/harness');
const { placeOne, waitOverlay, startByClick } = require('../lib/game-helpers');

(async () => {
  for (const key of ['Space', 'Enter']) {
    await test(`K1 bấm chuột "Bắt đầu" rồi chơi bằng ${key}: thả đá, không khởi động lại ván`, async () => {
      const p = await openGame(); await startByClick(p); await placeOne(p); await placeOne(p);
      const before = await p.evaluate('score');
      await p.waitForFunction(`state==='aim'`); await p.keyboard.press(key); await p.waitForTimeout(350);
      const after = await p.evaluate('({score, state, n:world.bodies.length})');
      check(before >= 1 && after.score >= before && after.n >= 4, 'ván bị reset', { before, after }); await p.context().close();
    });
  }

  await test('K2 chơi hoàn toàn bằng bàn phím: Enter bắt đầu, Space thả, Enter chơi lại', async () => {
    const p = await openGame();
    await p.keyboard.press('Enter'); await p.waitForFunction(`state==='aim' && performance.now()>=inputBlockUntil`);
    await p.keyboard.press('Space'); await p.waitForTimeout(100);
    check((await p.evaluate('state')) === 'falling', 'Space không thả đá');
    await p.evaluate(`gameOver('x')`); check(await waitOverlay(p, 'over'), 'không hiện màn kết thúc');
    await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    check((await p.evaluate('state')) === 'aim', 'Enter không chơi lại'); await p.context().close();
  });

  await test('K3 giữ phím Space không thả liên tục', async () => {
    const p = await openGame(); await startByClick(p);
    await p.keyboard.down('Space'); for (let i = 0; i < 20; i++) { await p.keyboard.down('Space'); }
    await p.keyboard.up('Space'); await p.waitForTimeout(100);
    check((await p.evaluate('world.bodies.length')) === 3, 'thả nhiều viên'); await p.context().close();
  });

  await test('K4 ở menu: Tab tới nút "Bảng xếp hạng" rồi Enter -> mở bảng, KHÔNG bắt đầu ván', async () => {
    const p = await openGame();
    await p.focus('#menu [data-board]'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
    const r = await p.evaluate(`({state, board: boardEl.classList.contains('on')})`);
    check(r.state === 'menu' && r.board, 'Enter trên nút khác lại bắt đầu ván', r); await p.context().close();
  });

  await test('K5 ở màn kết thúc: focus nút "Xếp hạng" + Space -> mở bảng, không chơi lại', async () => {
    const p = await openGame(); await startByClick(p); await p.evaluate(`score=2; heightCm=70; gameOver('x')`); await waitOverlay(p, 'over');
    await p.focus('#over [data-board]'); await p.keyboard.press('Space'); await p.waitForTimeout(250);
    const r = await p.evaluate(`({state, board: boardEl.classList.contains('on')})`);
    check(r.state === 'over' && r.board, 'Space trên nút Xếp hạng không mở bảng', r); await p.context().close();
  });

  await test('K6 đang chơi: Tab không đưa focus vào nút của lớp phủ đang ẩn', async () => {
    const p = await openGame(); await startByClick(p);
    const seen = [];
    for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(`(document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName)) || ''`)); }
    const hidden = await p.evaluate(`[...document.querySelectorAll('.sheet:not(.on) button')].filter(b=>{ b.focus(); return document.activeElement===b; }).length`);
    check(hidden === 0, 'nút ẩn vẫn nhận focus', { hidden, seen }); await p.context().close();
  });

  await test('K7 bảng xếp hạng: mở thì focus vào hộp thoại, Esc đóng và trả focus, phím game bị khoá khi đang mở', async () => {
    const p = await openGame();
    await p.focus('#menu [data-board]'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
    const inDialog = await p.evaluate(`boardEl.contains(document.activeElement)`);
    await p.keyboard.press('Space'); await p.waitForTimeout(150);
    const st1 = await p.evaluate('state');
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    const r = await p.evaluate(`({board: boardEl.classList.contains('on'), back: document.activeElement && document.activeElement.hasAttribute('data-board'), state})`);
    check(inDialog, 'mở bảng nhưng focus không vào hộp thoại');
    check(st1 === 'menu', 'Space khi bảng đang mở lại bắt đầu ván', st1);
    check(!r.board && r.back && r.state === 'menu', 'Esc không đóng / không trả focus', r); await p.context().close();
  });

  await test('K8 lớp phủ đang ẩn không chắn chạm; lớp đang hiện chắn canvas', async () => {
    const p = await openGame();
    await p.mouse.click(206, 120); await p.waitForTimeout(150);
    check((await p.evaluate('state')) === 'menu', 'chạm xuyên qua menu');
    await startByClick(p);
    await p.mouse.click(206, 430); await p.waitForTimeout(150);
    check((await p.evaluate('state')) === 'falling', 'lớp phủ ẩn vẫn chắn chạm'); await p.context().close();
  });

  await finish();
})();
