'use strict';
/* Luồng đăng nhập trên web (popup / redirect) và trang cầu nối auth.html của app, với Auth Emulator.
   Phần cần thư viện gapi của Google (apis.google.com) tự SKIP khi mạng chặn — CI trên GitHub chạy đủ. */
const { test, check, newPage, finish, SKIP } = require('../lib/harness');
const E = require('../lib/emu');
const SCHEME = 'com.luoin.stonebalance://auth';
const S = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

async function pickNewAccount(page, email, name) {          // giao diện chọn tài khoản của emulator
  await page.waitForSelector('#add-account-button', { timeout: 20000 });
  await page.click('#add-account-button');
  await page.fill('#email-input', email);
  await page.fill('#display-name-input', name);
  await page.click('#sign-in');
}
const countHandler = page => { const c = { n: 0 }; page.on('framenavigated', f => { if (f === page.mainFrame() && /\/emulator\/auth\/handler/.test(f.url())) c.n++; }); return c; };

(async () => {
  const gapi = await E.reachable('https://apis.google.com/js/api.js');
  console.log('# apis.google.com ' + (gapi ? 'truy cập được: chạy đủ' : 'bị chặn: bỏ qua các test cần gapi'));
  await E.clearAll();
  let bridgeUrl = null;

  await test('A1 auth.html (cầu nối cho app): đi Google một lần rồi quay về, KHÔNG lặp vô hạn; trả kết quả về đúng app', async () => {
    const a = await newPage(); const visits = countHandler(a);
    await a.goto(E.BASE + 'auth.html?p=google&s=' + S + '&r=' + encodeURIComponent(SCHEME));
    await pickNewAccount(a, 'cau.noi@example.com', 'Cầu Nối');
    const t0 = Date.now(); let url = null;
    while (Date.now() - t0 < 75000 && visits.n < 2 && !url) { url = await a.evaluate('window.__returnUrl || null').catch(() => null); if (!url) await a.waitForTimeout(300); }
    const status = await a.textContent('#status').catch(() => '');
    check(visits.n === 1, 'trang đăng nhập bị mở lại ' + visits.n + ' lần (vòng lặp chuyển hướng)', { status });
    check(url && url.startsWith(SCHEME + '#'), 'không có địa chỉ quay lại app', { url, status });
    const h = new URLSearchParams(url.split('#')[1]);
    check(h.get('s') === S && h.get('p') === 'google', 'thiếu state/provider', url.slice(0, 120));
    check(!/[?&](p|s|r)=/.test(a.url().split('#')[0].split('?')[1] || ''), 'tham số còn nằm trên URL sau khi xong', a.url());
    if (gapi) { check(h.get('id') && !h.get('error'), 'không lấy được token', url.slice(0, 160)); check(!h.get('at'), 'không nên gửi access token Google qua deep link'); bridgeUrl = url; }
    else check(h.get('error'), 'khi mạng chặn gapi phải trả lỗi về app chứ không treo', url.slice(0, 160));
    check((await a.evaluate(`document.getElementById('back').classList.contains('on') && document.getElementById('back').getAttribute('href')`)) === url, 'nút "Quay lại game" sai');
    await a.context().close(); return { handlerVisits: visits.n, result: h.get('error') || 'token' };
  });

  await test('A2 tải lại auth.html giữa chừng / bấm Back về auth.html không phát lại token cũ', async () => {
    const a = await newPage();
    await a.goto(E.BASE + 'auth.html?p=google&s=' + S + '&r=' + encodeURIComponent(SCHEME));
    await pickNewAccount(a, 'tai.lai@example.com', 'Tải Lại');
    await a.waitForFunction('window.__returnUrl || false', null, { timeout: 75000 }).catch(() => {});
    await a.goto(E.BASE + 'auth.html'); await a.waitForTimeout(1200);
    const st = await a.textContent('#status'); const again = await a.evaluate('window.__returnUrl || null');
    check(/Không có yêu cầu/.test(st) && !again, 'phát lại kết quả cũ', { st, again }); await a.context().close();
  });

  await test('A3 app nhận kết quả từ auth.html và đăng nhập đúng người (luồng đầy đủ của Android/iOS)', async () => {
    if (!gapi || !bridgeUrl) return SKIP;
    const p = await newPage(); await p.goto(E.BASE); await E.waitApi(p);
    const ok = await p.evaluate(async ({ url, S }) => { localStorage.setItem('sb_auth_state', JSON.stringify({ s: S, p: 'google', t: Date.now() })); return Online.api._handleReturn(url); }, { url: bridgeUrl, S });
    check(ok && await E.waitUser(p), 'app không đăng nhập được bằng kết quả từ auth.html');
    const u = await p.evaluate('Online.user'); check(u.name === 'Cầu Nối' && u.provider === 'google.com', 'sai người dùng', u); await p.context().close();
  });

  await test('B1 web: đăng nhập Google bằng cửa sổ popup', async () => {
    if (!gapi) return SKIP;
    const p = await newPage(); await p.goto(E.BASE); await E.waitApi(p);
    const [pop] = await Promise.all([p.context().waitForEvent('page', { timeout: 30000 }), p.click('#menu [data-login="google"]')]);
    await pickNewAccount(pop, 'popup@example.com', 'Pop Up');
    check(await E.waitUser(p, 30000), 'popup xong nhưng không đăng nhập', await p.evaluate(`document.querySelector('#menu .acct-msg').textContent`));
    const r = await p.evaluate(`({name:document.querySelector('#menu .chip .nm').textContent, busy:Online.busy})`);
    check(r.name === 'Pop Up' && !r.busy, 'giao diện sau popup sai', r);
    await p.reload(); await E.waitApi(p); check(await E.waitUser(p, 8000), 'tải lại trang thì mất đăng nhập'); await p.context().close();
  });

  await test('B2 web: đóng popup giữa chừng -> không báo lỗi, bấm lại được', async () => {
    if (!gapi) return SKIP;
    const p = await newPage(); await p.goto(E.BASE); await E.waitApi(p);
    const [pop] = await Promise.all([p.context().waitForEvent('page', { timeout: 30000 }), p.click('#menu [data-login="facebook"]')]);
    await pop.waitForSelector('#add-account-button', { timeout: 20000 }); await pop.close();
    await p.waitForFunction(`!Online.busy && !document.querySelector('#menu [data-login="google"]').disabled`, null, { timeout: 30000 });
    const msg = await p.evaluate(`document.querySelector('#menu .acct-msg').textContent`);
    check(!msg && !(await p.evaluate('Online.user')), 'đóng popup mà báo lỗi', msg); await p.context().close();
  });

  await test('B3 web: PWA trên iOS (chế độ standalone) đăng nhập bằng chuyển hướng cả trang rồi quay lại', async () => {
    if (!gapi) return SKIP;
    const p = await newPage({}, () => { Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true }); });
    await p.goto(E.BASE); await E.waitApi(p);
    await p.click('#menu [data-login="google"]');
    await pickNewAccount(p, 'pwa@example.com', 'P W A');
    await p.waitForURL(u => String(u).startsWith(E.BASE), { timeout: 30000 }); await E.waitApi(p);
    check(await E.waitUser(p, 30000), 'quay lại nhưng không đăng nhập', await p.evaluate(`document.querySelector('#menu .acct-msg').textContent`));
    check((await p.evaluate('Online.user.name')) === 'P W A', 'sai tên'); await p.context().close();
  });

  await test('B4 web: trình duyệt chặn popup -> tự chuyển sang kiểu chuyển hướng', async () => {
    if (!gapi) return SKIP;
    const p = await newPage(); await p.goto(E.BASE); await E.waitApi(p);
    await p.evaluate(`window.open = () => null`);
    await p.click('#menu [data-login="google"]');
    await pickNewAccount(p, 'chan.popup@example.com', 'Chặn Popup');
    await p.waitForURL(u => String(u).startsWith(E.BASE), { timeout: 30000 }); await E.waitApi(p);
    check(await E.waitUser(p, 30000), 'không đăng nhập được sau khi chuyển hướng'); await p.context().close();
  });

  await finish();
})();
