/* Standalone review player. No existing game code, storage or network services. */
(() => {
  'use strict';
  const {manifest, patterns} = window.AlienEnemiesV2;
  const $ = id => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const stateIds = manifest.damageStates.map(s => s.id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  let playing = !reducedMotion.matches && params.get('paused') !== '1';
  let enemy, pattern, atlas, loadToken = 0, time = 0, moveTime = 0;
  let state = 'healthy', mode = 'alive', deathTime = 0, deathPosition;
  let phase = 'idle', windupStart = 0, nextWindup = 900, phaseEnd = 0;
  let lockedTarget = {x:0,y:0}, shots = [], beam = null, children = [], didSplit = false;
  let veilEnd = 0, targetX = .5, width = 560, height = 200;
  let previousTimestamp = null, raf = 0, dirty = true, lastCaption = '';
  const atlasCache = new Map();
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  function sampleMovement(m, ms) {
    const points = m.points, count = points.length - 1;
    const t = ((ms % m.durationMs) + m.durationMs) % m.durationMs / m.durationMs;
    let index = points.findIndex((p,i) => i < count && t >= p.t && t < points[i+1].t);
    if (index < 0) index = count - 1;
    const a = points[index], b = points[index+1], u = (t-a.t)/(b.t-a.t);
    const result = {};
    for (const key of ['x','y']) {
      if (m.interpolation === 'linear') result[key] = a[key] + (b[key]-a[key])*u;
      else {
        const p0 = points[(index-1+count)%count][key], p3 = points[(index+2)%count][key];
        result[key] = .5*(2*a[key]+(-p0+b[key])*u+(2*p0-5*a[key]+4*b[key]-p3)*u*u+(-p0+3*a[key]-3*b[key]+p3)*u*u*u);
      }
    }
    return result;
  }
  function world(p) { return {x:56+p.x*(width-112), y:44+p.y*Math.max(30,height-105)}; }
  function position() { return world(sampleMovement(pattern.movement, moveTime)); }
  function target() { return {x:width*targetX,y:height-19}; }
  function unitScale() { return Math.min(width/844,height/390); }
  function frameIndex() {
    if (mode === 'gone') return null;
    if (mode === 'death') return 18 + Math.min(5, Math.floor(deathTime*8/1000));
    return stateIds.indexOf(state)*6 + Math.floor((time+0.000001)*6/1000)%6;
  }
  function sprite(index, x,y,size=104,alpha=1,angle=0) {
    if (!atlas || index === null) return;
    ctx.save(); ctx.globalAlpha=alpha; ctx.translate(x,y); ctx.rotate(angle);
    ctx.drawImage(atlas,(index%6)*256,Math.floor(index/6)*256,256,256,-size/2,-size/2,size,size);
    ctx.restore();
  }
  async function image(path) {
    const img = new Image(); img.decoding='async';
    const loaded = new Promise((resolve,reject) => {img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`לא ניתן לטעון את ${path}`));});
    img.src=path; return loaded;
  }
  async function select(id) {
    const found = manifest.enemies.find(e=>e.id===id);
    if (!found) throw new Error(`Unknown enemy: ${id}`);
    const token=++loadToken;
    $('app').dataset.ready='false';
    enemy=found; pattern=patterns.enemies[id]; atlas=null;
    time=0;moveTime=0;state='healthy';mode='alive';deathTime=0;phase='idle';nextWindup=pattern.attack.firstWindupAtMs;
    shots=[];beam=null;children=[];didSplit=false;veilEnd=0;
    $('enemy-name').textContent=enemy.nameHe; $('tagline').textContent=enemy.taglineHe;
    document.querySelectorAll('[data-enemy]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.enemy===id)));
    updateControls(); dirty=true;
    try {
      let pending=atlasCache.get(id);
      if (!pending) {pending=image(enemy.assets.atlas.path);atlasCache.set(id,pending);}
      const loaded=await pending;
      if (token!==loadToken) return;
      atlas=loaded;
      for (const key of atlasCache.keys()) if (atlasCache.size>2 && key!==id) atlasCache.delete(key);
      dirty=true;draw();$('app').dataset.ready='true';
    } catch(error) {atlasCache.delete(id); if(token===loadToken) showError(error); throw error;}
  }
  function showError(error) {$('error').hidden=false;$('error').textContent=error.message;}
  function setDamageState(id) {
    if (!stateIds.includes(id)) throw new Error('Unknown damage state');
    const before=state;state=id;
    if (mode!=='alive') {mode='alive';phase='idle';nextWindup=time+900;deathTime=0;}
    if (id==='healthy') {children=[];didSplit=false;}
    const special=pattern.special;
    if (special.type==='split-on-damage' && before==='healthy' && id!=='healthy' && !didSplit) {
      didSplit=true;
      children=special.offsetsPx.map(([x,y])=>({x,y,born:time}));
    }
    updateControls();dirty=true;draw();
  }
  function playDeath() {
    if (mode==='gone') {setDamageState('healthy');return;}
    deathPosition=position();deathTime=0;mode='death';phase='idle';shots=[];beam=null;children=[];veilEnd=0;
    updateControls();dirty=true;draw();
  }
  function beginWindup() {
    if (mode!=='alive' || phase!=='idle') return;
    phase='windup';windupStart=time;phaseEnd=time+pattern.attack.windupMs;
    lockedTarget={...target()};nextWindup=time+pattern.attack.intervalMs;
    dirty=true;updateControls();
  }
  function fire() {
    const attack=pattern.attack, p=position(), scale=unitScale();
    const origin={x:p.x,y:p.y+13};
    const aim=attack.targeting==='fixed-down'?{x:p.x,y:height}:{...lockedTarget};
    const angle=Math.atan2(aim.y-origin.y,aim.x-origin.x);
    if (attack.kind==='beam') {
      const length=Math.min(attack.beam.maxLengthPx*scale,Math.hypot(aim.x-origin.x,aim.y-origin.y));
      beam={x:origin.x,y:origin.y,endX:origin.x+Math.cos(angle)*length,endY:origin.y+Math.sin(angle)*length,until:time+attack.beam.activeMs};
      phaseEnd=time+attack.beam.activeMs;
    } else {
      const spec=attack.projectile;
      for(let i=0;i<spec.count;i++) {
        if(shots.length>=Math.min(spec.maxActivePerEnemy,patterns.rules.maxProjectilesGlobal)) break;
        const offset=spec.count===1?0:(i/(spec.count-1)-.5)*spec.spreadDegrees*Math.PI/180;
        shots.push({x:origin.x,y:origin.y,vx:Math.cos(angle+offset)*spec.speedPxPerSecond*scale,
                    vy:Math.sin(angle+offset)*spec.speedPxPerSecond*scale,born:time,radius:spec.radiusPx*scale});
      }
      phaseEnd=time+220;
    }
    if(pattern.special.type==='soft-veil') veilEnd=time+pattern.special.durationMs;
    phase='active';dirty=true;updateControls();
  }
  function advance(ms) {
    if(!enemy || !atlas) return;
    if(mode==='death') {
      deathTime+=ms;
      if(deathTime>=enemy.animations.death.durationMs) {mode='gone';updateControls();}
      dirty=true;return;
    }
    if(mode==='gone') return;
    time+=ms;
    if(!(phase==='windup' && pattern.special.pauseMovementDuringWindup)) moveTime+=ms;
    for(const s of shots) {s.x+=s.vx*ms/1000;s.y+=s.vy*ms/1000;}
    shots=shots.filter(s=>time-s.born<(pattern.attack.projectile?.maxLifetimeMs??0) && s.y<height+12 && s.x>-12 && s.x<width+12);
    if(beam && time>=beam.until) beam=null;
    children=children.filter(c=>time-c.born<pattern.special.childLifetimeMs);
    if(phase==='idle' && time>=nextWindup) beginWindup();
    if(phase==='windup' && time>=phaseEnd) fire();
    else if(phase==='active' && time>=phaseEnd) {phase='recovery';phaseEnd=time+pattern.attack.recoveryMs;updateControls();}
    else if(phase==='recovery' && time>=phaseEnd) {phase='idle';updateControls();}
    dirty=true;
  }
  function updateControls() {
    const label=manifest.damageStates.find(s=>s.id===state).nameHe;
    $('state-label').textContent=mode==='alive'?label:mode==='gone'?'עד הפעם הבאה':'פוף…';
    document.querySelectorAll('[data-state]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.state===state)));
    $('play').textContent=playing?'השהיה':'הפעלה';$('play').setAttribute('aria-pressed',String(!playing));
    $('attack').disabled=mode!=='alive'||phase!=='idle';
    $('death').disabled=mode==='death';
    $('death').textContent=mode==='gone'?'החזרה ✧':'היעלמות ✧';
  }
  function caption() {
    const text=mode==='gone'?'נפגשים בטיסה הבאה':mode==='death'?'בועות, נצנצים… ונעלמים':phase==='windup'?'מתכונן · הכיוון כבר נבחר':phase==='active'?enemy.attackLabelHe:`${enemy.movementLabelHe} · ${enemy.attackLabelHe}`;
    if(text!==lastCaption){$('phase').textContent=text;lastCaption=text;}
  }
  function draw() {
    if(!dirty) return;dirty=false;
    ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#13263d');bg.addColorStop(1,'#19344c');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    for(let i=0;i<36;i++) {ctx.globalAlpha=.18+(i%3)*.1;ctx.fillStyle=i%4===0?'#a8ded3':'#d3e4f3';ctx.beginPath();ctx.arc((i*127+31)%width,(i*53+13)%height,i%5===0?1.4:.7,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
    if(!enemy) return;
    if($('show-path').checked && mode==='alive') {
      ctx.save();ctx.strokeStyle='#77b1b3';ctx.globalAlpha=.3;ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.beginPath();
      for(let i=0;i<=100;i++){const p=world(sampleMovement(pattern.movement,pattern.movement.durationMs*i/100));if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.restore();
    }
    const t=target();ctx.save();ctx.strokeStyle='#9ad9cd';ctx.lineWidth=1.5;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(t.x,t.y,9,0,Math.PI*2);ctx.moveTo(t.x-14,t.y);ctx.lineTo(t.x-5,t.y);ctx.moveTo(t.x+5,t.y);ctx.lineTo(t.x+14,t.y);ctx.moveTo(t.x,t.y-14);ctx.lineTo(t.x,t.y-5);ctx.stroke();ctx.fillStyle='#bed3df';ctx.font='10px Arial';ctx.textAlign='right';ctx.direction='rtl';ctx.fillText('נקודת כיוון',t.x-18,t.y+3);ctx.restore();
    if(mode==='gone') {caption();return;}
    const p=mode==='death'?deathPosition:position();
    if(phase==='windup' && mode==='alive') {
      const progress=clamp((time-windupStart)/pattern.attack.windupMs,0,1);
      ctx.save();ctx.strokeStyle=enemy.accent;ctx.globalAlpha=.35+.3*progress;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,34+progress*12,0,Math.PI*2);ctx.stroke();
      if(pattern.attack.kind==='beam') {ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(p.x,p.y+15);ctx.lineTo(lockedTarget.x,lockedTarget.y);ctx.stroke();}ctx.restore();
    }
    if(mode==='alive' && pattern.special.type==='shield-cycle' && time%pattern.special.periodMs<pattern.special.activeMs) {
      ctx.save();ctx.strokeStyle='#9ee8d5';ctx.globalAlpha=.5;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,47,.1*Math.PI,.9*Math.PI);ctx.stroke();ctx.restore();
    }
    const next=sampleMovement(pattern.movement,moveTime+40), prev=sampleMovement(pattern.movement,moveTime-40);
    const bank=mode==='alive'?clamp((next.x-prev.x)*3,-1,1)*pattern.movement.bankDegrees*Math.PI/180:0;
    if(time<veilEnd && mode==='alive') sprite(frameIndex(),p.x,p.y,200,pattern.special.opacity);
    sprite(frameIndex(),p.x,p.y,104,1,bank);
    for(const child of children) {
      const age=time-child.born;const spread=Math.min(15,age/180);
      sprite(Math.floor(time*6/1000)%6,p.x+child.x+Math.sign(child.x)*spread,p.y+child.y+Math.sin(age/300)*4,104*pattern.special.childScale);
    }
    for(const s of shots) {
      ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle=enemy.accent;ctx.strokeStyle='#e4f9ff';ctx.lineWidth=1.2;
      if(pattern.attack.kind==='foam-rocket') {ctx.rotate(Math.atan2(s.vy,s.vx)-Math.PI/2);ctx.beginPath();ctx.roundRect(-4,-7,8,14,4);ctx.fill();ctx.stroke();ctx.fillStyle='#b2efdc';ctx.beginPath();ctx.arc(0,-11,2,0,Math.PI*2);ctx.fill();}
      else {ctx.beginPath();ctx.arc(0,0,Math.max(3,s.radius),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-1,-1,1,0,Math.PI*2);ctx.fill();}ctx.restore();
    }
    if(beam) {ctx.save();ctx.lineCap='round';ctx.strokeStyle=enemy.accent;ctx.globalAlpha=.75;ctx.lineWidth=pattern.attack.beam.widthPx*unitScale();ctx.beginPath();ctx.moveTo(beam.x,beam.y);ctx.lineTo(beam.endX,beam.endY);ctx.stroke();ctx.strokeStyle='#eaddff';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
    caption();
  }
  function resize() {
    const box=canvas.getBoundingClientRect();
    const oldWidth=width,oldHeight=height;width=box.width;height=box.height;
    const sx=width/oldWidth,sy=height/oldHeight;
    lockedTarget={x:lockedTarget.x*sx,y:lockedTarget.y*sy};
    if(deathPosition) deathPosition={x:deathPosition.x*sx,y:deathPosition.y*sy};
    // Resizing clears projectiles so old coordinates cannot produce a surprise hit.
    shots=[];beam=null;
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);dirty=true;draw();
  }
  function loop(timestamp) {
    const dt=previousTimestamp===null?0:Math.min(50,timestamp-previousTimestamp);previousTimestamp=timestamp;
    if(playing) advance(dt);draw();raf=requestAnimationFrame(loop);
  }
  for(const e of manifest.enemies) {
    const button=document.createElement('button');button.type='button';button.className='alien-button';button.dataset.enemy=e.id;button.title=e.nameHe;button.setAttribute('aria-label',e.nameHe);button.setAttribute('aria-pressed','false');
    const number=document.createElement('span');number.className='number';number.textContent=String(e.order).padStart(2,'0');number.setAttribute('aria-hidden','true');
    const thumb=document.createElement('img');thumb.src=e.assets.states[0].path;thumb.alt='';thumb.width=41;thumb.height=41;
    const name=document.createElement('span');name.className='short-name';name.textContent=e.nameHe.replace(/^חייזר[־ ]/,'');
    button.append(number,thumb,name);button.addEventListener('click',()=>select(e.id).catch(()=>{}));$('roster').append(button);
  }
  $('play').addEventListener('click',()=>{playing=!playing;previousTimestamp=null;updateControls();});
  $('show-path').addEventListener('change',()=>{dirty=true;draw();});
  $('death').addEventListener('click',playDeath);$('attack').addEventListener('click',beginWindup);
  document.querySelectorAll('[data-state]').forEach(b=>b.addEventListener('click',()=>setDamageState(b.dataset.state)));
  canvas.addEventListener('pointerdown',event=>{targetX=clamp((event.clientX-canvas.getBoundingClientRect().left)/width,.12,.88);dirty=true;draw();});
  canvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();targetX=clamp(targetX+(event.key==='ArrowLeft'?-.05:.05),.12,.88);dirty=true;draw();}});
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);previousTimestamp=null;if(!document.hidden)raf=requestAnimationFrame(loop);});
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){playing=false;updateControls();}});
  new ResizeObserver(resize).observe(canvas);
  const ready=select(params.get('enemy')||manifest.enemies[0].id).then(()=>{const requested=params.get('state');if(stateIds.includes(requested))setDamageState(requested);});
  ready.catch(showError);
  // Public review harness; useful to deterministic browser checks and embedders.
  window.alienPreview=Object.freeze({ready,select,setDamageState,playDeath,beginWindup,sampleMovement,
    step(ms){if(!Number.isFinite(ms)||ms<0||ms>60000)throw new Error('step: 0..60000 ms');for(let left=ms;left>0;left-=Math.min(10,left))advance(Math.min(10,left));draw();},
    snapshot(){return {id:enemy.id,state,mode,frameIndex:frameIndex(),timeMs:time,moveTimeMs:moveTime,phase,projectiles:shots.length,children:children.length,beamActive:!!beam,lockedTarget:{...lockedTarget},playing,position:sampleMovement(pattern.movement,moveTime)};}});
  resize();raf=requestAnimationFrame(loop);
})();
