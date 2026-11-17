/* Standalone board-asset review. No live game imports or external requests. */
'use strict';
const $ = id => document.getElementById(id);
const stateNames = {intact:'שלמה', damaged:'פגועה', burning:'בוערת', listing:'נטויה', sinking:'טובעת'};
const effectNames = {shell:'פגז נכנס', explosion:'פיצוץ מחסן תחמושת', rockets:'מטח רקטות', torpedo:'טורפדו עם שובל'};
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const textures = new Map();
const audioPool = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let manifest, shipId='destroyer-tide', state='burning', mode='state', effect=null;
let elapsed=0, playing=!reducedMotion.matches, audible=false, lastTime=0, ready=false;
let loadSerial=0, frameDraws=0, soundCount=0, rocketSoundPlayed=false;
const smokeOn=()=> $('smoke').checked;
const waterOn=()=> $('water').checked;
const ship=()=>manifest.ships[shipId];
const duration=()=>mode==='sink'?ship().sinkingHull.durationSeconds:mode==='effect'?(effect==='shell'?1.18:effect==='rockets'?.90:effect==='torpedo'?1.3:2.1):3.7;

async function loadTexture(key){
  if(textures.has(key)) return textures.get(key);
  const response=await fetch(manifest.atlases[key].file);
  if(!response.ok) throw new Error('טעינת אטלס נכשלה: '+key);
  const bitmap=await createImageBitmap(await response.blob());
  textures.set(key,bitmap);
  return bitmap;
}

function stopAudio(){
  for(const audio of audioPool.values()){ audio.pause(); audio.currentTime=0; }
}

async function sound(key){
  if(!audible || document.hidden) return;
  const entry=manifest.audio[key];
  let audio=audioPool.get(key);
  if(!audio){
    audio=new Audio();
    const ext=audio.canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3';
    audio.src=entry.formats[ext].file;
    audio.volume=.65;
    audio.preload='auto';
    audio.addEventListener('error',()=>{
      if(!audio.src.endsWith('.mp3')) audio.src=entry.formats.mp3.file;
    });
    audioPool.set(key,audio);
  }
  audio.currentTime=0;
  try { await audio.play(); soundCount++; } catch { /* browser gesture policy */ }
}

function frameOf(sequence,t,forced){
  if(forced!==undefined) return Math.min(sequence.frameCount-1,Math.max(0,forced));
  const frame=Math.floor(Math.max(0,t)*sequence.fps);
  return sequence.loop?frame%sequence.frameCount:Math.min(sequence.frameCount-1,frame);
}

function sprite(context,sequence,x,y,scale=1,t=elapsed,forced){
  const image=textures.get(sequence.atlas);
  if(!image) return;
  const r=sequence.frames[frameOf(sequence,t,forced)],a=sequence.anchorPx;
  context.drawImage(image,r.x,r.y,r.w,r.h,x-a[0]*scale,y-a[1]*scale,r.w*scale,r.h*scale);
  frameDraws++;
}

function fx(context,key,x,y,scale=1,t=elapsed){
  sprite(context,manifest.effects[key],x,y,scale,t);
}

