'use strict';
/* Service worker / PWA: nhận bản cập nhật, chơi offline, không cache trang đăng nhập, bản trong app không lỗi. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, test, check, newPage, finish } = require('../lib/harness');
const { serve, buildSite } = require('../lib/server');

(async () => {
  const dir = buildSite(ROOT, fs.mkdtempSync(path.join(os.tmpdir(), 'sb-site-')));
  const srv = await serve(dir);
  const swReady = p => p.waitForFunction('navigator.serviceWorker && navigator.serviceWorker.controller', null, { timeout: 8000 }).then(() => true).catch(() => false);

  await test('W1 sau khi deploy bản mới, người chơi nhận bản mới ngay lần tải lại', async () => {
    const p = await newPage(); await p.goto(srv.url); await swReady(p); await p.reload(); await p.waitForFunction('typeof SWING_MUL!=="undefined"');
    const v1 = await p.evaluate('({mul:SWING_MUL, controlled:!!navigator.serviceWorker.controller})');
    const f = path.join(dir, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('const SWING_MUL=3.0;', 'const SWING_MUL=9.9;'));
    await p.reload(); await p.waitForFunction('typeof SWING_MUL!=="undefined"');
    const v2 = await p.evaluate('SWING_MUL');
    check(v1.controlled && v1.mul === 3 && v2 === 9.9, 'không nhận bản mới', { v1, v2 }); await p.context().close();
  });

  await test('W2 mất mạng vẫn mở và chơi được (cả / lẫn /stone-balance.html)', async () => {
    const p = await newPage(); await p.goto(srv.url); await swReady(p); await p.reload(); await p.waitForTimeout(600);
    await p.context().setOffline(true);
    await p.reload(); await p.waitForFunction('typeof startGame==="function"', null, { timeout: 8000 });
    await p.click('#btnStart'); await p.waitForTimeout(300);
    const a = await p.evaluate('state');
    await p.goto(srv.url + 'stone-balance.html'); await p.waitForFunction('typeof startGame==="function"', null, { timeout: 8000 });
    const icon = await p.evaluate(`fetch('icons/icon-192.png').then(r=>r.ok).catch(()=>false)`);
    check(a === 'aim' && icon, 'offline hỏng', { a, icon }); check(p.errs.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length === 0, 'lỗi JS', p.errs.slice(0, 3));
    await p.context().close();
  });

  await test('W3 trang đăng nhập auth.html và /__/ không bao giờ nằm trong cache', async () => {
    const p = await newPage(); await p.goto(srv.url); await swReady(p); await p.reload(); await p.waitForTimeout(500);
    await p.evaluate(`fetch('auth.html').then(r=>r.text()).catch(()=>{})`); await p.waitForTimeout(300);
    const keys = await p.evaluate(`caches.keys().then(async ks=>{ const out=[]; for(const k of ks){ const c=await caches.open(k); for(const r of await c.keys()) out.push(new URL(r.url).pathname); } return out; })`);
    check(!keys.some(k => /auth\.html|\/__\//.test(k)), 'auth.html bị cache', keys); check(keys.some(k => /online\.js/.test(k)), 'online.js chưa được cache', keys);
    await p.context().close(); return { cached: keys.length };
  });

  await test('W4 đổi VERSION của SW thì cache cũ bị dọn', async () => {
    const p = await newPage(); await p.goto(srv.url); await swReady(p);
    const before = await p.evaluate('caches.keys()');
    const f = path.join(dir, 'sw.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-next'"));
    await p.evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`);
    let after = [];
    for (let i = 0; i < 40; i++) { after = await p.evaluate('caches.keys()'); if (after.length === 1 && /-next$/.test(after[0])) break; await p.waitForTimeout(250); }
    check(after.length === 1 && /-next$/.test(after[0]) && before[0] !== after[0], 'cache cũ không được dọn', { before, after }); await p.context().close();
  });

  await test('W5 bản đóng gói trong app (thiếu stone-balance.html/auth.html): SW vẫn cài được nếu có đăng ký', async () => {
    const www = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-www-'));
    buildSite(ROOT, www); fs.unlinkSync(path.join(www, 'stone-balance.html')); fs.unlinkSync(path.join(www, 'auth.html'));
    const s2 = await serve(www); const p = await newPage(); await p.goto(s2.url); const ok = await swReady(p);
    await p.context().close(); await s2.close(); check(ok, 'SW không cài được khi thiếu file');
  });

  await srv.close();
  await finish();
})();
