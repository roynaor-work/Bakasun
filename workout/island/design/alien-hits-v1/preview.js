/* Isolated, dependency-free asset demo. Never imports or changes game logic. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stage = $('stage'), canvas = $('scene'), ctx = canvas.getContext('2d');
  const controls=[...document.querySelectorAll('button,select,input')];
  for(const control of controls)control.disabled=true;
  const state = { ready:false, time:0, paused:false, power:1, damage:2, ship:0,
    shot:null, hits:0, rearHits:0, effects:[], deadAt:null, lastHit:null,
    cycleStart:0, auto:true, lastSound:null, soundError:null };
  let manifest, images={}, voices=[], lastReal=null;
  const names=['impact-small','impact-medium','impact-large'];
  const layerLabels=['סדק','סדק + עשן קל','סדק + עשן כבד',
    'סדק + עשן כבד + חשמל','סדק + עשן כבד + חשמל + להבה'];
  const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=844*dpr;canvas.height=390*dpr;ctx.scale(dpr,dpr);

  function resize() {
    const scale=Math.min(1,innerWidth/844,innerHeight/390);
    $('wrap').style.width=`${844*scale}px`;$('wrap').style.height=`${390*scale}px`;
    stage.style.transform=`scale(${scale})`;
  }
  addEventListener('resize',resize);resize();

  function loadImage(url) {
    return new Promise((resolve,reject)=>{const i=new Image();
      i.onload=()=>resolve(i);i.onerror=()=>reject(Error(`Image: ${url}`));i.src=url;});
  }

  async function playSound(id, audition=false) {
    if(!audition&&!$('sound').checked)return;
    const item=manifest.audio.find(a=>a.id===id);
    const probe=new Audio(), preferOgg=!!probe.canPlayType('audio/ogg; codecs="vorbis"');
    const sources=[...item.sources].sort((a,b)=>Number(b.endsWith(preferOgg?'.ogg':'.mp3'))-Number(a.endsWith(preferOgg?'.ogg':'.mp3')));
    let voice;
    for(const source of sources) {
      if(voices.length>=6){const old=voices.shift();old.pause();}
      voice=new Audio(source);voice.volume=.55;voices.push(voice);
      const remove=()=>{voices=voices.filter(v=>v!==voice);};
      voice.addEventListener('ended',remove,{once:true});
      try {await voice.play();state.lastSound=id;state.soundError=null;return;}
      catch(error){voice.pause();remove();state.soundError=error.message;}
    }
    $('status').textContent='הצליל לא זמין; נסו שוב בלחיצה';
  }

  function stopVoices(){for(const v of voices)v.pause();voices=[];}

  function frontPose(t=state.time) {
    return {x:278+Math.sin(t*.9)*13,y:181+Math.sin(t*1.3)*4,angle:Math.sin(t*1.05)*.09};
  }
  const rear={x:279,y:101,angle:-.05};
  function transform(pose,local) {
    return {x:pose.x+local.x*Math.cos(pose.angle)-local.y*Math.sin(pose.angle),
            y:pose.y+local.x*Math.sin(pose.angle)+local.y*Math.cos(pose.angle)};
  }
  function localPoint(pose,world) {
    const dx=world.x-pose.x,dy=world.y-pose.y;
    return {x:dx*Math.cos(pose.angle)+dy*Math.sin(pose.angle),
            y:-dx*Math.sin(pose.angle)+dy*Math.cos(pose.angle)};
  }

  // Swept contact selects the front-most target even for a long simulation step.
  function contact(x,y0,y1,pose,radius) {
    const dx=x-pose.x;if(Math.abs(dx)>radius)return null;
    const entry=pose.y+Math.sqrt(radius*radius-dx*dx);
    if(y0<=entry&&Math.hypot(dx,y0-pose.y)<=radius)return 0;
    const t=(entry-y0)/(y1-y0);return t>=0&&t<=1?t:null;
  }
  function fire() {
    state.shot={x:278,y:267};state.effects=[];state.hits=0;state.rearHits=0;
    state.lastHit=null;state.deadAt=null;state.cycleStart=state.time;state.auto=true;
    $('caption').textContent='הכדור נספג בחללית הראשונה';
    $('tag').textContent='ONE SHOT · ONE TARGET';
  }
  function hit(pose,point) {
    state.hits++;state.lastHit={local:localPoint(pose,point),at:state.time};
    // Release the live projectile immediately; the slug exists only in absorb.
    state.shot=null;
    for(const clip of [names[state.power],'absorb'])state.effects.push({clip,at:state.time,local:state.lastHit.local});
    playSound(`hit-0${state.power+1}`);
    $('tag').textContent='CONTACT / PROJECTILE ABSORBED';
  }
  function destroy() {
    state.shot=null;state.auto=false;state.effects=[];
    const pose=frontPose();state.deadAt={at:state.time,x:pose.x,y:pose.y};
    $('caption').textContent='הגוף נעלם · פיצוץ של 10 פריימים';
    $('tag').textContent='DESTROYED / 500 ms';playSound('explosion');
  }
  function advance(dt) {
    const before=state.time;state.time+=dt;
    if(state.shot) {
      const shot=state.shot,next=shot.y-240*dt;
      const pose=frontPose(),first=contact(shot.x,shot.y,next,pose,25),second=contact(shot.x,shot.y,next,rear,24);
      if(first!==null&&(second===null||first<=second))hit(pose,{x:shot.x,y:shot.y+(next-shot.y)*first});
      else if(second!==null){state.rearHits++;state.shot=null;}
      else {shot.y=next;if(shot.y<65)state.shot=null;}
    }
    state.effects=state.effects.filter(e=>(state.time-e.at)*1000<manifest.clips[e.clip].durationMs);
    if(state.auto&&state.time-state.cycleStart>2.4)fire();
    // Death remains empty after the final cel; replay is explicit.
    return state.time-before;
  }

  function text(label,x,y,size=11,color='#a3bbcd',align='left') {
    ctx.font=`${size}px Arial`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(label,x,y);
  }
  function roundBox(x,y,w,h,r,fill,stroke) {
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  }
  function drawShip(pose,index,size=110) {
    ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);
    ctx.drawImage(images['preview-ships.png'],index*256,0,256,256,-size/2,-size/2,size,size);
    ctx.restore();
  }
  function clip(id,age,x,y,scale=1,angle=0) {
    const c=manifest.clips[id],index=Math.floor(age*c.fps);
    if(age<0||(!c.loop&&index>=c.frames.length))return;
    const f=c.frames[c.loop?index%c.frames.length:index];
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
    ctx.drawImage(images[c.atlas],f.x,f.y,f.w,f.h,-c.pivot[0],-c.pivot[1],f.w,f.h);ctx.restore();
  }
  function drawLayers(pose,level,scale=.8,local={x:0,y:7},age=state.time) {
    const p=transform(pose,local),layers=manifest.damageStates[level].layers;
    for(const id of layers)clip(id,age,p.x,p.y,scale,pose.angle);
  }
  function draw() {
    ctx.clearRect(0,0,844,390);
    const g=ctx.createLinearGradient(0,0,844,390);g.addColorStop(0,'#102239');g.addColorStop(.6,'#081322');g.addColorStop(1,'#0d1d30');
    ctx.fillStyle=g;ctx.fillRect(0,0,844,390);
    roundBox(20,67,524,246,12,'#0b1a2c','#284057');
    roundBox(557,67,267,246,12,'#102236','#284057');
    ctx.save();ctx.beginPath();ctx.rect(22,91,520,148);ctx.clip();
    for(let i=0;i<57;i++) {
      const x=28+((i*113.31)%505),y=91+((i*71.93+state.time*(i%3+1)*2)%149);
      ctx.fillStyle=`rgba(175,215,241,${.12+(i%4)*.1})`;ctx.fillRect(x,y,i%9===0?2:1,1);
    }
    // The dotted trajectory continues behind the first hull; the live shot never does.
    ctx.strokeStyle='#385065';ctx.setLineDash([2,7]);ctx.beginPath();ctx.moveTo(278,234);ctx.lineTo(278,95);ctx.stroke();ctx.setLineDash([]);
    drawShip(rear,(state.ship+1)%5,82);
    const pose=frontPose();
    if(!state.deadAt) {
      drawShip(pose,state.ship,117);
      if(state.lastHit){const p=transform(pose,state.lastHit.local);clip('crack',0,p.x,p.y,.55,pose.angle);}
      for(const e of state.effects){const p=transform(pose,e.local);clip(e.clip,state.time-e.at,p.x,p.y,1,pose.angle);}
    } else clip('explosion',state.time-state.deadAt.at,state.deadAt.x,state.deadAt.y,1.07);
    if(state.shot) {
      const {x,y}=state.shot;ctx.strokeStyle='#83eaff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+12);ctx.lineTo(x,y);ctx.stroke();
      ctx.strokeStyle='#fff2cf';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x,y+10);ctx.lineTo(x,y);ctx.stroke();
    }
    ctx.restore();
    text('מאחור: ללא נזק',381,119,11,'#80b5bc','center');
    text(state.deadAt?'הושמדה':'פגיעה ראשונה',399,195,11,state.deadAt?'#ffb091':'#ffdca5','center');
    text('01',55,224,10,'#668ca5');text('TARGET',77,224,9,'#668ca5');
    const inspector={x:687+Math.sin(state.time*.8)*8,y:192+Math.sin(state.time*1.5)*3,angle:Math.sin(state.time)*.13};
    ctx.strokeStyle='#33516a';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(688,228,63,10,0,0,Math.PI*2);ctx.stroke();
    drawShip(inspector,state.ship,132);
    drawLayers(inspector,state.damage,.76,{x:0,y:4});
    const ratio=manifest.damageStates[state.damage].hpRatioAtMost;
    roundBox(749,157,4,82,2,'#23394c');roundBox(749,157+(1-ratio)*82,4,ratio*82,2,'#edbc7b');
    text(`${Math.round(ratio*100)}%`,752,252,10,'#ddc49a','center');
    $('layerNames').textContent=layerLabels[state.damage];
    if(!state.soundError)$('status').textContent=state.paused?'מושהה':`פגיעות: ${state.hits} · מאחור: ${state.rearHits}`;
  }

  function frame(now) {
    if(lastReal===null)lastReal=now;
    const elapsed=Math.min((now-lastReal)/1000,.05);lastReal=now;
    if(!state.paused)advance(elapsed*Number($('speed').value));
    draw();requestAnimationFrame(frame);
  }
  $('replay').addEventListener('click',()=>{fire();draw();});
  $('pause').addEventListener('click',()=>{
    state.paused=!state.paused;$('pause').setAttribute('aria-pressed',String(state.paused));
    $('pause').textContent=state.paused?'המשך':'השהיה';if(state.paused)stopVoices();draw();});
  $('sound').addEventListener('change',()=>{if($('sound').checked)playSound('hit-01',true);else stopVoices();});
  $('damage').addEventListener('change',()=>{state.damage=Number($('damage').value);playSound('crack');draw();});
  $('ship').addEventListener('change',()=>{state.ship=Number($('ship').value);fire();draw();});
  $('destroy').addEventListener('click',()=>{destroy();draw();});
  for(const b of document.querySelectorAll('[data-power]'))b.addEventListener('click',()=>{
    state.power=Number(b.dataset.power);for(const el of document.querySelectorAll('[data-power]'))el.setAttribute('aria-pressed',String(el===b));fire();draw();});
  for(const b of document.querySelectorAll('[data-sound]'))b.addEventListener('click',()=>playSound(b.dataset.sound,true));
  document.addEventListener('visibilitychange',()=>{lastReal=null;if(document.hidden)stopVoices();});

  async function init() {
    try {
      const response=await fetch('manifest.json');if(!response.ok)throw Error(`manifest: ${response.status}`);
      manifest=await response.json();
      const paths=[...manifest.atlases.map(a=>a.path),'preview-ships.png'];
      await Promise.all(paths.map(async path=>{images[path]=await loadImage(path);}));
      state.ready=true;stage.classList.remove('loading');
      for(const control of controls)control.disabled=false;
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){state.paused=true;$('pause').textContent='המשך';$('pause').setAttribute('aria-pressed','true');}
      fire();draw();requestAnimationFrame(frame);
    } catch(error) {
      $('error').style.display='block';$('error').textContent='לא ניתן לטעון את הנכסים. יש לפתוח דרך שרת HTTP מקומי (הוראות ב־REPORT.md). '+error.message;
      $('status').textContent='שגיאת טעינה';
    }
  }
  // Deterministic inspection surface used by verify.py, entirely inside the demo.
  window.alienHitsPreview={state,get manifest(){return manifest;},
    step(seconds){advance(seconds);draw();},fire,destroy,
    inspect(){return {ready:state.ready,time:state.time,hits:state.hits,rearHits:state.rearHits,
      liveProjectile:!!state.shot,effectCount:state.effects.length,dead:!!state.deadAt,
      deathVisible:!!state.deadAt&&state.time-state.deadAt.at<.5,
      contact:state.lastHit?transform(frontPose(),state.lastHit.local):null,
      localContact:state.lastHit?.local||null,soundError:state.soundError,lastSound:state.lastSound};}};
  init();
})();
