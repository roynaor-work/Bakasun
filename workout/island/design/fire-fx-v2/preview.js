/* Standalone design preview. No game code or external dependencies. */
(() => {
  'use strict';
  const M = globalThis.FIRE_FX_MANIFEST;
  const $ = id => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const W = 544, H = 260;
  const makeCanvas = (w = 128, h = 128) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };
  const background = makeCanvas(W, H), bg = background.getContext('2d');
  const mixed = makeCanvas(), mix = mixed.getContext('2d');
  const haze = makeCanvas(128, 150), hz = haze.getContext('2d');
  const atlas = new Image(), tiles = new Map(), thumbs = [];
  const labels = {
    'flame-small':'להבה קטנה','flame-medium':'להבה בינונית','flame-large':'להבה גדולה',
    'smoke-light':'עשן קל','smoke-heavy':'עשן כבד',steam:'אדי כיבוי',
    ember:'גחלים עפות',spark:'ניצוצות',extinguish:'להבה נכבית',
    soot:'פיח על קיר',heat:'עיוות חום',ignition:'הבזק התלקחות'
  };
  const placeLabels = {wall:'קיר',window:'חלון',roof:'גג'};
  const spots = {
    wall:{x:182,y:233,flame:'flame-small',size:128,phase:0.11,water:null,flash:-99,soot:false},
    window:{x:324,y:204,flame:'flame-medium',size:128,phase:0.37,water:null,flash:-99,soot:false},
    roof:{x:357,y:112,flame:'flame-large',size:120,phase:0.61,water:null,flash:-99,soot:false}
  };
  let selected = 'flame-medium', place = 'window', light = false, heat = true;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let time = 0, last = 0, ready = false, demoStart = 0, raf = 0;
  let thumbTick = -1;

  function fail(message) {
    $('error').hidden = false; $('error').textContent = message;
    cancelAnimationFrame(raf); globalThis.__fireFX = {ready:false,error:message};
  }
  if (!M || !ctx) { fail('לא ניתן לטעון את התצוגה. יש להשאיר את כל קובצי החבילה יחד.'); return; }
  $('weight').textContent = `${(M.atlas.bytes / 1000).toFixed(1)} KB`;
  const order = ['flame-small','flame-medium','flame-large','smoke-light','smoke-heavy','steam','ember','spark','extinguish','soot','heat','ignition'];
  for (const id of order) {
    const button = document.createElement('button'); button.className = 'effect';
    button.dataset.effect = id; button.setAttribute('aria-label',labels[id]);
    button.setAttribute('aria-pressed',String(selected === id));
    const thumb = makeCanvas(112,78); thumb.setAttribute('aria-hidden','true');
    const label = document.createElement('span'); label.textContent = labels[id];
    const count = document.createElement('span'); count.className = 'count';
    count.textContent = `${M.animations[id].frames.length}f`;
    button.append(thumb,label,count); $('library').append(button);
    thumbs.push({id,c:thumb.getContext('2d')});
    button.addEventListener('click',() => {
      selected = id; demoStart = time;
      if (id.startsWith('flame-')) spots[place].flame = id;
      if (id === 'extinguish' || id === 'steam') quench(true);
      if (id === 'ignition') ignite();
      if (id === 'soot') spots[place].soot = true;
      sync(); render();
    });
  }

  function tile(name) {
    if (tiles.has(name)) return tiles.get(name);
    const f = M.frames[name].frame, c = makeCanvas(), g = c.getContext('2d');
    g.drawImage(atlas,f.x,f.y,f.w,f.h,0,0,128,128);
    if (name.startsWith('soot-')) {
      g.globalCompositeOperation = 'source-in'; g.fillStyle = M.animations.soot.tint; g.fillRect(0,0,128,128);
    }
    tiles.set(name,c); return c;
  }
  function frame(id,t) {
    const a = M.animations[id], n = a.frames.length;
    const p = a.loop ? Math.max(0,t)*a.fps : Math.min(n-1,Math.max(0,t)*a.fps);
    const i = Math.floor(p)%n;
    if (!a.loop || n === 1) return tile(a.frames[i]);
    // Weighted premultiplied RGBA addition in an isolated transparent buffer.
    // This preserves opacity through interpolation, including the last→first seam.
    mix.clearRect(0,0,128,128); mix.globalCompositeOperation = 'lighter';
    mix.globalAlpha = 1-(p%1); mix.drawImage(tile(a.frames[i]),0,0);
    mix.globalAlpha = p%1; mix.drawImage(tile(a.frames[(i+1)%n]),0,0);
    mix.globalAlpha = 1; mix.globalCompositeOperation = 'source-over';
    return mixed;
  }
  function envelope(id,age) {
    const a = M.animations[id], points = a.opacityEnvelope;
    if (!points) return 1;
    const p = Math.max(0,Math.min(1,age/a.durationSeconds));
    for (let i = 1; i < points.length; i++) {
      if (p <= points[i][0]) {
        const [x0,y0] = points[i-1], [x1,y1] = points[i];
        const u = (p-x0)/(x1-x0), s = u*u*(3-2*u); return y0+(y1-y0)*s;
      }
    }
    return points.at(-1)[1];
  }
  function draw(id,t,x,y,size,alpha=1,target=ctx,center=false) {
    const a = M.animations[id], p = center ? {x:.5,y:.5} : a.pivot;
    target.save(); target.globalAlpha = Math.max(0,alpha);
    target.globalCompositeOperation = a.blend === 'lighter' ? 'lighter' : 'source-over';
    target.drawImage(frame(id,t),x-size*p.x,y-size*p.y,size,size); target.restore();
  }
  function rounded(g,x,y,w,h,r,fill,stroke) {
    g.beginPath(); g.roundRect(x,y,w,h,r);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }
  function paintBackground() {
    const sky = bg.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,light?'#c7d8dc':'#172c40'); sky.addColorStop(1,light?'#e4e0d2':'#2a3e4a');
    bg.fillStyle=sky; bg.fillRect(0,0,W,H);
    // Quiet silhouettes keep the effects legible at the delivery viewport.
    bg.fillStyle=light?'#aabdc0':'#1e3444';
    [[0,124,53,110],[48,145,48,90],[462,131,43,105],[500,99,44,140]].forEach(r=>bg.fillRect(...r));
    bg.fillStyle=light?'#b8c9c8':'#263f4e';
    [[12,138],[30,138],[475,147],[512,116]].forEach(([x,y])=>bg.fillRect(x,y,9,16));
    bg.fillStyle=light?'#879693':'#172c38'; bg.fillRect(0,235,W,25);
    bg.fillStyle=light?'#c4cebf':'#73868a';
    bg.beginPath(); bg.moveTo(108,124); bg.lineTo(442,124); bg.lineTo(442,237); bg.lineTo(108,237); bg.closePath(); bg.fill();
    const face=bg.createLinearGradient(108,0,442,0);face.addColorStop(0,light?'#c4c7b9':'#7e8b89');face.addColorStop(1,light?'#a9b4ab':'#586e73');
    bg.fillStyle=face;bg.fillRect(108,130,334,104);
    bg.fillStyle=light?'#83978f':'#36505b';bg.beginPath();bg.moveTo(442,124);bg.lineTo(468,137);bg.lineTo(468,231);bg.lineTo(442,237);bg.fill();
    bg.fillStyle=light?'#a4b3ab':'#627c82';bg.beginPath();bg.moveTo(108,124);bg.lineTo(275,79);bg.lineTo(442,124);bg.fill();
    const roof=bg.createLinearGradient(0,80,0,136);roof.addColorStop(0,light?'#6f6d6b':'#4e555d');roof.addColorStop(1,light?'#494e53':'#263e50');
    bg.fillStyle=roof;bg.beginPath();bg.moveTo(83,128);bg.lineTo(273,70);bg.lineTo(466,128);bg.lineTo(446,136);bg.lineTo(273,86);bg.lineTo(105,136);bg.closePath();bg.fill();
    bg.strokeStyle=light?'#98918870':'#92a5b330';bg.lineWidth=1;
    for(let y=91;y<132;y+=8){bg.beginPath();bg.moveTo(103+(132-y)*3,y+1);bg.lineTo(448-(132-y)*3,y+1);bg.stroke();}
    bg.fillStyle=light?'#aeb8ad':'#71878a';bg.fillRect(383,71,18,40);bg.fillStyle=light?'#7b8c88':'#344f5e';bg.fillRect(379,69,26,7);
    rounded(bg,132,166,43,69,2,'#344b57','#b2c2b355');
    rounded(bg,139,173,29,30,1,'#182d3a','#a3b4b733');
    bg.fillStyle='#c2c7ab';bg.beginPath();bg.arc(167,213,2,0,Math.PI*2);bg.fill();
    rounded(bg,280,146,89,65,2,'#0f2531','#bac5ba80');
    const glow=bg.createRadialGradient(324,193,2,324,183,65);glow.addColorStop(0,'#c6783844');glow.addColorStop(1,'#c6783800');bg.fillStyle=glow;bg.fillRect(281,147,87,63);
    bg.fillStyle=light?'#c2c7b5':'#92a7a0';bg.fillRect(321,147,4,63);bg.fillRect(281,174,87,4);bg.fillRect(274,209,102,5);
    rounded(bg,201,150,42,49,1,'#344e58','#b4c2b666');
    bg.strokeStyle=light?'#94a79d':'#90a8a260';
    for(let y=155;y<198;y+=6){bg.beginPath();bg.moveTo(205,y);bg.lineTo(239,y);bg.stroke();}
    bg.fillStyle=light?'#8a9e93':'#3b5761';bg.fillRect(103,233,342,5);
    bg.fillStyle=light?'#aab7a9':'#48616a';bg.fillRect(127,237,54,3);bg.fillRect(121,240,65,3);
    // Fine wall joints make the heat displacement visible without extra artwork.
    bg.strokeStyle=light?'#687f771b':'#bdcfbd13';
    for(let y=141;y<232;y+=12){bg.beginPath();bg.moveTo(376,y);bg.lineTo(436,y);bg.stroke();}
    bg.fillStyle=light?'#566e67':'#162e38';
    for(let i=0;i<7;i++){bg.beginPath();bg.ellipse(489+i*5,230-i%3*4,8,12+i%4*3,-.2,0,Math.PI*2);bg.fill();}
  }
  function distortion(s,t,target=ctx) {
    const size=128,left=s.x-64,top=s.y-141;
    hz.clearRect(0,0,128,150);
    for(let y=0;y<150;y+=2){
      const dx=Math.sin(y/150*28-t*7)*M.animations.heat.displacement.strengthPixels;
      hz.drawImage(background,left+dx,top+y,128,2,0,y,128,2);
    }
    hz.globalCompositeOperation='destination-in';hz.drawImage(frame('heat',t),0,0,128,150);hz.globalCompositeOperation='source-over';
    target.drawImage(haze,left,top,size,150);
  }
  function particles(s,t,kind,boost=1,target=ctx) {
    const count=kind==='ember'?11:7;
    for(let i=0;i<count;i++){
      const lifetime=kind==='ember'?.8+(i%5)*.16:.4+(i%3)*.09;
      const age=((t+i*.173)%lifetime)/lifetime;
      const x=s.x+Math.sin(i*9.7)*age*(kind==='ember'?31:43)+Math.sin(age*6+i)*4;
      const y=s.y-12-age*(kind==='ember'?105:74);
      draw(kind,0,x,y,(kind==='ember'?25:29)*boost,(1-age)*.9,target,true);
    }
  }
  function render() {
    if(!ready)return;
    ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,W,H);ctx.drawImage(background,0,0);
    // Heat reads only the background snapshot, so it cannot recursively smear fire.
    for(const s of Object.values(spots)){
      if(s.soot)draw('soot',0,s.x,s.y-16,119,1,ctx,true);
      if(heat && s.water===null)distortion(s,time+s.phase);
    }
    for(const [key,s] of Object.entries(spots)){
      const age=s.water===null?null:time-s.water;
      if(age===null){
        draw('smoke-light',time+s.phase,s.x+3,s.y-47,151,.33);
        draw(s.flame,time+s.phase,s.x,s.y,s.size,key===place?1:.94);
        particles(s,time+s.phase,'ember');particles(s,time+s.phase,'spark');
      }else{
        if(age<M.animations.extinguish.durationSeconds)draw('extinguish',age,s.x,s.y,s.size*M.animations.extinguish.scaleByFlame[s.flame],envelope('extinguish',age));
        if(age<M.animations.steam.durationSeconds)draw('steam',age,s.x,s.y,163,envelope('steam',age));
        if(age<.32){
          ctx.save();ctx.strokeStyle=`rgba(182,228,244,${(1-age/.32)*.75})`;ctx.lineWidth=3;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(0,253);ctx.quadraticCurveTo(s.x*.5,170,s.x,s.y-10);ctx.stroke();ctx.restore();
        }
      }
      const flashAge=time-s.flash;
      if(flashAge>=0 && flashAge<M.animations.ignition.durationSeconds)draw('ignition',0,s.x,s.y-22,150,envelope('ignition',flashAge),ctx,true);
    }
    const s=spots[place],t=time-demoStart;
    if(selected==='smoke-heavy'||selected==='smoke-light')draw(selected,t,s.x,s.y,176,.95);
    if(selected==='ember'||selected==='spark')particles(s,t,selected,2.2);
    if(selected==='heat' && heat){
      ctx.save();ctx.strokeStyle='#bad0da55';ctx.setLineDash([3,4]);ctx.strokeRect(s.x-58,s.y-137,116,126);ctx.restore();
    }
    // Thumbnails update at 12 fps; the main scene remains requestAnimationFrame driven.
    if(Math.floor(time*12)!==thumbTick){thumbTick=Math.floor(time*12);paintThumbs();}
    syncState();
  }
  function paintThumbs(){
    for(const {id,c} of thumbs){
      c.clearRect(0,0,112,78);const a=M.animations[id];
      const t=a.loop?time:(time%a.durationSeconds)*.72;
      if(id==='heat'){
        c.strokeStyle='#526278';c.lineWidth=1;
        for(let x=26;x<88;x+=8){c.beginPath();for(let y=3;y<60;y++){const px=x+Math.sin(y*.22-time*7)*2.5; y===3?c.moveTo(px,y):c.lineTo(px,y);}c.stroke();}
      }else if(id==='ember'||id==='spark'){
        for(let i=0;i<4;i++)draw(id,0,35+i*13,50-((time*.7+i*.23)%1)*37,49,1,c,true);
      }else if(id==='soot'){draw(id,0,56,34,70,1,c,true);
      }else{
        draw(id,t,56,a.pivot.y>.5?67:34,id.startsWith('flame')?72:69,a.loop?1:Math.max(.45,envelope(id,t)),c);
      }
    }
  }
  function syncState(){
    const s=spots[place],age=s.water===null?null:time-s.water;
    const label=age!==null?(age<.5?'כיבוי ואדים':'האש כבתה · פיח נשאר'):labels[selected];
    $('state').textContent=`${label} · ${placeLabels[place]}`;
  }
  function sync(){
    document.querySelectorAll('[data-effect]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.effect===selected)));
    document.querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===place)));
    $('heat').setAttribute('aria-pressed',String(heat));
    $('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'▷':'Ⅱ';
    $('pause').setAttribute('aria-label',paused?'הפעלת האנימציה':'השהיית האנימציה');
    syncState();
  }
  function quench(restart=false){const s=spots[place];if(s.water===null||restart===true)s.water=time;s.soot=true;sync();render();}
  function ignite(){const s=spots[place];s.water=null;s.flash=time;s.soot=false;demoStart=time;sync();render();}
  document.querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',()=>{
    place=b.dataset.place;selected=spots[place].flame;demoStart=time;sync();render();
  }));
  $('quench').addEventListener('click',quench);$('ignite').addEventListener('click',ignite);
  $('heat').addEventListener('click',()=>{heat=!heat;sync();render();});
  $('background').addEventListener('click',()=>{light=!light;$('background').textContent=light?'רקע כהה':'רקע בהיר';paintBackground();thumbTick=-1;render();});
  $('pause').addEventListener('click',()=>{paused=!paused;sync();render();});
  document.addEventListener('visibilitychange',()=>{last=0;});
  function tick(stamp){
    if(!paused && !document.hidden && last)time+=Math.min(.05,(stamp-last)/1000);
    last=stamp;
    if(!paused && !document.hidden)render();
    raf=requestAnimationFrame(tick);
  }
  atlas.onerror=()=>fail('קובץ האטלס לא נטען. יש לפתוח את preview.html לצד fire-fx.webp ושאר קובצי החבילה.');
  atlas.onload=()=>{
    if(atlas.naturalWidth!==1024||atlas.naturalHeight!==1024){fail('ממדי האטלס אינם תואמים למניפסט.');return;}
    ready=true;paintBackground();sync();render();raf=requestAnimationFrame(tick);
    // Small read/step interface for deterministic visual verification.
    globalThis.__fireFX={
      ready:true,manifest:M,
      state:()=>({selected,place,light,heat,paused,time,spots:JSON.parse(JSON.stringify(spots)),cachedTiles:tiles.size}),
      seek:value=>{time=Math.max(0,value);thumbTick=-1;render();},
      dispose:()=>{cancelAnimationFrame(raf);tiles.clear();ready=false;}
    };
  };
  atlas.src=M.atlas.image;
})();
