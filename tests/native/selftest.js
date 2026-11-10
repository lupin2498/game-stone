/* Tự kiểm tra chạy NGAY TRONG app thật (WebView Android / WKWebView iOS) — chỉ có trong bản build của CI
   (tests/native/prepare.js chèn vào), không nằm trong bản phát hành.
   Kết quả in ra console dạng "[SELFTEST] <TAG> <json>"; CI đọc qua logcat (Android) hoặc stdout của app (iOS)
   và phối hợp: chạm thật, bấm Back, gửi deep link. */
(function () {
  'use strict';
  var T0 = Date.now(), errors = [];
  function out(tag, obj) { try { console.log('[SELFTEST] ' + tag + ' ' + JSON.stringify(obj === undefined ? null : obj)); } catch (e) { console.log('[SELFTEST] ' + tag + ' "?"'); } }
  window.addEventListener('error', function (e) { var m = String(e.message || e).slice(0, 200); errors.push(m); out('JSERROR', m); });
  window.addEventListener('unhandledrejection', function (e) { var m = 'rejection: ' + String(e.reason).slice(0, 200); errors.push(m); out('JSERROR', m); });
  document.addEventListener('visibilitychange', function () { out('VISIBILITY', { hidden: document.hidden }); });
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function until(fn, ms) { var t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await wait(60); } return false; }
  function countFrames(ms) { return new Promise(function (res) { var n = 0, t = performance.now(); (function f() { n++; if (performance.now() - t < ms) requestAnimationFrame(f); else res(n); })(); }); }
  function px(x, y) { try { var d = ctx.getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data; return [d[0], d[1], d[2], d[3]]; } catch (e) { return String(e).slice(0, 60); } }
  function cssPx(prop) { var d = document.createElement('div'); d.style.cssText = 'position:fixed;visibility:hidden;padding-top:' + prop; document.body.appendChild(d); var v = parseFloat(getComputedStyle(d).paddingTop); d.remove(); return v; }

  async function run() {
    var ready = await until(function () { return typeof startGame === 'function' && W >= 2 && !!world; }, 20000);
    var cap = window.Capacitor || {};
    var r = { ready: ready, platform: cap.getPlatform ? cap.getPlatform() : 'web', native: !!(cap.isNativePlatform && cap.isNativePlatform()),
      ua: (navigator.userAgent.match(/(Chrome|Version)\/[\d.]+|Android [\d.]+|OS [\d_]+ like Mac/g) || []).join(' ') };
    if (!ready) { out('RESULT', r); out('DONE', { errors: errors.concat(['game không khởi động']) }); return; }
    r.storedAtStart = (function () { try { return localStorage.getItem('stone-balance-best'); } catch (e) { return 'ERR'; } })();
    r.size = { W: W, H: H, DPR: DPR, canvas: cv.width + 'x' + cv.height, inner: innerWidth + 'x' + innerHeight, screen: screen.width + 'x' + screen.height, dpr: window.devicePixelRatio };
    // 9999 = biến/hàm không được định nghĩa trên nền tảng này
    r.safe = { varTop: cssPx('var(--safe-area-inset-top, 9999px)'), varBottom: cssPx('var(--safe-area-inset-bottom, 9999px)'), envTop: cssPx('env(safe-area-inset-top, 9999px)'), envBottom: cssPx('env(safe-area-inset-bottom, 9999px)'),
      hudTop: Math.round(document.querySelector('.stat').getBoundingClientRect().top), hintGap: Math.round(innerHeight - hint.getBoundingClientRect().bottom) };
    r.fps = (await countFrames(1000));
    // chơi thử 3 viên bằng sự kiện con trỏ tổng hợp (đi qua đúng trình xử lý chạm của game)
    startGame();
    for (var i = 0; i < 3 && state !== 'over'; i++) {
      await until(function () { var t = topStone(); return state === 'aim' && performance.now() >= inputBlockUntil && Math.abs(preview.pos.x - (t ? t.pos.x : centerX)) < 5; }, 15000);
      cv.dispatchEvent(new (window.PointerEvent || MouseEvent)(window.PointerEvent ? 'pointerdown' : 'mousedown', { bubbles: true, cancelable: true }));
      await until(function () { return state !== 'falling'; }, 15000);
    }
    await wait(300);
    r.play = { score: score, state: state, bodies: world.bodies.length, heightCm: heightCm,
      finite: world.bodies.every(function (b) { return isFinite(b.pos.x + b.pos.y + b.angle); }) };
    r.pixels = { sky: px(6, H * 0.3), moon: px(W * 0.78, 104 + (camY - camY0) * 0.05), ground: px(W / 2, H - 8) };
    r.audio = SFX.ctx ? SFX.ctx.state : 'none';
    gameOver('selftest');
    r.overShown = await until(function () { return over.classList.contains('on'); }, 5000);
    r.stored = (function () { try { return localStorage.getItem('stone-balance-best'); } catch (e) { return 'ERR'; } })();
    try { r.sw = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : -1; } catch (e) { r.sw = 'ERR'; }
    await until(function () { return !Online.configured || Online.failed || (Online.api && Online.api.known); }, 15000);
    r.online = { configured: Online.configured, api: !!Online.api, known: !!(Online.api && Online.api.known), failed: Online.failed, native: !!(Online.api && Online.api.native) };
    r.errors = errors.slice(0, 5);
    out('RESULT', r);

    if (r.platform === 'android' || window.__SELFTEST_ALL) {
      // 1) chạm thật từ hệ điều hành (CI: adb shell input tap)
      startGame(); await until(function () { return state === 'aim' && performance.now() >= inputBlockUntil; }, 5000);
      var ev = null, h = function (e) { ev = { trusted: e.isTrusted, type: e.pointerType || e.type }; };
      cv.addEventListener(window.PointerEvent ? 'pointerdown' : 'touchstart', h, true);
      out('PHASE', 'touch-ready');
      var okTouch = await until(function () { return ev && state !== 'aim'; }, 40000);
      out('TOUCH', { ok: okTouch, ev: ev, state: state, audio: SFX.ctx ? SFX.ctx.state : 'none' });
      // 2) nút Back khi đang mở bảng xếp hạng -> chỉ đóng bảng
      if (state !== 'over') gameOver('selftest'); await until(function () { return over.classList.contains('on'); }, 5000);
      openBoard(); await wait(400);
      out('PHASE', 'board-open');
      var closed = await until(function () { return !boardEl.classList.contains('on'); }, 40000);
      out('BACKBOARD', { closed: closed, hidden: document.hidden });
      if (!closed) closeBoard();
      // 3) nút Back lần nữa -> app thu nhỏ; CI mở lại app
      await wait(400);
      out('PHASE', 'back-ready');
      var hid = await until(function () { return document.hidden; }, 40000);
      var back = hid && await until(function () { return !document.hidden; }, 60000);
      out('BACKHOME', { hidden: hid, resumed: back, state: state, overShown: over.classList.contains('on') });
    }
    // 4) deep link giả (không có phiên đăng nhập nào đang chờ) -> game phải từ chối và báo "hết hạn"
    var msg = function () { var m = document.querySelector('.sheet.on .acct-msg'); return m ? m.textContent : ''; };
    await wait(600);
    out('PHASE', 'deeplink-ready');
    var got = await until(function () { return /hết hạn/.test(msg()); }, 60000);
    out('DEEPLINK', { ok: got, msg: msg().slice(0, 80), user: !!Online.user });
    out('DONE', { errors: errors.slice(0, 5), sec: Math.round((Date.now() - T0) / 1000) });
  }
  if (document.readyState === 'complete') setTimeout(run, 1200); else window.addEventListener('load', function () { setTimeout(run, 1200); });
})();