function ocean(t){
  const w=canvas.width,h=canvas.height;
  const gradient=ctx.createLinearGradient(0,0,w*.55,h);
  gradient.addColorStop(0,'#173a48');gradient.addColorStop(.45,'#164350');gradient.addColorStop(1,'#0b2a39');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  // Long, low-contrast wavelets; no texture downloads or per-pixel noise loop.
  for(let row=0;row<25;row++){
    const y=12+row*10.8;
    ctx.strokeStyle=`rgba(116,184,186,${.025+(row%5)*.009})`;
    ctx.lineWidth=row%3===0?1.2:.55;
    ctx.beginPath();
    for(let x=-30;x<w+35;x+=9){
      const yy=y+Math.sin(x*.017+row*5.4+t*.6)*2.5+Math.sin(x*.045-row*2.2-t*.4)*.9;
      if(x===-30)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle='#7aa5aa0d';ctx.lineWidth=.6;
  for(let i=-10;i<13;i++){
    ctx.beginPath();ctx.moveTo(i*68,0);ctx.lineTo(i*68+210,h);ctx.stroke();
  }
  const glow=ctx.createRadialGradient(w*.57,h*.62,0,w*.57,h*.62,w*.46);
  glow.addColorStop(0,'#56a4a817');glow.addColorStop(1,'#194b5200');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
}

function transformPoint(point,angle,drop){
  const radians=-angle*Math.PI/180,dx=point[0]-160,dy=point[1]-174;
  return [160+dx*Math.cos(radians)-dy*Math.sin(radians),174+drop+dx*Math.sin(radians)+dy*Math.cos(radians)];
}

function drawDeckEffects(context,anchors,origin,scale,angle=0,drop=0,level='medium',t=elapsed){
  if(!smokeOn())return;
  anchors.forEach((p,i)=>{
    const a=transformPoint(p,angle,drop);
    if(a[1]>175)return;
    const x=origin[0]+(a[0]-160)*scale,y=origin[1]+(a[1]-174)*scale;
    fx(context,'smoke-'+level,x,y,.54*scale,t+i*.23);
    fx(context,'deck-fire',x,y,.34*scale,t+i*.13);
  });
}

function drawVessel(context,origin,scale,t=elapsed){
  const s=ship(),x=origin[0],y=origin[1];
  if(mode==='sink'){
    const index=frameOf(s.sinkingHull,t);
    if(waterOn() && index>0)fx(context,'oil',x,y+5,1.35*scale,t);
    sprite(context,s.sinkingHull,x,y,scale,t);
    const pose=s.sinkingHull.transforms[index];
    drawDeckEffects(context,s.deckAnchorsPx,origin,scale,pose.rollDeg,pose.dropPx,'heavy',t);
    if(waterOn() && index>0){
      fx(context,'bubbles',x,y+16,.75*scale,t);
      // Surface foam stays independent of the submerged hull.
      const a=1-index/22;
      context.save();context.globalAlpha=a;
      context.strokeStyle='#cce8e7';context.lineWidth=1;
      context.beginPath();context.ellipse(x,y+4,scale*(98+index),scale*12,0,.05,Math.PI*.96);context.stroke();context.restore();
    }
    return;
  }
  const displayState=mode==='effect'?(effect==='explosion'?'damaged':state==='sinking'?'intact':state):state;
  const angle=displayState==='listing'?11:0;
  context.save();context.translate(x,y);context.rotate(-angle*Math.PI/180);
  sprite(context,s.states.intact,0,0,scale,t);
  if(displayState!=='intact')sprite(context,s.overlays.damaged,0,0,scale,t);
  context.restore();
  if(['burning','listing'].includes(displayState))drawDeckEffects(context,s.deckAnchorsPx,origin,scale,angle,0,displayState==='listing'?'heavy':'medium',t);
  if(displayState==='damaged' && smokeOn()){
    const p=s.deckAnchorsPx[0];fx(context,'smoke-light',x+(p[0]-160)*scale,y+(p[1]-174)*scale,.40*scale,t);
  }
  if(waterOn() && displayState==='listing')fx(context,'oil',x+20,y+5,.85*scale,t);
}

function drawEffect(origin,scale){
  if(mode!=='effect') return;
  const [x,y]=origin;
  if(effect==='shell'){
    if(elapsed<.5)fx(ctx,'incoming-shell',x+92,y+2,.90*scale,elapsed);
    else fx(ctx,'water-column',x+92,y+6,.90*scale,elapsed-.5);
    if(elapsed>=.5 && !rocketSoundPlayed){sound('hit');rocketSoundPlayed=true;}
  }else if(effect==='explosion'){
    if(elapsed<10/12)fx(ctx,'magazine-explosion',x+24,y-14,1.10*scale,elapsed);
    if(elapsed>.35 && smokeOn()){
      fx(ctx,'smoke-heavy',x+24,y-14,.80*scale,elapsed);
      fx(ctx,'deck-fire',x+24,y-14,.53*scale,elapsed);
    }
  }else if(effect==='rockets'){
    if(elapsed<.75)fx(ctx,'rocket-salvo',x-32,y-9,1.3*scale,elapsed);
  }else if(effect==='torpedo'){
    fx(ctx,'torpedo-wake',x-183+elapsed*230,y+26,.95*scale,elapsed);
  }
}

function drawCards(){
  const s=ship();
  for(const [key,label] of Object.entries(stateNames)){
    const button=document.querySelector(`[data-state="${key}"]`),c=button.querySelector('canvas'),g=c.getContext('2d');
    g.clearRect(0,0,c.width,c.height);
    sprite(g,s.states[key],160,180,1,0);
    button.setAttribute('aria-pressed',String(state===key));
    button.setAttribute('aria-label','מצב הספינה: '+label);
  }
}

function updateUI(){
  $('state-label').textContent=mode==='effect'?effectNames[effect]:stateNames[state];
  $('ship-label').textContent=ship().label;
  const frame=mode==='sink'?`${String(frameOf(ship().sinkingHull,elapsed)+1).padStart(2,'0')} / 16`:
    mode==='effect'?({shell:'SHELL / WATER',explosion:'MAGAZINE / 10F',rockets:'ROCKET SALVO',torpedo:'TORPEDO / WAKE'})[effect]:state.toUpperCase();
  $('frame-label').textContent=frame;
  $('play').textContent=playing?'Ⅱ':'▶';
  $('play').setAttribute('aria-label',playing?'השהיה':'ניגון');
  $('play').setAttribute('aria-pressed',String(playing));
  $('time').value=`${Math.min(elapsed,duration()).toFixed(1)} / ${duration().toFixed(1)}`;
  $('scrub').value=String(Math.round(Math.min(1,elapsed/duration())*1000));
  for(const b of document.querySelectorAll('[data-effect]'))b.setAttribute('aria-pressed',String(mode==='effect'&&effect===b.dataset.effect));
  for(const b of document.querySelectorAll('[data-state]'))b.setAttribute('aria-pressed',String(state===b.dataset.state));
}

function draw(){
  if(!ready)return;
  frameDraws=0;
  ocean(elapsed);
  const scale=canvas.width/628,origin=[canvas.width*.50,canvas.height*.785];
  // Soft elliptical contact shadow under the upright hull.
  if(mode!=='sink'||elapsed<1){
    ctx.save();ctx.translate(origin[0],origin[1]+5);ctx.scale(1,.21);
    ctx.fillStyle='#04192339';ctx.beginPath();ctx.ellipse(0,0,141*scale,26*scale,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  drawVessel(ctx,origin,1.24*scale);
  drawEffect(origin,scale);
  updateUI();
}

function resetClock(){elapsed=0;lastTime=0;rocketSoundPlayed=false;playing=true;stopAudio();}

function chooseState(next){
  state=next;effect=null;mode=next==='sinking'?'sink':'state';resetClock();
  if(next==='sinking')sound('sinking');else if(next==='damaged')sound('hit');
  draw();
}

function chooseEffect(next){
  effect=next;mode='effect';if(state==='sinking')state='intact';resetClock();
  if(next==='explosion')sound('explosion');
  draw();
}

async function chooseShip(next){
  const serial=++loadSerial;
  ready=false;$('loading').hidden=false;
  try{
    await loadTexture(next);
    if(serial!==loadSerial){
      if(next!==shipId && textures.has(next)){textures.get(next).close();textures.delete(next);}return;
    }
    for(const [key,bitmap]of textures){
      if(key!==next && key!=='combat' && key!=='ambient'){bitmap.close();textures.delete(key);}
    }
    shipId=next;elapsed=0;stopAudio();ready=true;lastTime=0;
    $('loading').hidden=true;drawCards();draw();
  }catch(error){showError(error);}
}

function showError(error){
  $('loading').hidden=true;$('error').hidden=false;
  $('error').textContent='לא ניתן להציג את החבילה. יש לפתוח אותה דרך שרת HTTP מקומי. '+error.message;
}

function animate(timestamp){
  if(lastTime && ready && playing && !document.hidden){
    elapsed+=Math.min(.05,(timestamp-lastTime)/1000);
    if(elapsed>=duration()){
      if(mode==='state' || effect==='torpedo')elapsed%=duration();
      else {elapsed=duration();playing=false;}
    }
  }
  lastTime=timestamp;
  // No background rendering. A paused frame redraws only after an input.
  if(ready && playing && !document.hidden)draw();
  requestAnimationFrame(animate);
}

async function init(){
  try{
    const response=await fetch('manifest.json');if(!response.ok)throw new Error('manifest.json');manifest=await response.json();
    for(const [key,s]of Object.entries(manifest.ships)){
      const option=document.createElement('option');option.value=key;
      option.textContent=s.label+(s.fleet==='tide'?' · גאות':s.fleet==='ember'?' · גחלת':'');$('ship').append(option);
    }
    $('ship').value=shipId;
    let i=0;
    for(const [key,label] of Object.entries(stateNames)){
      const b=document.createElement('button');b.dataset.state=key;b.type='button';
      const c=document.createElement('canvas');c.width=320;c.height=224;c.setAttribute('aria-hidden','true');b.append(c);
      const name=document.createElement('span');name.className='state-name';name.textContent=label;b.append(name);
      const no=document.createElement('span');no.className='state-no';no.textContent=String(++i).padStart(2,'0');b.append(no);
      b.addEventListener('click',()=>chooseState(key));$('state-buttons').append(b);
    }
    $('ship').addEventListener('change',e=>chooseShip(e.target.value));
    for(const button of document.querySelectorAll('[data-effect]'))button.addEventListener('click',()=>chooseEffect(button.dataset.effect));
    $('sink').addEventListener('click',()=>chooseState('sinking'));
    $('replay').addEventListener('click',()=>mode==='effect'?chooseEffect(effect):chooseState(state));
    $('play').addEventListener('click',()=>{if(elapsed>=duration())elapsed=0;playing=!playing;lastTime=0;if(!playing)stopAudio();draw();});
    $('scrub').addEventListener('input',e=>{playing=false;stopAudio();elapsed=Number(e.target.value)/1000*duration();rocketSoundPlayed=elapsed>=.5;draw();});
    $('smoke').addEventListener('change',draw);$('water').addEventListener('change',draw);
    $('sound').addEventListener('click',()=>{
      audible=!audible;$('sound').setAttribute('aria-pressed',String(audible));
      $('sound').textContent=audible?'צליל פעיל ◉':'צליל כבוי ◌';
      if(audible)sound('hit');else stopAudio();
    });
    document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden)stopAudio();});
    await Promise.all([loadTexture('combat'),loadTexture('ambient')]);
    await chooseShip(shipId);
    window.navalSinking={
      get ready(){return ready;},
      snapshot(options={}){
        if(options.state){state=options.state;mode=state==='sinking'?'sink':'state';effect=null;}
        if(options.effect){effect=options.effect;mode='effect';if(state==='sinking')state='intact';}
        if(options.smoke!==undefined)$('smoke').checked=options.smoke;
        if(options.water!==undefined)$('water').checked=options.water;
        elapsed=options.time??elapsed;playing=false;rocketSoundPlayed=true;stopAudio();draw();drawCards();return this.metrics();
      },
      async selectShip(key){$('ship').value=key;await chooseShip(key);return this.metrics();},
      metrics(){return {ready,ship:shipId,state,mode,effect,time:elapsed,playing,audible,soundCount,draws:frameDraws,loadedAtlases:[...textures.keys()],decodedTextureBytes:[...textures.values()].reduce((sum,b)=>sum+b.width*b.height*4,0),sinkingFrame:mode==='sink'?frameOf(ship().sinkingHull,elapsed):null,width:innerWidth,height:innerHeight};}
    };
    requestAnimationFrame(animate);
  }catch(error){showError(error);}
}
init();
