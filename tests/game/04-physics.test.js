'use strict';
/* Vật lý + luật chơi: fuzz hình đá, va chạm, xuyên đất, trôi, và "đá nằm trên mặt đất không bao giờ được tính điểm". */
const { test, check, openGame, FREEZE_RAF, inpage, finish } = require('../lib/harness');
const { BUILD_TOWER } = require('../lib/game-helpers');
const N = +(process.env.FUZZ_SCALE || 1);

(async () => {
  const p = await openGame({}, FREEZE_RAF);
  p.setDefaultTimeout(600000);

  await test('P1 hình đá: luôn lồi, đủ đỉnh, có mặt tựa, khối lượng hợp lệ', async () => {
    const r = await p.evaluate(`((n)=>{ const bad={nonConvex:0,few:0,dup:0,mass:0,noFace:0};
      for(let i=0;i<n;i++){ const d=(i%19)/18, rr=(i%2?42:48)-d*15; const s=makeStoneShape(rr,0.42+d*0.52);
        if(s.length<4||s.length>8) bad.few++;
        let sign=0; for(let k=0;k<s.length;k++){ const a=s[k],b=s[(k+1)%s.length],c=s[(k+2)%s.length]; const cr=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x); if(Math.abs(cr)>1e-9){ const g=Math.sign(cr); if(!sign) sign=g; else if(g!==sign){bad.nonConvex++;break;} } }
        for(let k=0;k<s.length;k++) for(let j=k+1;j<s.length;j++) if(Math.hypot(s[k].x-s[j].x,s[k].y-s[j].y)<0.5) bad.dup++;
        const f=faceInfo(s); if(!(f.botLen>f.w*0.64 && f.topLen>f.w*0.52 && f.topTilt<0.26)) bad.noFace++;
        const b=new Body(s,{density:0.0013}); if(!(b.mass>0)||!(b.I>0)||!isFinite(b.mass+b.I)) bad.mass++; }
      return bad; })(${20000 * N})`);
    check(r.nonConvex === 0 && r.few === 0 && r.dup === 0 && r.mass === 0 && r.noFace <= 4 * N, 'hình đá lỗi', r); return r;
  });

  await test('P2 va chạm ngẫu nhiên: pháp tuyến đơn vị, điểm chạm hữu hạn, tối đa 2 điểm', async () => {
    const r = await p.evaluate(`((n)=>{ const shapes=[]; for(let i=0;i<150;i++) shapes.push(makeStoneShape(30+Math.random()*25, Math.random()));
      let hits=0,bad=0; for(let i=0;i<n;i++){ const A=new Body(shapes[Math.random()*150|0],{x:0,y:0,angle:Math.random()*6.283});
        const B=new Body(shapes[Math.random()*150|0],{x:(Math.random()-0.5)*90,y:(Math.random()-0.5)*90,angle:Math.random()*6.283});
        const m=collide(A,B); if(!m) continue; hits++; if(Math.abs(Math.hypot(m.normal.x,m.normal.y)-1)>1e-6||m.contacts.length>2) bad++;
        for(const c of m.contacts) if(!isFinite(c.point.x+c.point.y+c.separation)||c.separation>1e-9) bad++; }
      return {hits,bad}; })(${100000 * N})`);
    check(r.bad === 0 && r.hits > 1000, 'va chạm lỗi', r); return r;
  });

  await test('P3 đá rơi tốc độ tối đa không xuyên đất', async () => {
    const r = await p.evaluate(`(()=>{ let t=0; for(let k=0;k<150;k++){ const w=new World(); w.add(new Body(boxVerts(2000,240),{isStatic:true,x:200,y:900}));
      const s=new Body(makeStoneShape(20+Math.random()*30,1),{x:200,y:-5000,angle:Math.random()*6.28}); s.vel={x:(Math.random()-0.5)*800,y:2600}; w.add(s);
      for(let i=0;i<150*6;i++) w.step(1/150); if(s.pos.y>800||!isFinite(s.pos.y)) t++; } return {tunnel:t}; })()`);
    check(r.tunnel === 0, 'xuyên đất', r);
  });

  await test('P4 đá đứng yên 60 giây không tự trôi; ma sát giữ được trên dốc 25°, trượt ở 50°', async () => {
    const r = await p.evaluate(`(()=>{ let maxDx=0; for(let k=0;k<15;k++){ const w=new World(); w.add(new Body(boxVerts(2000,240),{isStatic:true,x:200,y:900,friction:0.95}));
        const s=new Body(makeStoneShape(45,0.6),{friction:1.05,density:0.0013}); s.pos.x=200; s.updateTransform(); s.pos.y+=(780-s.aabb.maxy); s.updateTransform(); w.add(s);
        for(let i=0;i<450;i++) w.step(1/150); const x0=s.pos.x; for(let i=0;i<150*60;i++) w.step(1/150); maxDx=Math.max(maxDx,Math.abs(s.pos.x-x0)); }
      const slope=deg=>{ const w=new World(); w.add(new Body(boxVerts(900,60),{isStatic:true,x:200,y:600,friction:0.95,angle:deg*Math.PI/180}));
        const b=new Body(boxVerts(90,40),{x:200,y:400,friction:0.95}); w.add(b); for(let i=0;i<600;i++) w.step(1/150); const x0=b.pos.x; for(let i=0;i<300;i++) w.step(1/150); return Math.abs(b.pos.x-x0); };
      return {maxDrift:+maxDx.toFixed(3), hold25:+slope(25).toFixed(2), slide50:+slope(50).toFixed(1)}; })()`);
    check(r.maxDrift < 1 && r.hold25 < 1 && r.slide50 > 20, 'ma sát / trôi sai', r); return r;
  });

  await test('P5 tháp 30 viên đặt thẳng: không NaN, cập nhật nhanh, camera thu nhỏ đúng', async () => {
    const r = await p.evaluate(`(()=>{ startGame(); const built=${BUILD_TOWER}(30,0);
      let nan=false; for(const b of world.bodies) if(!isFinite(b.pos.x+b.pos.y+b.angle)) nan=true;
      const t0=performance.now(); for(let i=0;i<120;i++) update(1/60); const upd=(performance.now()-t0)/120;
      const r0=performance.now(); for(let i=0;i<60;i++) render(); const ren=(performance.now()-r0)/60;
      return {built, nan, updMs:+upd.toFixed(2), renMs:+ren.toFixed(2), camZ:+camZ.toFixed(2), heightCm, state}; })()`);
    check(!r.nan && r.updMs < 8 && r.camZ >= 0.5 && r.camZ <= 1.6, 'tháp cao lỗi', r); return r;
  });

  await test('P6 luật chơi: viên đá nằm trên MẶT ĐẤT không bao giờ được tính điểm (fuzz thả lệch)', async () => {
    await p.evaluate(inpage('monitor.inpage.js')); await p.evaluate(inpage('sim.inpage.js'));
    const r = await p.evaluate(`((frames)=>{ __sim.renderEvery=0; const pick=()=>{ __sim.mode = Math.random()<0.7?'edge':'random'; __sim.tol=4; };
      const nm=__sim.newMode; __sim.newMode=pick; pick(); startGame();
      for(let i=0;i<frames/600;i++) __sim.run(600);
      __sim.newMode=nm; return {games:__mon.games, drops:__mon.drops, settles:__mon.settles, bugKeys:__mon.bugKeys, sample:__mon.bugs.filter(b=>/ground/.test(b.key)).slice(0,2)}; })(${3600 * 12 * N})`);
    check(!r.bugKeys['scored-stone-on-ground'] && !r.bugKeys['placed-on-ground-still-playing'], 'đá trên mặt đất vẫn được tính', r);
    check(Object.keys(r.bugKeys).length === 0, 'vi phạm bất biến', r); return { games: r.games, drops: r.drops };
  });

  await test('P7 dựng sẵn: viên đá dài dựng đứng tựa vào sườn chân đế phải bị tính là rơi', async () => {
    const r = await p.evaluate(`(()=>{ const out=[]; for(let k=0;k<40;k++){ startGame();
        const s=preview; preview=null; const side=k%2?1:-1;
        // viên đá dài (hình hộp 26x118) dựng gần đứng, tựa sườn chân đế, chân chạm đất
        const b=new Body(boxVerts(24+Math.random()*10, 104+Math.random()*16), {friction:1.05, density:0.0013}); b.style=s.style;
        b.angle=side*(0.25+Math.random()*0.35); b.pos.x=(side>0?pedRight:pedLeft)+side*(34+Math.random()*30); b.pos.y=ground.aabb.miny-70; b.updateTransform();
        b.pos.y+=(ground.aabb.miny-1)-b.aabb.maxy; b.updateTransform();
        cur=b; world.add(b); state='falling'; dropT=0; settleT=0;
        let res='timeout'; for(let i=0;i<60*8;i++){ update(1/60); if(state==='over'){res='over';break;} if(state==='aim'){res='SCORED';break;} }
        out.push(res); }
      const c={}; out.forEach(o=>c[o]=(c[o]||0)+1); return c; })()`);
    check(!r.SCORED && !r.timeout, 'đá tựa sườn chân đế/chạm đất vẫn được tính điểm hoặc kẹt', r); return r;
  });

  await test('P8 tốc độ khung hình 30 / 60 / 120 fps cho kết quả chơi tương đương (bước vật lý cố định)', async () => {
    const r = await p.evaluate(`((games)=>{ const out={};
      for(const fps of [30,60,120]){ let sum=0, n=0, guard=0; startGame();
        while(n<games && guard++<400000){ update(1/fps);
          if(state==='aim' && preview && performance.now()>=0){ const tp=topStone(), tgt=tp?tp.pos.x:centerX; if(Math.abs(preview.pos.x-tgt)<3.5){ inputBlockUntil=0; drop(); } }
          if(state==='over'){ sum+=score; n++; over.classList.remove('on'); startGame(); } }
        out[fps]=+(sum/Math.max(1,n)).toFixed(2); }
      return out; })(${40 * N})`);
    const v = [r[30], r[60], r[120]], mx = Math.max(...v), mn = Math.min(...v);
    check(mn > 2 && mx / mn < 1.8, 'kết quả lệch nhiều theo fps', r); return r;
  });

  await p.context().close();
  await finish();
})();
