/* Original Canvas 2D asset reviewer. No game code or external dependencies. */
'use strict';
const manifest = window.RACING_FX_MANIFEST;
const $ = id => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d', {alpha:false});
const query = new URLSearchParams(location.search);
let selected = manifest.effects.find(e=>e.id===query.get('effect')) || manifest.effects[0];
let atlas = null, requestId = 0, elapsed = 0, previousTime = null, paused = false;
let background = 'asphalt', currentFrame = 0, ready = false;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
$('reduced').checked = motionQuery.matches;
motionQuery.addEventListener('change', e=>{ $('reduced').checked=e.matches; elapsed=0; });

const descriptions = {
  'turbo-low':'EXHAUST / LOW / LOOP', 'turbo-medium':'EXHAUST / MEDIUM / LOOP', 'turbo-high':'EXHAUST / HIGH / LOOP',
  'tire-drift':'TIRES / CORNERING / ONE SHOT', 'tire-brake':'TIRES / BRAKING / ONE SHOT',
  'skid-marks':'ASPHALT / RUBBER DECAL', 'wall-sparks':'WALL CONTACT / FOUR VARIANTS',
  'road-dust':'ROADSIDE / DUST / ONE SHOT', 'gear-shift':'SHIFT / PERIPHERAL STREAKS', 'grass-rustle':'ROADSIDE / GRASS / ONE SHOT'
};
for (const effect of manifest.effects) {
  const button=document.createElement('button');
  button.className='effect'; button.dataset.effect=effect.id;
  button.innerHTML=`<img src="${effect.frames[0].file}" alt="" width="32" height="29"><span class="name">${effect.label}</span><small>${String(effect.frameCount).padStart(2,'0')}</small>`;
  button.addEventListener('click', ()=>select(effect));
  $('effects').append(button);
}

async function select(effect) {
  selected=effect; atlas=null; ready=false; elapsed=0; currentFrame=0;
  const token=++requestId;
  $('status').textContent='LOADING';
  $('selectedTitle').textContent=effect.label;
  $('selectedKind').textContent=descriptions[effect.id];
  $('size').textContent=`${(effect.atlasBytes/1000).toFixed(1)} KB / 600`;
  $('blend').textContent=effect.blend.toUpperCase();
  $('pivot').textContent=effect.pivotPx.join(', ');
  $('playback').textContent=effect.fps ? `${effect.fps} FPS · ${effect.playback==='loop'?'LOOP':'ONE SHOT'}` : effect.playback.toUpperCase();
  $('download').href=effect.atlas;
  $('frame').max=effect.frameCount-1;
  $('frame').value=0;
  $('frame').disabled=effect.frameCount===1;
  for (const button of $('effects').children) button.setAttribute('aria-pressed',button.dataset.effect===effect.id);
  $('filmstrip').replaceChildren();
  for (const frame of effect.frames) {
    const button=document.createElement('button');
    button.setAttribute('aria-label',`פריים ${frame.index+1}`);
    button.innerHTML=`<img src="${frame.file}" alt="" width="65" height="65"><span>${String(frame.index+1).padStart(2,'0')}</span>`;
    button.addEventListener('click',()=>scrub(frame.index));
    $('filmstrip').append(button);
  }
  const image=new Image();
  image.src=effect.atlas;
  try { await image.decode(); if(token!==requestId)return; atlas=image; ready=true; $('status').textContent='READY / 1024 × 1024'; }
  catch { if(token===requestId)$('status').textContent='שגיאה בטעינת האטלס'; }
  document.title=`${effect.label} · מרוצים 02`;
  canvas.setAttribute('aria-label',`תצוגת ${effect.label}`);
}

function setPaused(value) {
  paused=value;
  $('play').textContent=value?'ניגון':'השהיה';
  $('play').setAttribute('aria-label',value?'המשך הניגון':'השהיית הניגון');
  $('play').setAttribute('aria-pressed',String(value));
}
function scrub(index) {
  currentFrame=index;
  elapsed=selected.fps?index/selected.fps:(selected.playback==='random-variant'?index*.85:0);
  setPaused(true);
}
$('play').addEventListener('click',()=>setPaused(!paused));
$('restart').addEventListener('click',()=>{elapsed=0; currentFrame=0; setPaused(false);});
$('frame').addEventListener('input',e=>scrub(Number(e.target.value)));
$('reduced').addEventListener('change',()=>{elapsed=0;currentFrame=0;});
for(const button of document.querySelectorAll('[data-bg]')) button.addEventListener('click',()=>{
  background=button.dataset.bg;
  for(const b of document.querySelectorAll('[data-bg]'))b.setAttribute('aria-pressed',String(b===button));
});
$('quality').addEventListener('change',()=>{
  const tier=manifest.qualityTiers[$('quality').value];
  for(const b of $('effects').children)b.disabled=!!tier&&!tier.effects.includes(b.dataset.effect);
  $('tierNote').textContent=tier ? `תכנון לנייד: עד ${tier.maxResidentAtlases} אטלסים, ${tier.maxGpuBytesRGBA8/1048576} MiB ועד ${tier.maxActiveInstances} מופעים. אלו תקרות מוצעות, ללא מדידת FPS בטלפון.` : 'בסקירה נטען אטלס אחד בכל רגע. המשקלים מתייחסים לקובץ; כל אטלס תופס 4 MiB ב־RGBA8.';
  if(tier&&!tier.effects.includes(selected.id))select(manifest.effects.find(e=>e.id===tier.effects[0]));
});
document.addEventListener('visibilitychange',()=>{previousTime=null;});

