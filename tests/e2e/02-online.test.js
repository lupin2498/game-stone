'use strict';
/* Đăng nhập (luồng deep link của app) + bảng xếp hạng + đồng bộ kỷ lục, chạy với Firebase Emulator. */
const { test, check, newPage, finish } = require('../lib/harness');
const E = require('../lib/emu');

const open = async (opts, init) => { const p = await newPage(opts, init); await p.goto(E.BASE); await E.waitApi(p); return p; };
const uidOf = p => p.evaluate('Online.user && Online.user.uid');
const rankLineHas = (p, re, ms) => p.waitForFunction(`over.classList.contains('on') && ${re}.test(rankLine.textContent)`, null, { timeout: ms || 12000 }).then(() => true).catch(() => false);

(async () => {
  await E.clearAll();
  let anUid = null;

  await test('O1 đăng nhập Google qua deep link -> hiện tên, ẩn nút đăng nhập', async () => {
    const p = await open();
    const ok = await E.deepLinkLogin(p, 'google', E.fakeIdToken('g-an', 'An Nguyễn', 'an@example.com'));
    check(ok && await E.waitUser(p), 'không đăng nhập được');
    const r = await p.evaluate(`({name:document.querySelector('#menu .chip .nm').textContent, outHidden:document.querySelector('#menu .acct-out').hidden, provider:Online.user.provider, msg:document.querySelector('#menu .acct-msg').textContent})`);
    check(r.name === 'An Nguyễn' && r.outHidden && r.provider === 'google.com' && !r.msg, 'giao diện sai', r);
    anUid = await uidOf(p);

    await E.gameOverWith(p, 7, 250);
    check(await rankLineHas(p, '/hạng #1/'), 'không hiện hạng', await p.evaluate('rankLine.textContent'));
    const e1 = await E.getEntry(anUid); check(e1 && e1.best === 7 && e1.height === 250 && e1.name === 'An Nguyễn', 'điểm không lên máy chủ', e1);

    await p.click('#btnAgain'); await p.waitForTimeout(400);
    await E.gameOverWith(p, 3, 90); await rankLineHas(p, '/hạng #/');
    const e2 = await E.getEntry(anUid); check(e2.best === 7, 'ván kém ghi đè kỷ lục', e2);
    check(p.errs.length === 0, 'lỗi JS', p.errs.slice(0, 3)); await p.context().close();
    return { rank: 'ok', uid: anUid.slice(0, 6) };
  });

  await test('O2 bảng xếp hạng: 50 dòng đúng thứ tự, đánh dấu "tôi", hạng đếm đúng, tên chứa mã HTML không chạy', async () => {
    const seeds = []; for (let i = 0; i < 60; i++) seeds.push({ uid: 'u' + i, name: i === 5 ? '<img src=x onerror=alert(1)>' : 'Người chơi ' + i, best: 2 + (i % 15), height: 100 + i * 3 });
    await E.seed(seeds);
    const p = await open(); let dialog = false; p.on('dialog', d => { dialog = true; d.dismiss(); });
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('g-an', 'An Nguyễn', 'an@example.com')); await E.waitUser(p);
    await p.click('#menu [data-board]');
    await p.waitForFunction(`/Hạng của bạn/.test(boardFoot.textContent)`, null, { timeout: 12000 }).catch(() => {});
    const bd = await p.evaluate(`(()=>{ const li=[...document.querySelectorAll('#boardList li')];
      const v=li.map(l=>+l.querySelector('.sc').firstChild.textContent*100000 + +l.querySelector('.ht').firstChild.textContent);
      return {rows:li.length, sorted:v.every((x,i)=>i===0||v[i-1]>=x), me:li.filter(l=>l.classList.contains('me')).length, foot:boardFoot.textContent,
        injected:!!document.querySelector('#boardList img[src="x"]'), asText:li.some(l=>l.querySelector('.nm').textContent.includes('<img'))}; })()`);
    const expectRank = 1 + seeds.filter(s => s.best * 100000 + s.height > 7 * 100000 + 250).length;
    check(bd.rows === 50 && bd.sorted && bd.me <= 1, 'bảng sai', bd);
    check(bd.foot.includes('#' + expectRank), 'hạng của tôi sai', { foot: bd.foot, expectRank });
    check(!bd.injected && bd.asText && !dialog, 'tên chứa HTML bị chạy như mã', bd);
    await p.click('#btnBoardClose'); await p.click('#menu [data-logout]');
    await p.waitForFunction('!Online.user', null, { timeout: 5000 });
    check(await p.evaluate(`!document.querySelector('#menu .acct-out').hidden`), 'đăng xuất xong không hiện lại nút đăng nhập');
    await p.context().close(); return { foot: bd.foot };
  });

  await test('O3 đăng nhập trên máy mới -> kỷ lục kéo về; chơi khách rồi đăng nhập -> điểm vẫn lên bảng', async () => {
    let p = await open();
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('g-an', 'An Nguyễn', 'an@example.com')); await E.waitUser(p);
    await p.waitForFunction('best===7', null, { timeout: 8000 }).catch(() => {});
    const a = await p.evaluate(`({best, bestHeight, hud:uiBest.textContent})`); await p.context().close();
    check(a.best === 7 && a.bestHeight === 250 && a.hud === '7', 'không kéo kỷ lục về', a);
    p = await open(); await E.gameOverWith(p, 4, 160);
    check(/Đăng nhập để đưa điểm/.test(await p.evaluate('rankLine.textContent')), 'không nhắc đăng nhập');
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('g-binh', 'Bình Trần', 'binh@example.com')); await E.waitUser(p);
    let e = null; for (let i = 0; i < 30 && !e; i++) { e = await E.getEntry(await uidOf(p)); if (!e) await p.waitForTimeout(250); }
    await p.context().close(); check(e && e.best === 4 && e.height === 160, 'điểm chơi khách không lên bảng', e);
  });

  await test('O4 đăng nhập Facebook qua deep link', async () => {
    const p = await open();
    const ok = await E.deepLinkLogin(p, 'facebook', E.fakeIdToken('fb-chi', 'Chi Lê', 'chi@example.com'));
    check(ok && await E.waitUser(p) && (await p.evaluate('Online.user.provider')) === 'facebook.com', 'Facebook lỗi', await p.evaluate('Online.user'));
    await p.context().close();
  });

  await test('O5 deep link giả mạo bị từ chối: sai state / hết hạn / app không hề mở đăng nhập / lỗi từ trang đăng nhập', async () => {
    const p = await open(); const tok = E.fakeIdToken('g-x', 'X', 'x@example.com');
    const b1 = await E.deepLinkLogin(p, 'google', tok, { saved: 'ffffffffffffffffffffffffffffffff' }); await p.waitForTimeout(500);
    const msg1 = await p.evaluate(`document.querySelector('#menu .acct-msg').textContent`);
    const b2 = await E.deepLinkLogin(p, 'google', tok, { age: 11 * 60 * 1000, suffix: '&n=2' });
    const b3 = await E.deepLinkLogin(p, 'google', tok, { noSaved: true, suffix: '&n=3' });
    const b4 = await E.deepLinkLogin(p, 'google', tok, { extra: { error: 'auth/cancelled' }, suffix: '&n=4' });
    const b5 = await p.evaluate(`Online.api._handleReturn('https://evil.example/auth#p=google&id=x')`);
    check(!b1 && !b2 && !b3 && !b4 && !b5 && !(await p.evaluate('Online.user')), 'deep link giả được chấp nhận', { b1, b2, b3, b4, b5 });
    check(/hết hạn/.test(msg1), 'không báo lỗi cho người chơi', msg1); await p.context().close();
  });

  await test('O6 cùng một deep link báo 2 lần (khởi động lạnh) chỉ đăng nhập 1 lần, không báo lỗi', async () => {
    const p = await open();
    const r = await p.evaluate(async (id) => { localStorage.setItem('sb_auth_state', JSON.stringify({ s: '0123456789abcdef0123456789abcdef', p: 'google', t: Date.now() }));
      const url = 'com.luoin.stonebalance://auth#p=google&s=0123456789abcdef0123456789abcdef&id=' + encodeURIComponent(id);
      const [a, c] = await Promise.all([Online.api._handleReturn(url), Online.api._handleReturn(url)]);
      await new Promise(r => setTimeout(r, 800));
      return { a, c, user: !!Online.user, msg: document.querySelector('#menu .acct-msg').textContent }; }, E.fakeIdToken('dup-1', 'Dup', 'd@example.com'));
    check(r.a && !r.c && r.user && !r.msg, 'xử lý trùng sai', r); await p.context().close();
  });

  await test('O7 đăng nhập xong hết ván NGAY (2 lần đồng bộ chồng nhau): lưu đúng, không báo lỗi nhầm', async () => {
    let okN = 0; const N = 4, bad = [];
    for (let i = 0; i < N; i++) {
      const p = await open();
      await p.evaluate(`localStorage.setItem('stone-balance-best','5'); localStorage.setItem('stone-balance-best-h','120'); best=5; bestHeight=120;`);
      const r = await p.evaluate(async ({ id }) => {
        localStorage.setItem('sb_auth_state', JSON.stringify({ s: '0123456789abcdef0123456789abcdef', p: 'google', t: Date.now() }));
        await Online.api._handleReturn('com.luoin.stonebalance://auth#p=google&s=0123456789abcdef0123456789abcdef&id=' + encodeURIComponent(id));
        startGame(); score = 8; heightCm = 300; gameOver('x');
        for (let k = 0; k < 150 && !/hạng #|Chưa lưu/.test(rankLine.textContent); k++) await new Promise(r => setTimeout(r, 100));
        const e = await Online.api.myEntry(); return { line: rankLine.textContent, cloud: e && e.best };
      }, { id: E.fakeIdToken('race-' + i, 'Race ' + i, 'r' + i + '@example.com') });
      if (r.cloud === 8 && /hạng #/.test(r.line)) okN++; else bad.push(r);
      await p.context().close();
    }
    check(okN === N, 'đồng bộ chồng nhau lỗi', bad);
  });

  await test('O8 đổi tài khoản trên cùng máy: tài khoản sau KHÔNG được hưởng kỷ lục của người trước', async () => {
    const p = await open();
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('sw-a', 'Người A', 'a@example.com')); await E.waitUser(p);
    await E.gameOverWith(p, 12, 400); await rankLineHas(p, '/hạng #/');
    const uidA = await uidOf(p);
    await p.click('#over [data-logout]'); await p.waitForFunction('!Online.user');
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('sw-b', 'Người B', 'b@example.com'), { suffix: '&n=b' }); await E.waitUser(p);
    await p.waitForTimeout(2500);
    const uidB = await uidOf(p); const eB = await E.getEntry(uidB), eA = await E.getEntry(uidA);
    const local = await p.evaluate(`({best, bestHeight, hud:uiBest.textContent})`);
    check(uidA !== uidB && eA && eA.best === 12, 'A mất điểm', { eA });
    check(!eB || eB.best < 12, 'B được hưởng kỷ lục 12 của A', { eB });
    check(local.best === (eB ? eB.best : 0), 'kỷ lục trên máy không chuyển sang của B', { local, eB });
    // A đăng nhập lại: lấy lại đúng kỷ lục của A
    await p.evaluate(`document.querySelector('.sheet.on [data-logout]').click()`); await p.waitForFunction('!Online.user');
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('sw-a', 'Người A', 'a@example.com'), { suffix: '&n=a2' }); await E.waitUser(p);
    await p.waitForFunction('best===12', null, { timeout: 8000 }).catch(() => {});
    check((await p.evaluate('best')) === 12, 'A đăng nhập lại không lấy lại được kỷ lục'); await p.context().close();
  });

  await test('O9 hai ván phá kỷ lục liên tiếp trong vòng 5 giây: lần ghi sau bị luật chặn tạm thời nhưng tự ghi lại được', async () => {
    const p = await open();
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('fast-1', 'Nhanh Tay', 'f@example.com')); await E.waitUser(p);
    await E.gameOverWith(p, 5, 150); await rankLineHas(p, '/hạng #/');
    await p.click('#btnAgain'); await p.waitForTimeout(450);
    await E.gameOverWith(p, 6, 190);
    const uid = await uidOf(p); let e = null;
    for (let i = 0; i < 60; i++) { e = await E.getEntry(uid); if (e && e.best === 6) break; await p.waitForTimeout(250); }
    const line = await p.evaluate('rankLine.textContent');
    check(e && e.best === 6, 'kỷ lục thứ hai không lên máy chủ', { e, line }); await p.context().close(); return { line };
  });

  await test('O10 mất mạng lúc hết ván: báo chưa lưu, có mạng lại thì tự đồng bộ', async () => {
    const p = await open();
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('off-1', 'Mất Mạng', 'o@example.com')); await E.waitUser(p);
    await p.context().setOffline(true);
    await E.gameOverWith(p, 9, 280);
    check(await rankLineHas(p, '/Chưa lưu/', 20000), 'không báo chưa lưu', await p.evaluate('rankLine.textContent'));
    await p.context().setOffline(false);
    const uid = await uidOf(p); let e = null;
    for (let i = 0; i < 60; i++) { e = await E.getEntry(uid); if (e && e.best === 9) break; await p.waitForTimeout(250); }
    check(e && e.best === 9, 'có mạng lại nhưng không tự đồng bộ', e); await p.context().close();
  });

  await test('O11 hai màn kết thúc liên tiếp: dòng hạng luôn là của ván mới nhất', async () => {
    const p = await open();
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('seq-1', 'Thứ Tự', 's@example.com')); await E.waitUser(p);
    await p.evaluate(`(()=>{ const o=Online.api.rankOf; let n=0; Online.api.rankOf=async function(b,h){ const k=++n; const r=await o.call(Online.api,b,h); if(k===1) await new Promise(r=>setTimeout(r,2500)); return r; }; })()`);
    await E.gameOverWith(p, 20, 600);                       // ván 1: hạng #1, trả lời chậm 2,5s
    await p.evaluate(`startGame(); score=1; heightCm=30; gameOver('x')`);   // ván 2 ngay sau đó: hạng thấp
    await p.waitForTimeout(4200);
    const line = await p.evaluate('rankLine.textContent');
    check(/hạng #/.test(line) && !/hạng #1\b/.test(line), 'dòng hạng hiển thị của ván cũ', line); await p.context().close(); return { line };
  });

  await test('O12 ảnh đại diện từ máy chủ lạ trong bảng xếp hạng không được tải (chống theo dõi người xem)', async () => {
    await E.seed([{ uid: 'evil1', name: 'Kẻ Xấu', best: 400, height: 9000, photo: 'https://evil.example/track.png' },
      { uid: 'good1', name: 'Người Tốt', best: 399, height: 9000, photo: 'https://lh3.googleusercontent.com/a/abc=s96-c' }]);
    const p = await open(); const reqs = [];
    p.on('request', r => { if (/evil\.example|googleusercontent/.test(r.url())) reqs.push(new URL(r.url()).hostname); });
    await p.click('#menu [data-board]'); await p.waitForFunction(`document.querySelectorAll('#boardList li').length>1`, null, { timeout: 12000 });
    await p.waitForTimeout(600);
    const imgs = await p.evaluate(`[...document.querySelectorAll('#boardList li')].slice(0,2).map(l=>({name:l.querySelector('.nm').textContent, img:(l.querySelector('img')||{}).src||null}))`);
    check(!reqs.includes('evil.example') && !imgs.some(i => i.img && /evil/.test(i.img)), 'ảnh từ máy chủ lạ vẫn được tải', { reqs, imgs });
    check(reqs.includes('lh3.googleusercontent.com'), 'ảnh Google hợp lệ bị chặn nhầm', { reqs, imgs }); await p.context().close();
  });

  await test('O13 trang auth.html từ chối địa chỉ quay lại lạ / nhà cung cấp lạ / mở trực tiếp', async () => {
    const a = await newPage();
    await a.goto(E.BASE + 'auth.html?p=google&s=0123456789abcdef0123456789abcdef&r=' + encodeURIComponent('https://evil.example/steal')); await a.waitForTimeout(1200);
    const t1 = await a.textContent('#status');
    await a.goto(E.BASE + 'auth.html?p=github&s=0123456789abcdef&r=' + encodeURIComponent('com.luoin.stonebalance://auth')); await a.waitForTimeout(1000);
    const t2 = await a.textContent('#status');
    await a.goto(E.BASE + 'auth.html?p=google&s=xyz&r=' + encodeURIComponent('com.luoin.stonebalance://auth')); await a.waitForTimeout(1000);
    const t2b = await a.textContent('#status');
    await a.goto(E.BASE + 'auth.html'); await a.waitForTimeout(1000);
    const t3 = await a.textContent('#status');
    check(/không hợp lệ/.test(t1) && /không hợp lệ/.test(t2) && /không hợp lệ/.test(t2b) && /Không có yêu cầu/.test(t3) && /auth\.html/.test(a.url()), 'auth.html xử lý sai', { t1, t2, t2b, t3 });
    await a.context().close();
  });

  await test('O14 trình duyệt nhúng (Zalo/Facebook…): báo rõ không đăng nhập Google được, không mở popup', async () => {
    const zalo = 'Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 Zalo android/12100726';
    const p = await open({ userAgent: zalo }); let popup = false; p.context().on('page', () => { popup = true; });
    await p.click('#menu [data-login="google"]'); await p.waitForTimeout(500);
    const m1 = await p.evaluate(`document.querySelector('#menu .acct-msg').textContent`);
    await p.click('#menu [data-login="facebook"]'); await p.waitForTimeout(300);
    const m2 = await p.evaluate(`document.querySelector('#menu .acct-msg').textContent`);
    check(/Chrome hoặc Safari/.test(m1) && /Google/.test(m1) && /Facebook/.test(m2) && !popup, 'không cảnh báo trình duyệt nhúng', { m1, m2, popup });
    check(!(await p.evaluate(`document.querySelector('#menu [data-login="google"]').disabled`)), 'nút bị khoá sau cảnh báo'); await p.context().close();
    const fb = await open({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0;FBBV/1;]' });
    await fb.click('#menu [data-login="google"]'); await fb.waitForTimeout(300);
    const m3 = await fb.evaluate(`document.querySelector('#menu .acct-msg').textContent`);
    check(/Google/.test(m3) && /Chrome hoặc Safari/.test(m3), 'trong app Facebook không cảnh báo cho Google', m3); await fb.context().close();
  });

  await test('O15 đăng nhập ngay tại màn "Đổ rồi": dòng hạng cập nhật cho ván vừa xong', async () => {
    const p = await open(); await E.gameOverWith(p, 11, 333);
    check(/Đăng nhập để đưa điểm/.test(await p.evaluate('rankLine.textContent')), 'thiếu lời nhắc đăng nhập');
    await E.deepLinkLogin(p, 'google', E.fakeIdToken('late-1', 'Đăng Nhập Sau', 'late@example.com')); await E.waitUser(p);
    check(await rankLineHas(p, '/hạng #\\d+ toàn cầu/'), 'dòng hạng không cập nhật sau khi đăng nhập', await p.evaluate('rankLine.textContent'));
    const e = await E.getEntry(await uidOf(p)); check(e && e.best === 11, 'điểm không lên bảng', e); await p.context().close();
  });

  await finish();
})();
