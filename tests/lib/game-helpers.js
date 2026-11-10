'use strict';
/* Thao tác dùng chung khi lái game trong test */
const placeOne = async page => {          // thả khi thẳng tâm viên trên cùng rồi chờ đứng yên
  await page.evaluate(`(async()=>{for(let k=0;k<1200;k++){ if(state!=='aim')return; const t=topStone(); const x=t?t.pos.x:centerX;
    if(Math.abs(preview.pos.x-x)<5 && performance.now()>=inputBlockUntil){drop();return;} await new Promise(r=>requestAnimationFrame(r));}})()`);
  await page.waitForFunction(`state!=='falling'`, null, { timeout: 20000 }).catch(() => {});
};
const waitOverlay = (page, id, ms) => page.waitForFunction(`document.getElementById(${JSON.stringify(id)}).classList.contains('on')`, null, { timeout: ms || 8000 }).then(() => true).catch(() => false);
const startByClick = async page => { await page.click('#btnStart'); await page.waitForFunction(`state==='aim' && performance.now()>=inputBlockUntil`, null, { timeout: 5000 }); };
/* Dựng nhanh tháp n viên thẳng tâm bằng cách đặt trực tiếp (cần FREEZE_RAF hoặc chấp nhận vật lý chạy song song) */
const BUILD_TOWER = `(function(n, leanStep){ let x=centerX; for(let i=0;i<n;i++){ const s=preview; preview=null; x+=(leanStep||0); const tp=topStone();
  s.pos.x = leanStep? x : (tp? tp.pos.x : centerX); s.angle=0; s.updateTransform(); s.pos.y += (towerTopY()-0.5) - s.aabb.maxy; s.updateTransform();
  s.vel={x:0,y:0}; s.av=0; world.add(s); placed.push(s); score++; for(let k=0;k<90;k++) update(1/60); if(state==='over') return i; spawnPreview(); } return n; })`;
module.exports = { placeOne, waitOverlay, startByClick, BUILD_TOWER };