function surface(w,h) {
  if(background==='checker') {
    const size=18;
    for(let y=0;y<h;y+=size)for(let x=0;x<w;x+=size){ctx.fillStyle=((x/size+y/size)%2)?'#304148':'#203039';ctx.fillRect(x,y,size,size);}
  } else if(background==='light') {ctx.fillStyle='#e6e6dd';ctx.fillRect(0,0,w,h);}
  else {
    const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#122127');g.addColorStop(.5,'#28353c');g.addColorStop(1,'#111d23');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=.15;ctx.fillStyle='#779396';
    for(let j=0;j<950;j++){const x=(j*113.37)%w,y=(j*51.73)%h;ctx.fillRect(x,y,j%3===0?1.5:.7,.7);}
    ctx.globalAlpha=1;
    ctx.strokeStyle='#758077';ctx.lineWidth=2;ctx.globalAlpha=.3;
    ctx.beginPath();ctx.moveTo(-30,h*.88);ctx.lineTo(w+30,h*.54);ctx.stroke();
    ctx.strokeStyle='#b1b5a3';ctx.setLineDash([38,50]);ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,h*.18);ctx.lineTo(w,h*-.16);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
  }
}

function draw(time) {
  const rect=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const w=width/dpr,h=height/dpr;
  const dt=previousTime===null?0:Math.min((time-previousTime)/1000,.05);previousTime=time;
  if(!paused&&!document.hidden&&ready)elapsed+=dt;
  const reduced=$('reduced').checked;
  let envelope=1;
  if(!paused){
    if(selected.playback==='loop')currentFrame=reduced?0:Math.floor(elapsed*selected.fps)%selected.frameCount;
    else if(selected.playback==='once'){
      const life=selected.durationMs/1000, cycle=life+.65, age=elapsed%cycle;
      currentFrame=Math.min(selected.frameCount-1,Math.floor(age*selected.fps));
      const u=age/life;
      envelope=age>=life?0:Math.min(1,u/.12,(1-u)/.18);
      if(reduced) {currentFrame=0;envelope=selected.id==='gear-shift'||selected.id==='grass-rustle'?0:.6;}
    } else if(selected.playback==='random-variant'){
      currentFrame=Math.floor(elapsed/.85)%4;
      const age=elapsed%.85;
      envelope=age>.18?0:Math.min(1,(.18-age)/.063);
      if(reduced){currentFrame=0;envelope=.5;}
    }
  }
  surface(w,h);
  if(atlas){
    const frame=selected.frames[currentFrame], gear=selected.id==='gear-shift';
    let size=Math.min(w*.66,h*1.22,340), dx=(w-size)/2,dy=(h-size)/2;
    // Small origin fixture establishes exhaust attachment without a car dependency.
    if(selected.id.startsWith('turbo')){
      const ox=dx+selected.pivotPx[0]/256*size,oy=dy+size/2;
      ctx.fillStyle='#080e12';ctx.fillRect(ox-size*.13,oy-size*.065,size*.13,size*.13);
      ctx.strokeStyle='#68777c';ctx.lineWidth=2;ctx.strokeRect(ox-size*.13,oy-size*.065,size*.13,size*.13);
    }
    ctx.globalCompositeOperation=selected.blend==='additive'?'lighter':'source-over';
    ctx.globalAlpha=Math.max(0,envelope)*(gear?.55:1);
    ctx.drawImage(atlas,...frame.rect,gear?0:dx,gear?0:dy,gear?w:size,gear?h:size);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  $('frame').value=currentFrame;
  $('frameLabel').textContent=`${String(currentFrame+1).padStart(2,'0')} / ${String(selected.frameCount).padStart(2,'0')}`;
  [...$('filmstrip').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===currentFrame)));
  window.__racingFxPreview={ready,selected:selected.id,currentFrame,paused,reducedMotion:reduced,background,elapsed,atlasCount:atlas?1:0};
  requestAnimationFrame(draw);
}
select(selected);
requestAnimationFrame(draw);
