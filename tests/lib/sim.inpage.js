// Tua nhanh: tự gọi update(1/60) với bot nhiều chiến thuật (cần FREEZE_RAF). Dùng: __sim.run(frames)
(function () {
  const S = window.__sim = { t: 0, mode: 'target', waitUntil: 0, retryAt: 0, lastPreview: null, tol: 4, modeStats: {}, renderEvery: 10 };
  const modes = ['target', 'perfect', 'random', 'immediate', 'sloppy', 'edge'];
  S.newMode = () => { S.mode = modes[Math.random() * modes.length | 0]; S.tol = S.mode === 'sloppy' ? 25 : S.mode === 'perfect' ? 2.5 : 4; };
  S.newMode();
  S.run = function (frames) {
    for (let i = 0; i < frames; i++) {
      S.t += 1 / 60;
      update(1 / 60);
      if (S.renderEvery && i % S.renderEvery === 0) render();
      if (state === 'aim' && preview) {
        if (preview !== S.lastPreview) { S.lastPreview = preview; S.waitUntil = S.t + (S.mode === 'random' ? 0.2 + Math.random() * 2.8 : S.mode === 'immediate' ? 0 : 0.15); }
        if (S.t >= S.waitUntil) {
          if (S.mode === 'target' || S.mode === 'sloppy' || S.mode === 'perfect') {
            const tp = topStone(), tgt = tp ? tp.pos.x : centerX;
            if (Math.abs(preview.pos.x - tgt) < S.tol) drop();
          } else if (S.mode === 'edge') {            // cố tình thả ở mép chân đế / ngoài chân đế
            const tgt = Math.random() < 0.5 ? pedLeft - 10 : pedRight + 10;
            if (Math.abs(preview.pos.x - tgt) < 12 || S.t > S.waitUntil + 4) drop();
          } else drop();
        }
      }
      if (state === 'over' && over.classList.contains('on')) {
        if (!S.retryAt) S.retryAt = S.t + 0.3 + Math.random() * 1.2;
        if (S.t >= S.retryAt) {
          S.retryAt = 0;
          const st = S.modeStats[S.mode] || (S.modeStats[S.mode] = { games: 0, sum: 0, max: 0 });
          st.games++; st.sum += score; st.max = Math.max(st.max, score);
          S.newMode(); startGame();
        }
      }
    }
  };
})();
