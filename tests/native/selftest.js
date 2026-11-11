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
  out('BOOT', { at: location.protocol + '//' + location.host, rs: document.readyState });
  var urlOpens = 0;
  try { window.Capacitor.addListener('App', 'appUrlOpen', function (e) { urlOpens++; out('URLOPEN', { n: urlOpens, url: String(e && e.url).slice(0, 90) }); }); } catch (e) {}
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function until(fn, ms) { var t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await wait(60); } return false; }
  /* Số frame THẬT của game = số lần update() được gọi (bọc hàm lại để đếm) — không dựa vào việc đọc biến của script khác. */
  var gameFrames = 0;
  try { var _upd = update; update = function (dt) { gameFrames++; return _upd(dt); }; } catch (e) { out('JSERROR', 'wrap update: ' + e); }
  /* Đếm trong một khoảng: số lần rAF gọi (raf), số mốc thời gian rAF khác nhau (ts — WebView có cấp khung hình thật hay không),
     số frame của game (game). lastRaw/lastCopy: số lần thấy biến "last" của game đổi khi so trực tiếp / khi so bản sao (last + 0) —
     hai số này lệch nhau nghĩa là engine JS trả về "hộp số" dùng chung khi script khác đọc biến let (xem engineProbe).
     Đo ít nhất minMs, kéo dài tới maxMs cho tới khi đủ 3 frame game. */
  function countFrames(minMs, maxMs) { return new Promise(function (res) { var n = 0, a = 0, g = 0, gc = 0, pl = null, pc = null, pt = null, g0 = gameFrames, t = performance.now(), done = false;
    var fin = function (to) { if (done) return; done = true; var o = { raf: n, ts: a, game: gameFrames - g0, lastRaw: g, lastCopy: gc, ms: Math.round(performance.now() - t) }; if (to) o.timeout = true; res(o); };
    requestAnimationFrame(function f(ts) { n++; if (ts !== pt) { a++; pt = ts; }
      try { if (last !== pl) { g++; pl = last; } var c = last + 0; if (c !== pc) { gc++; pc = c; } } catch (e) {}
      var el = performance.now() - t;
      if (el < minMs || (gameFrames - g0 < 3 && el < maxMs)) requestAnimationFrame(f); else fin(false); });
    setTimeout(function () { fin(true); }, maxMs + 3000); }); }
  /* Dò lỗi engine JS: Chrome/WebView đời mới lưu số thực của biến let cấp cao nhất trong một "hộp" sửa tại chỗ. Nếu engine để lộ chính
     cái hộp đó thì bản sao "giá trị cũ" tự đổi theo giá trị mới. Kiểm: trong cùng script (same), gán sang biến let khác (slot),
     và đọc từ script khác (crossAlias = bản sao bị đổi theo, crossStale = đọc ra giá trị cũ). Game chỉ có 1 script nên chỉ same/slot là đáng lo. */
  function engineProbe() {
    var o = { same: true, slot: true, crossAlias: false, crossStale: false };
    try {
      var sc = document.createElement('script');
      sc.textContent = 'let __pA = 0.5, __pB = 0.25;\n' +
        'function __pSame(){ const old = __pA; __pA = __pA + 1.25; return old !== __pA; }\n' +
        'function __pSlot(){ __pB = __pA; __pA = __pA + 1.25; return __pB !== __pA; }\n' +
        'function __pBump(){ __pA = __pA + 1.25; return __pA + 0; }\n';
      document.head.appendChild(sc);
      for (var i = 0; i < 3000; i++) {
        if (!__pSame()) o.same = false;
        if (!__pSlot()) o.slot = false;
        var x = __pA, nv = __pBump(), cur = __pA;
        if (x === nv) o.crossAlias = true;
        if (cur !== nv) o.crossStale = true;
      }
    } catch (e) { o.err = String(e).slice(0, 100); }
    return o;
  }
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
    r.engine = engineProbe();
    r.early = await countFrames(2000, 2000);       // ngay sau khi mở app: máy ảo chậm có thể chưa vẽ khung hình thật nào
    // chơi thử 3 viên bằng sự kiện con trỏ tổng hợp (đi qua đúng trình xử lý chạm của game)
    startGame();
    for (var i = 0; i < 3 && state !== 'over'; i++) {
      await until(function () { var t = topStone(); return state === 'aim' && performance.now() >= inputBlockUntil && Math.abs(preview.pos.x - (t ? t.pos.x : centerX)) < 5; }, 45000);
      cv.dispatchEvent(new (window.PointerEvent || MouseEvent)(window.PointerEvent ? 'pointerdown' : 'mousedown', { bubbles: true, cancelable: true }));
      await until(function () { return state !== 'falling'; }, 45000);     // máy ảo ~2 fps: game chạy chậm ~20 lần so với đồng hồ thật
    }
    await wait(300);
    r.play = { score: score, state: state, bodies: world.bodies.length, heightCm: heightCm,
      finite: world.bodies.every(function (b) { return isFinite(b.pos.x + b.pos.y + b.angle); }) };
    var fr = await countFrames(1500, 10000);       // đo khi game đã chạy
    r.fps = Math.round(fr.raf / (fr.ms / 1000) * 10) / 10; r.loop = fr.game; r.loopMs = fr.ms; r.rafTs = fr.ts; r.lastRaw = fr.lastRaw; r.lastCopy = fr.lastCopy;
    r.pixels = { sky: px(6, H * 0.3), moon: px(W * 0.78, 104 + (camY - camY0) * 0.05), ground: px(W / 2, H - 8) };
    r.audio = SFX.ctx ? SFX.ctx.state : 'none';
    gameOver('selftest');
    r.overShown = await until(function () { return over.classList.contains('on'); }, 5000);
    r.stored = (function () { try { return localStorage.getItem('stone-balance-best'); } catch (e) { return 'ERR'; } })();
    try { r.sw = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : -1; } catch (e) { r.sw = 'ERR'; }
    await until(function () { return !Online.configured || Online.failed || (Online.api && Online.api.known); }, 15000);
    r.online = { configured: Online.configured, api: !!Online.api, known: !!(Online.api && Online.api.known), failed: Online.failed, native: !!(Online.api && Online.api.native) };
    r.frameErr = !!frameErr;
    r.errors = errors.slice(0, 5);
    out('RESULT', r);

    if (r.platform === 'android' || window.__SELFTEST_ALL) {
      // 1) chạm thật từ hệ điều hành (CI: adb shell input tap)
      startGame(); await until(function () { return state === 'aim' && performance.now() >= inputBlockUntil; }, 5000);
      var ev = null, h = function (e) { ev = { trusted: e.isTrusted, type: e.pointerType || e.type }; };
      cv.addEventListener(window.PointerEvent ? 'pointerdown' : 'touchstart', h, true);
      out('PHASE', 'touch-ready');
      var okTouch = await until(function () { return ev && state !== 'aim'; }, 100000);
      out('TOUCH', { ok: okTouch, ev: ev, state: state, audio: SFX.ctx ? SFX.ctx.state : 'none' });
      // 2) nút Back khi đang mở bảng xếp hạng -> chỉ đóng bảng
      if (state !== 'over') gameOver('selftest'); await until(function () { return over.classList.contains('on'); }, 5000);
      openBoard(); await wait(400);
      out('PHASE', 'board-open');
      var closed = await until(function () { return !boardEl.classList.contains('on'); }, 100000);
      out('BACKBOARD', { closed: closed, hidden: document.hidden });
      if (!closed) closeBoard();
      // 3) nút Back lần nữa -> app thu nhỏ; CI mở lại app
      await wait(400);
      out('PHASE', 'back-ready');
      var hid = await until(function () { return document.hidden; }, 100000);
      var back = hid && await until(function () { return !document.hidden; }, 60000);
      out('BACKHOME', { hidden: hid, resumed: back, state: state, overShown: over.classList.contains('on') });
    }
    // 4) deep link giả (không có phiên đăng nhập nào đang chờ) -> game phải từ chối và báo "hết hạn"
    var msg = function () { var m = document.querySelector('.sheet.on .acct-msg'); return m ? m.textContent : ''; };
    await wait(600);
    out('PHASE', 'deeplink-ready');
    var self = false, expired = function () { return /hết hạn/.test(msg()); };
    var got = await until(expired, r.platform === 'ios' ? 5000 : 60000);
    if (!got && r.platform === 'ios') {
      // iOS Simulator: "simctl openurl" bị hệ thống hỏi "Open in …?" mà CI không bấm được. Thay vào đó cho trang điều hướng tới URL scheme
      // của chính app: Capacitor chuyển cho iOS mở (UIApplication.open) -> iOS giao lại cho app qua AppDelegate -> sự kiện appUrlOpen.
      self = true;
      try { location.href = 'com.luoin.stonebalance://auth#p=google&s=0123456789abcdef'; } catch (e) { out('JSERROR', 'self-open: ' + e); }
      got = await until(expired, 40000);
    }
    out('DEEPLINK', { ok: got, self: self, opens: urlOpens, msg: msg().slice(0, 80), user: !!Online.user, sameDoc: typeof startGame === 'function' });
    out('DONE', { errors: errors.slice(0, 5), sec: Math.round((Date.now() - T0) / 1000) });
  }
  if (document.readyState === 'complete') setTimeout(run, 1200); else window.addEventListener('load', function () { setTimeout(run, 1200); });
})();
