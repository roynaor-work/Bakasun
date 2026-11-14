const $ = selector => document.querySelector(selector);
const canvas = $('#scene'), ctx = canvas.getContext('2d');
const state = {ready:false, tab:'play', hit:'stars', projectile:'gold', muted:true, auto:false,
  animation:'muzzle', artTime:0, paused:false, speed:1, clock:0, lastShot:-5,
  mode:'hit', misses:0, voices:0, shotIndex:0, fx:[], reaction:null, shot:null, soundCount:0};
let manifest, atlases, singles;
const activeAudio = new Set(), bags = new Map();
let audioContext, master, limiter, decoded = new Map(), resumePromise;
const labels = {'muzzle':'הבזק לוע · 6','projectile-gold':'קליע זהב','projectile-aqua':'קליע בועה',
  'projectile-comet':'קליע שביט','hit-dust':'פגיעת אבק','hit-stars':'פגיעת כוכבים',
  'hit-burst':'פיצוץ קטן','hit-pop':'פופ','miss-dust':'החטאה · אבק','miss-pebbles':'החטאה · אבנים',
  'miss-sand':'החטאה · חול','boar-idle':'חזיר במנוחה','boar-fall':'נפילה · 4',
  'boar-side-hit':'פגיעת צד · 3'};

function status(text) { $('#status').textContent=text; }
function loadImage(path) { return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error(`Image failed: ${path}`));im.src=path;}); }
function bag(group) {
  const ids=Object.values(manifest.audio.sounds).filter(s=>s.group===group).map(s=>s.id);
  let b=bags.get(group);
  if(!b?.remaining.length) {
    const last=b?.last;
    const remaining=ids.slice();
    for(let i=remaining.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
    if(remaining.length>1&&remaining.at(-1)===last)[remaining[0],remaining[remaining.length-1]]=[remaining.at(-1),remaining[0]];
    b={remaining,last};bags.set(group,b);
  }
  b.last=b.remaining.pop();return b.last;
}
async function initAudio() {
  if(!audioContext){
    audioContext=new AudioContext();master=audioContext.createGain();master.gain.value=manifest.audio.masterGain;
    limiter=audioContext.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=6;
    limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.08;
    limiter.connect(master);master.connect(audioContext.destination);
  }
  if(audioContext.state==='suspended'){resumePromise??=audioContext.resume().finally(()=>{resumePromise=null;});await resumePromise;}
}
async function sound(id, {force=false}={}) {
  if(!state.ready||(!force&&state.muted))return;
  const cue=manifest.audio.sounds[id];
  if(!cue)return;
  const format=$('#format').value;
  const canOgg=document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"');
  const selected=format==='auto'?(canOgg?'ogg':'mp3'):format;
  const play=async ext=>{
    await initAudio();
    const key=`${id}.${ext}`;
    if(!decoded.has(key)) {
      const pending=fetch(cue.formats[ext].path).then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();}).then(bytes=>audioContext.decodeAudioData(bytes));
      decoded.set(key,pending);pending.catch(()=>decoded.delete(key));
    }
    const buffer=await decoded.get(key);
    if(state.muted)return;
    while(activeAudio.size>=manifest.audio.polyphony){const oldest=activeAudio.values().next().value;oldest.stop();activeAudio.delete(oldest);}
    const node=audioContext.createBufferSource();node.buffer=buffer;node.connect(limiter);activeAudio.add(node);
    node.onended=()=>{activeAudio.delete(node);node.disconnect();};node.start();state.soundCount++;
  };
  try{await play(selected);}catch(error){
    if(format==='auto'&&selected==='ogg') {try{await play('mp3');return;}catch{/* Display actual failure below. */}}
    status(`לא ניתן לנגן: ${cue.labelHe}`);console.error(error);
  }
}
function mute(value) {
  state.muted=value;$('#mute').setAttribute('aria-pressed',String(value));$('#mute').textContent=value?'צליל כבוי ♫':'צליל פעיל ♫';
  if(value){for(const node of activeAudio)node.stop();activeAudio.clear();}
  else initAudio().catch(error=>{status('לא ניתן להפעיל צליל בדפדפן הזה');console.error(error);});
}
function animationFrame(id, age) {
  const a=manifest.animations[id];
  let ms=Math.max(0,age*1000);
  if(a.loop)ms%=a.durationMs;
  for(let i=0;i<a.frames.length;i++){if(ms<a.frameDurationsMs[i])return a.frames[i];ms-=a.frameDurationsMs[i];}
  return a.frames.at(-1);
}
function drawFrame(id,x,y,size,rotation=0,single=false,alpha=1) {
  const f=manifest.frames[id],r=f.rect;
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=alpha;
  if(single)ctx.drawImage(singles[id],-size*f.pivot[0],-size*f.pivot[1],size,size);
  else ctx.drawImage(atlases[f.atlas],r.x,r.y,r.w,r.h,-size*f.pivot[0],-size*f.pivot[1],size,size);
  ctx.restore();
}
function ellipse(x,y,rx,ry,color) {ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function backdrop() {
  const sky=ctx.createLinearGradient(0,0,0,220);sky.addColorStop(0,'#8bbdb8');sky.addColorStop(1,'#c5ded0');ctx.fillStyle=sky;ctx.fillRect(0,0,600,278);
  ellipse(86,52,28,28,'#f8e3a0');
  ctx.fillStyle='#679e97';ctx.beginPath();ctx.moveTo(0,142);ctx.lineTo(64,99);ctx.lineTo(118,125);ctx.lineTo(205,78);ctx.lineTo(295,137);ctx.lineTo(398,101);ctx.lineTo(504,137);ctx.lineTo(600,104);ctx.lineTo(600,180);ctx.lineTo(0,180);ctx.fill();
  ctx.fillStyle='#78afa6';ctx.fillRect(0,143,600,51);
  ctx.strokeStyle='#c1ddd0';ctx.lineWidth=1.3;for(let i=0;i<13;i++){const x=(i*89)%600,y=151+i%4*8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+35,y);ctx.stroke();}
  ctx.fillStyle='#d6c896';ctx.beginPath();ctx.moveTo(0,205);ctx.bezierCurveTo(140,174,320,184,600,166);ctx.lineTo(600,278);ctx.lineTo(0,278);ctx.fill();
  ctx.fillStyle='#b3ba77';ctx.beginPath();ctx.moveTo(0,225);ctx.bezierCurveTo(190,199,380,243,600,197);ctx.lineTo(600,278);ctx.lineTo(0,278);ctx.fill();
  ctx.fillStyle='#d8ca96';ctx.beginPath();ctx.moveTo(0,259);ctx.bezierCurveTo(180,212,350,244,600,218);ctx.lineTo(600,278);ctx.lineTo(0,278);ctx.fill();
  for(let i=0;i<28;i++){const x=(i*71+23)%600,y=208+(i*17)%65;ellipse(x,y,1.6,1,'#aaac73');}
  // Decorative palm silhouette and leaves; the character itself is a sprite.
  ctx.strokeStyle='#747c4b';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(33,201);ctx.quadraticCurveTo(14,128,29,84);ctx.stroke();
  ctx.strokeStyle='#497e62';ctx.lineWidth=10;ctx.lineCap='round';
  for(const [x,y]of [[-14,84],[0,59],[53,62],[75,90],[51,103]]){ctx.beginPath();ctx.moveTo(29,84);ctx.quadraticCurveTo((x+29)/2,Math.min(y,84)-16,x,y);ctx.stroke();}
}
function cannon() {
  const recoil=state.shot?Math.max(0,1-(state.clock-state.shot.at)/.16)*6:0;
  ctx.save();ctx.translate(-recoil,0);ellipse(88,239,44,9,'#727e5b55');
  ctx.fillStyle='#4b6c69';ctx.beginPath();ctx.roundRect(58,192,58,35,12);ctx.fill();
  ctx.fillStyle='#9fc4b7';ctx.beginPath();ctx.roundRect(85,181,58,25,8);ctx.fill();
  ctx.fillStyle='#4e716d';ctx.fillRect(133,181,10,25);ctx.fillStyle='#f8d27d';ctx.fillRect(97,184,24,4);
  ellipse(72,225,15,15,'#3c5a57');ellipse(106,225,15,15,'#3c5a57');ellipse(72,225,7,7,'#97b2a2');ellipse(106,225,7,7,'#97b2a2');
  ctx.restore();
}
function action(mode='hit', target) {
  if(!state.ready||state.clock-state.lastShot<.27)return;
  if(state.tab!=='play')selectTab('play');
  state.lastShot=state.clock;state.mode=mode;state.reaction=null;state.fx=[];
  const point=mode==='miss'?(target||{x:370,y:247}):{x:454,y:164};
  state.shot={at:state.clock,target:point,mode,arrived:false};
  sound(bag('shot'));$('#badge').textContent='פיו!';
}
function arrive(shot) {
  shot.arrived=true;
  const at=state.clock;
  if(shot.mode==='miss'){
    const type=['dust','pebbles','sand'][state.misses++%3];
    state.fx.push({name:'miss-'+type,at,x:shot.target.x,y:shot.target.y,size:150});
    sound('miss-sand');$('#badge').textContent='פוף… ננסה שוב!';
  }else{
    state.fx.push({name:'hit-'+state.hit,at,x:454,y:164,size:151});
    state.reaction={name:shot.mode==='fall'?'boar-fall':'boar-side-hit',at};
    sound('hit-'+state.hit);
    if(shot.mode==='fall'){sound('fall-squeak-roll');$('#badge').textContent='אופס… התגלגלתי!';}
    else $('#badge').textContent=['בול!','פופ! פגיעה!','איזה יופי!'][state.shotIndex++%3];
  }
}
function drawPlay() {
  backdrop();cannon();
  const boar=state.reaction,age=boar?state.clock-boar.at:0;
  const a=boar&&age<1.65?boar.name:'boar-idle';
  const recoil=a==='boar-side-hit'?Math.sin(Math.min(1,age/.32)*Math.PI)*14:0;
  // Rest, fade out, then introduce the next target instead of snapping upright.
  const respawnAlpha=boar?.name==='boar-fall'&&age>1.35&&age<1.95?
    (age<1.65?(1.65-age)/.3:(age-1.65)/.3):1;
  ellipse(457,231,62,10,'#68734d45');drawFrame(animationFrame(a,age),454+recoil,228,205,0,false,respawnAlpha);
  const shot=state.shot;
  if(shot){
    const dt=state.clock-shot.at;
    if(dt<.15)drawFrame(animationFrame('muzzle',dt),143,193,108);
    const distance=Math.hypot(shot.target.x-143,shot.target.y-193),travel=distance/1100;
    const angle=Math.atan2(shot.target.y-193,shot.target.x-143);
    if(dt<travel){const p=dt/travel;drawFrame(animationFrame('projectile-'+state.projectile,0),143+(shot.target.x-143)*p,193+(shot.target.y-193)*p,100,angle);}
    else if(!shot.arrived)arrive(shot);
  }
  state.fx=state.fx.filter(fx=>state.clock-fx.at<manifest.animations[fx.name].durationMs/1000);
  for(const fx of state.fx)drawFrame(animationFrame(fx.name,state.clock-fx.at),fx.x,fx.y,fx.size);
}
function drawArt() {
  for(let y=0;y<278;y+=14)for(let x=0;x<600;x+=14){ctx.fillStyle=(x/14+y/14)%2?'#28464c':'#36535a';ctx.fillRect(x,y,14,14);}
  const a=manifest.animations[state.animation];
  const id=animationFrame(state.animation,(state.artTime%a.durationMs)/1000);
  // Display full square; its pivot cross is drawn separately.
  const f=manifest.frames[id];
  for(const [x,single]of [[148,false],[452,true]]){
    drawFrame(id,x-116+232*f.pivot[0],25+232*f.pivot[1],232,0,single);
    ctx.strokeStyle='#ffffff35';ctx.lineWidth=1;ctx.strokeRect(x-116,25,232,232);
    const px=x-116+232*f.pivot[0],py=25+232*f.pivot[1];
    ctx.strokeStyle='#ffdf86';ctx.beginPath();ctx.moveTo(px-5,py);ctx.lineTo(px+5,py);ctx.moveTo(px,py-5);ctx.lineTo(px,py+5);ctx.stroke();
  }
  ctx.font='12px Arial';ctx.fillStyle='#fff2d1';ctx.textAlign='center';ctx.fillText('אטלס',148,18);ctx.fillText('PNG בודד',452,18);
  $('#frame-info').textContent=`${id}\n${a.frames.indexOf(id)+1} / ${a.frames.length} · ${a.durationMs} ms`;
}
function drawAudio() {
  backdrop();ellipse(350,228,65,10,'#68734d45');drawFrame(animationFrame('boar-idle',0),350,228,207);
  ctx.textAlign='center';ctx.fillStyle='#38594e';ctx.font='bold 21px Arial';ctx.fillText('אוינק. פיו. פופ!',330,66);
  ctx.font='13px Arial';ctx.fillText('בחרו צליל והקשיבו',330,90);
}
function selectTab(tab) {
  state.tab=tab;state.auto=false;$('#auto').checked=false;
  for(const button of document.querySelectorAll('[data-tab]'))button.setAttribute('aria-selected',String(button.dataset.tab===tab));
  for(const name of ['play','art','audio'])$(`#${name}-panel`).hidden=name!==tab;
  $('#badge').hidden=tab!=='play';
}
function fillSounds() {
  $('#sounds').replaceChildren();
  for(const cue of Object.values(manifest.audio.sounds).filter(s=>s.group===$('#sound-group').value)){
    const b=document.createElement('button');b.textContent=`▶ ${cue.labelHe}`;b.dataset.sound=cue.id;
    b.onclick=()=>{mute(false);sound(cue.id,{force:true});status(cue.labelHe);};$('#sounds').append(b);
  }
}
function bind() {
  $('#mute').onclick=()=>mute(!state.muted);
  for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>selectTab(b.dataset.tab);
  for(const b of document.querySelectorAll('[data-hit]'))b.onclick=()=>{state.hit=b.dataset.hit;for(const other of document.querySelectorAll('[data-hit]'))other.setAttribute('aria-pressed',String(other===b));};
  $('#projectile').onchange=e=>{state.projectile=e.target.value;};
  $('#auto').onchange=e=>{state.auto=e.target.checked;};
  $('#fire').onclick=()=>action('hit');$('#fall').onclick=()=>action('fall');$('#miss').onclick=()=>action('miss');
  $('#voice').onclick=()=>{mute(false);const id=bag('voice');sound(id,{force:true});$('#badge').textContent=manifest.audio.sounds[id].labelHe;state.voices++;};
  $('#animation').onchange=e=>{state.animation=e.target.value;state.artTime=0;};
  $('#pause').onclick=()=>{state.paused=!state.paused;$('#pause').setAttribute('aria-pressed',String(state.paused));$('#pause').textContent=state.paused?'ניגון':'השהיה';};
  $('#step').onclick=()=>{state.paused=true;$('#pause').setAttribute('aria-pressed','true');$('#pause').textContent='ניגון';const a=manifest.animations[state.animation];const current=animationFrame(state.animation,(state.artTime%a.durationMs)/1000);const i=a.frames.indexOf(current);state.artTime=a.frameDurationsMs.slice(0,i+1).reduce((a,b)=>a+b,0)%a.durationMs;};
  $('#speed').onchange=e=>{state.speed=Number(e.target.value);};
  $('#sound-group').onchange=fillSounds;
  canvas.addEventListener('pointerdown',e=>{if(state.tab!=='play')return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*600/r.width,y=(e.clientY-r.top)*278/r.height;action(x>376&&x<550&&y>76&&y<232?'hit':'miss',{x,y:Math.max(212,y)});});
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();action('hit');}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const node of activeAudio)node.stop();activeAudio.clear();}});
}
let last;
function tick(now) {
  const dt=last===undefined||document.hidden?0:Math.min(.05,(now-last)/1000);last=now;
  if(state.ready){state.clock+=dt;if(!state.paused)state.artTime+=dt*1000*state.speed;
    ctx.clearRect(0,0,600,278);
    if(state.tab==='art')drawArt();else if(state.tab==='audio')drawAudio();else drawPlay();
    if(state.tab==='play'&&state.auto&&state.clock-state.lastShot>2.25)action('hit');
  }
  requestAnimationFrame(tick);
}
async function start() {
  for(const b of document.querySelectorAll('button'))b.disabled=true;
  const response=await fetch('manifest.json');if(!response.ok)throw Error('Manifest unavailable');manifest=await response.json();
  atlases=Object.fromEntries(await Promise.all(manifest.atlases.map(async a=>[a.id,await loadImage(a.path)])));
  singles=Object.fromEntries(await Promise.all(Object.entries(manifest.frames).map(async([id,f])=>[id,await loadImage(f.path)])));
  for(const id of Object.keys(manifest.animations)){const o=document.createElement('option');o.value=id;o.textContent=labels[id]||id;$('#animation').append(o);}
  bind();fillSounds();state.ready=true;$('#loading').remove();
  for(const b of document.querySelectorAll('button'))b.disabled=false;
  status(`${Object.keys(manifest.frames).length} פריימים · ${Object.keys(manifest.audio.sounds).length} צלילים מקוריים · מוכנים`);
  // Small read-only snapshot plus deterministic event trigger for the review harness.
  window.boarsFxPreview={get snapshot(){return{...state,fx:state.fx.map(f=>({...f})),loadedAtlases:Object.keys(atlases).length,loadedSprites:Object.keys(singles).length,activeAudio:activeAudio.size,audioState:audioContext?.state||'uninitialized'};},action};
}
requestAnimationFrame(tick);
start().catch(error=>{console.error(error);$('#loading').textContent='הטעינה נכשלה. פתחו דרך שרת מקומי לפי הדוח.';$('#loading').classList.add('error');status('טעינת החבילה נכשלה');});
