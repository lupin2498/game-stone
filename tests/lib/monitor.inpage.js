// Gắn vào trang game: bọc update/render để đo thời gian và kiểm tra bất biến mỗi frame.
// Kết quả nằm ở window.__mon (bugKeys: đếm theo loại, bugs: vài mẫu đầu).
(function () {
  const M = window.__mon = {
    frames: 0, games: 0, drops: 0, settles: 0, maxScore: 0, maxHeight: 0, maxBodies: 0, maxArb: 0, maxParts: 0, maxFloats: 0,
    maxUpdMs: 0, maxRenMs: 0, sumUpdMs: 0, sumRenMs: 0, nUpd: 0, nRen: 0, stuckMax: 0,
    bugs: [], bugKeys: {}, overReasons: {}, lastState: null
  };
  function bug(key, info) {
    M.bugKeys[key] = (M.bugKeys[key] || 0) + 1;
    if (M.bugKeys[key] <= 3) M.bugs.push({ key, info });
  }
  window.__bug = bug;
  const touchesGround = b => {
    if (!world || !ground) return false;
    for (const k of world.arbiters.keys()) {
      const p = k.split('|');
      if ((+p[0] === ground.id && +p[1] === b.id) || (+p[1] === ground.id && +p[0] === b.id)) return true;
    }
    return false;
  };
  window.__touchesGround = touchesGround;
  const origUpdate = window.update, origRender = window.render;
  let prevScore = 0, groundFrames = 0;
  window.update = function (dt) {
    const t0 = performance.now();
    const placedBefore = placed.length, scoreBefore = score;
    let threw = null;
    try { origUpdate(dt); } catch (e) { threw = e; }
    const ms = performance.now() - t0;
    M.frames++; M.sumUpdMs += ms; M.nUpd++; if (ms > M.maxUpdMs) M.maxUpdMs = ms;
    if (threw) bug('update-throw', String((threw && threw.stack) || threw));
    try {
      if (world) {
        const bs = world.bodies;
        if (bs.length > M.maxBodies) M.maxBodies = bs.length;
        if (world.arbiters.size > M.maxArb) M.maxArb = world.arbiters.size;
        for (const b of bs) {
          if (!isFinite(b.pos.x) || !isFinite(b.pos.y) || !isFinite(b.vel.x) || !isFinite(b.vel.y) || !isFinite(b.angle) || !isFinite(b.av)) { bug('nan-body', { id: b.id, state }); break; }
          if (!b.isStatic && ground && b.pos.y > ground.aabb.miny + 400 && b.pos.x > ground.aabb.minx && b.pos.x < ground.aabb.maxx) bug('tunnel-through-ground', { id: b.id, y: b.pos.y | 0 });
          if (!b.isStatic && Math.hypot(b.vel.x, b.vel.y) > 2700) bug('speed-explosion', { id: b.id, v: Math.hypot(b.vel.x, b.vel.y) | 0 });
        }
        // viên đá vừa được tính điểm không được nằm trên mặt đất
        if (score > scoreBefore) {
          M.settles++;
          const last = placed[placed.length - 1];
          if (last && touchesGround(last)) bug('scored-stone-on-ground', { score, y: last.pos.y | 0, miny: last.aabb.miny | 0, pedTopY: pedTopY | 0 });
        }
        // đá đã đặt chạm đất mà game vẫn tiếp tục
        if (state === 'aim' || state === 'falling') {
          if (placed.some(touchesGround)) { if (++groundFrames === 30) bug('placed-on-ground-still-playing', { score, state }); } else groundFrames = 0;
        } else groundFrames = 0;
      }
      if (parts.length > M.maxParts) M.maxParts = parts.length;
      if (floats.length > M.maxFloats) M.maxFloats = floats.length;
      if (state === 'falling' && cur) { if (dropT > M.stuckMax) M.stuckMax = dropT; if (dropT > 15) bug('stuck-falling-15s', { dropT: +dropT.toFixed(1), y: cur.pos.y | 0 }); }
      if (state === 'falling' && !cur) bug('falling-without-cur', {});
      if (state === 'aim' && !preview) bug('aim-without-preview', {});
      if (!isFinite(camY) || !isFinite(camZ)) bug('camera-nan', { camY, camZ });
      if (state === 'over' && M.lastState !== 'over') M.overReasons[overMsg] = (M.overReasons[overMsg] || 0) + 1;
      if (score > M.maxScore) M.maxScore = score;
      if (heightCm > M.maxHeight) M.maxHeight = heightCm;
      prevScore = score; M.lastState = state;
      if (M.frames % 30 === 0 && uiScore.textContent !== String(score)) bug('hud-score-mismatch', { hud: uiScore.textContent, score });
      // lớp phủ phải khớp trạng thái
      const menuOn = menu.classList.contains('on'), overOn = over.classList.contains('on');
      if (menuOn && overOn) bug('both-overlays', { state });
      if (state !== 'menu' && menuOn) bug('menu-while-playing', { state });
      if ((state === 'aim' || state === 'falling') && overOn) bug('over-overlay-while-playing', { state });
      // viên đá đang ngắm phải nằm trong màn hình
      if (state === 'aim' && preview && W > 0) {
        const r = preview.radius * 0.75, L = (preview.pos.x - r - W / 2) * camZ + W / 2, R = (preview.pos.x + r - W / 2) * camZ + W / 2;
        if (L < -2 || R > W + 2) bug('preview-offscreen', { L: L | 0, R: R | 0, W });
      }
    } catch (e) { bug('monitor-throw', String(e)); }
  };
  window.render = function () {
    const t0 = performance.now();
    try { origRender(); } catch (e) { bug('render-throw', String((e && e.stack) || e)); }
    const ms = performance.now() - t0; M.sumRenMs += ms; M.nRen++; if (ms > M.maxRenMs) M.maxRenMs = ms;
  };
  const origStart = window.startGame;
  window.startGame = function () { M.games++; prevScore = 0; return origStart.apply(this, arguments); };
  const origDrop = window.drop;
  window.drop = function () { if (state === 'aim' && preview) M.drops++; return origDrop.apply(this, arguments); };
  window.addEventListener('error', e => bug('window-error', String(e.message)));
  window.addEventListener('unhandledrejection', e => bug('unhandled-rejection', String(e.reason)));
})();
