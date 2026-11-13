/** 13/11/2026 fire v23: one session for both bonus missions (water targets, inside the building). Loaded on first use by
 * fire.mjs startFireBonus. Owns its HUD and controls inside the game dialog; the shared shell (pause, sound, "stuck? restart") is
 * untouched. The pure models are fire-targets.mjs and fire-interior.mjs; pictures come from fire-v23-assets.mjs. */
import {createTargetsModel} from './fire-targets.mjs?v=island-v2-20261107-11';
import {createInteriorModel,TOOLS,rescueCovered} from './fire-interior.mjs?v=island-v2-20261107-11';
import {TARGET_STAGES,INTERIOR_STAGES,fireBonusNumber} from './fire-bonus.mjs?v=island-v2-20261107-11';
import {FIRE_V23_IMAGES,FIRE_V23_NEEDS,FIRE_V23_ICONS,fireV23AssetURL,spriteBox} from './fire-v23-assets.mjs?v=island-v2-20261107-11';
import {createBonusPainter} from './fire-bonus-draw.mjs?v=island-v2-20261107-11';
import {createG2nAudio} from './g2n-audio.mjs?v=island-v2-20261107-11';

const NS='http://www.w3.org/2000/svg';
function icon(name){const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(NS,'path');p.setAttribute('d',FIRE_V23_ICONS[name]||FIRE_V23_ICONS.star);svg.append(p);return svg;}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}

export function runFireBonusSession(ctx){
  const mode=ctx.fireMode,level=ctx.fireBonusLevel,stage=(mode==='targets'?TARGET_STAGES:INTERIOR_STAGES)[level-1];
  if(!stage)throw RangeError('Unknown fire bonus stage');
  const {canvas,controls,dialog,t}=ctx,audio=createG2nAudio();audio.unlock();
  const sound=e=>audio.play(e),model=mode==='targets'?createTargetsModel({stage,sound}):createInteriorModel({stage,sound});
  const paint=canvas.getContext('2d');if(!paint)throw Error('reason.gameStart');
  const images=new Map(),events=new AbortController(),options={signal:events.signal};
  let disposed=false,paused=false,frame=0,last,W=1,H=1,dpr=1,ready=false,loadFailed=false,firstFrame=false,drawn=0,lowQuality=Boolean(ctx.lite);
  // ---- pictures: what this mode needs first, the rest behind it ---------------------------------------------------------------------
  const needs=FIRE_V23_NEEDS[mode],all=Object.keys(FIRE_V23_IMAGES).filter(id=>mode==='targets'?['street','truck','flame','smoke','steam','water','ember'].includes(id)||id.startsWith('crew-'):true);
  let loaded=0,failed=0;
  const loadOne=id=>new Promise(resolve=>{const im=new Image();im.decoding='async';im.onload=()=>{loaded++;resolve(true);};im.onerror=()=>{failed++;resolve(false);};im.src=fireV23AssetURL(id);images.set(id,im);});
  Promise.all(needs.map(loadOne)).then(results=>{if(disposed)return;if(results.filter(Boolean).length<Math.ceil(needs.length*.6))loadFailed=true;ready=true;for(const id of all)if(!images.has(id))loadOne(id);});
  const painter=createBonusPainter(images);
  // ---- styles and HUD -------------------------------------------------------------------------------------------------------------
  const links=['./fire.css?v=island-v2-20261107-11','./fire-v23.css?v=island-v2-20261107-11'].map(href=>{const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(href,import.meta.url).href;document.head.append(link);return link;});
  dialog.classList.add('fire-play','fire-v23','fire-v23-'+mode);ctx.status.hidden=true;if(ctx.warning)ctx.warning.hidden=true;
  const pause=dialog.querySelector('[data-action=game-pause]');if(pause){const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 24 24');const p=document.createElementNS(NS,'path');p.setAttribute('d','M8 5v14M16 5v14');svg.append(p);pause.replaceChildren(svg);}
  controls.replaceChildren();const pad=el('div','fv-pad');controls.append(pad); // not direct children of .game-controls: the shell's button skin stays off
  const hud=el('div','fv-hud');hud.setAttribute('role','group');
  const scoreBox=el('div','fv-chip fv-score');scoreBox.append(icon('star'),el('bdi','fv-score-value','0'));
  const leftBox=el('div','fv-chip fv-left');leftBox.append(icon(mode==='targets'?'flame':'door'),el('bdi','fv-left-value',''));
  hud.append(scoreBox,leftBox);
  const coach=el('div','fv-coach'),title=el('span','fv-title',t(stage.titleKey)),coachText=el('span','fv-coach-text');title.dataset.number=String(fireBonusNumber(mode,level,ctx.config?.fireRescue?.levels?.length||30));coachText.setAttribute('role','status');coachText.setAttribute('aria-live','polite');coach.append(title,coachText);
  const gauge=el('div','fv-gauge');gauge.setAttribute('role','meter');gauge.setAttribute('aria-valuemin','0');gauge.setAttribute('aria-valuemax','100');gauge.setAttribute('aria-label',t(mode==='targets'?'fire.v23.pressure':'fire.waterGauge'));
  const gaugeFill=el('i','fv-gauge-fill'),gaugeText=el('bdi','fv-gauge-text','100%');gauge.append(icon('spray'),el('span','fv-gauge-track'),gaugeText);gauge.querySelector('.fv-gauge-track').append(gaugeFill);
  dialog.append(hud,coach,gauge);
  const button=(cls,label,iconName,text)=>{const b=el('button','fv-button '+cls);b.type='button';b.setAttribute('aria-label',label);b.append(icon(iconName));if(text){const s=el('span','fv-button-label',text);s.setAttribute('aria-hidden','true');b.append(s);}pad.append(b);return b;};
  const input={};let pointerId=null,downAt=0,downPoint=null,moved=false;
  // ---- targets controls: aim with one finger anywhere, hold the hose button with the other thumb -------------------------------
  let spray=null,wind=null,windArrow=null;
  if(mode==='targets'){
    spray=button('fv-spray',t('minigame.spray'),'spray',t('fire.action.fire'));spray.id='shoot';
    wind=el('div','fv-wind');wind.setAttribute('role','img');windArrow=el('i','fv-wind-arrow');wind.append(icon('wind'),windArrow,el('bdi','fv-wind-value',''));dialog.append(wind);
    spray.addEventListener('pointerdown',e=>{if(paused)return;e.preventDefault();input.firing=true;spray.classList.add('held');try{spray.setPointerCapture(e.pointerId);}catch{}audio.unlock();},options);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])spray.addEventListener(type,()=>{input.firing=false;spray.classList.remove('held');},options);
    spray.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();input.firing=true;}},options);spray.addEventListener('keyup',()=>{input.firing=false;},options);
  }
  // ---- interior controls: touch the room to spray, tools on the right, crawl at the bottom left ------------------------------
  const toolButtons={};let crawl=null,enter=null,finish=null,card=null;
  if(mode==='interior'){
    const column=el('div','fv-tools');column.setAttribute('role','group');column.setAttribute('aria-label',t('fire.v23.tools'));pad.append(column);
    for(const tool of TOOLS){const b=el('button','fv-button fv-tool');b.type='button';b.dataset.tool=tool;b.setAttribute('aria-label',t('fire.v23.tool.'+tool));b.append(icon(tool));const ring=el('i','fv-tool-level');b.append(ring,el('bdi','fv-tool-count',''));column.append(b);toolButtons[tool]=b;
      b.addEventListener('click',()=>{if(paused)return;if(!model.unlocked.includes(tool)){showCoach('fire.v23.say.locked');return;}input.tool=tool;},options);}
    crawl=button('fv-crawl',t('fire.v23.crawl'),'crawl',t('fire.v23.crawlShort'));
    crawl.addEventListener('pointerdown',e=>{if(paused)return;e.preventDefault();input.crawl=true;crawl.classList.add('held');try{crawl.setPointerCapture(e.pointerId);}catch{}},options);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])crawl.addEventListener(type,()=>{input.crawl=false;crawl.classList.remove('held');},options);
    enter=button('fv-enter',t('fire.v23.enter'),'door',t('fire.v23.enter'));enter.addEventListener('click',()=>{if(!paused)input.enter=true;},options);
    finish=button('fv-finish',t('fire.v23.finish'),'star',t('fire.v23.finish'));finish.addEventListener('click',()=>{if(!paused)input.finish=true;},options);
    card=el('div','fv-card');card.hidden=true;card.setAttribute('role','dialog');dialog.append(card);
    card.addEventListener('pointerdown',e=>{e.preventDefault();if(!paused)input.skip=true;},options);
  }
  let coachOverride=null;function showCoach(key){coachOverride={key,until:performance.now()+2400};}
  // ---- canvas input ------------------------------------------------------------------------------------------------------------------
  const local=e=>{const r=canvas.getBoundingClientRect();return painter.toScene(e.clientX-r.left,e.clientY-r.top);};
  canvas.addEventListener('pointerdown',e=>{if(paused||pointerId!==null)return;e.preventDefault();audio.unlock();pointerId=e.pointerId;downAt=performance.now();moved=false;const p=local(e);downPoint={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch{}
    if(mode==='targets'){const hit=model.targetAt(p.x,p.y);input.aimX=hit?hit.x:p.x;input.aimY=hit?hit.y:p.y;}else input.pointer=p;},options);
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId)return;if(Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>14)moved=true;const p=local(e);if(mode==='targets'){input.aimX=p.x;input.aimY=p.y;}else input.pointer=p;},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(e.pointerId!==pointerId)return;pointerId=null;
    if(mode==='interior'){if(type==='pointerup'&&!moved&&performance.now()-downAt<320)input.tap=local(e);delete input.pointer;}},options);
  for(const type of ['contextmenu','selectstart','dragstart'])dialog.addEventListener(type,e=>e.preventDefault(),options);
  const clear=()=>{for(const k of Object.keys(input))delete input[k];pointerId=null;spray?.classList.remove('held');crawl?.classList.remove('held');};
  window.addEventListener('blur',clear,options);document.addEventListener('visibilitychange',()=>{clear();last=undefined;},options);
  window.addEventListener('keydown',e=>{if(paused||mode!=='targets')return;if(e.key===' '){input.firing=true;}},options);window.addEventListener('keyup',e=>{if(e.key===' ')input.firing=false;},options);
  // ---- sizing -----------------------------------------------------------------------------------------------------------------------
  function resize(){if(disposed)return;const r=canvas.getBoundingClientRect();W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(globalThis.devicePixelRatio||1,lowQuality?1.25:2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);painter.resize(W,H);}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  // ---- HUD updates -------------------------------------------------------------------------------------------------------------------
  function gaugeLevel(v,low=.32){return v<=low*.6?'critical':v<=low?'low':'ok';}
  function coachKey(){
    if(coachOverride&&performance.now()<coachOverride.until)return coachOverride.key;
    if(mode==='targets'){if(model.empty)return 'fire.v23.say.pressure';const next=model.targets.find(x=>!x.done);if(!next)return 'fire.v23.say.allOut';
      if(model.targets.some(x=>x.kind==='smoke'&&!x.done&&x.covers!==null))return 'fire.v23.say.smokeFirst';if(Math.abs(model.wind)>120&&model.time>3)return 'fire.v23.say.wind';if(next.kind==='can')return 'fire.v23.say.can';if(next.kind==='fireball')return 'fire.v23.say.fireball';return model.time<6?'fire.v23.say.aim':'fire.v23.say.hold';}
    const f=model.feedback;if(f&&model.time-f.at<2.6)return f.key;
    const p=model.phase;if(p==='arrive')return 'fire.v23.say.arrive';if(p==='door'||p==='enter')return 'fire.v23.say.door';if(p==='victory')return 'fire.v23.say.victory';
    const r=model.room;if(p==='clear')return 'fire.v23.say.roomClear';if(p==='intro')return 'fire.v23.rule.'+r.rule;
    const c=r.rescue;if(c.state==='waiting'&&r.spots.find(s=>s.id===c.near)?.done)return rescueCovered(r)?(r.rule==='smoke'?'fire.v23.say.crawl':'fire.v23.say.smoke'):c.kind==='pet'?'fire.v23.say.tapPet':'fire.v23.say.tapKid';
    if(r.rule==='smoke'&&r.crawl<.5&&rescueCovered(r))return 'fire.v23.say.crawl';
    return 'fire.v23.rule.'+r.rule;
  }
  let lastCoach='';
  function updateHud(){
    const snap=model.snapshot();
    scoreBox.lastChild.textContent=String(snap.score);
    if(mode==='targets'){leftBox.lastChild.textContent=`${snap.total-snap.remaining}/${snap.total}`;
      const pct=Math.round(snap.pressure*100);gaugeFill.style.transform=`scaleY(${snap.pressure})`;gaugeText.textContent=pct+'%';gauge.dataset.level=snap.empty?'critical':gaugeLevel(snap.pressure);gauge.setAttribute('aria-valuenow',String(pct));
      spray.classList.toggle('empty',snap.empty);spray.style.setProperty('--fv-level',String(snap.pressure));
      const w=snap.wind,strength=Math.min(1,Math.abs(w)/500);wind.hidden=Math.abs(w)<20;windArrow.style.transform=`scaleX(${w<0?-1:1})`;wind.style.setProperty('--fv-wind',String(strength));wind.lastChild.textContent=String(Math.round(strength*3+.49)||1);wind.setAttribute('aria-label',t('fire.v23.wind'));
    }else{
      const phase=snap.phase,inRoom=snap.room&&!['arrive','door','enter','victory'].includes(phase);
      leftBox.lastChild.textContent=`${snap.rooms.filter(r=>r.cleared).length}/${snap.rooms.length}`;
      const water=snap.tanks.water;gaugeFill.style.transform=`scaleY(${water})`;gaugeText.textContent=Math.round(water*100)+'%';gauge.dataset.level=gaugeLevel(water,.3);gauge.hidden=!inRoom;gauge.setAttribute('aria-valuenow',String(Math.round(water*100)));
      for(const tool of TOOLS){const b=toolButtons[tool],open=snap.unlocked.includes(tool);b.hidden=!inRoom;b.classList.toggle('locked',!open);b.classList.toggle('active',snap.tool===tool);b.classList.toggle('new',model.newTool===tool||(phase==='play'&&snap.room&&snap.room.time<5&&model.room.tool===tool));b.setAttribute('aria-pressed',String(snap.tool===tool));
        const level=tool==='blanket'?(snap.blankets?1:0):snap.tanks[tool];b.style.setProperty('--fv-level',String(level??1));b.querySelector('.fv-tool-count').textContent=tool==='blanket'&&open?String(snap.blankets):'';}
      crawl.hidden=!(inRoom&&snap.room.rule==='smoke');enter.hidden=phase!=='door';finish.hidden=phase!=='victory';
      if(phase==='intro'){const r=model.room;card.hidden=false;if(card.dataset.room!==r.id){card.dataset.room=r.id;card.replaceChildren(el('h3','fv-card-title',t('fire.v23.room.'+r.id)),el('p','fv-card-rule',t('fire.v23.rule.'+r.rule)));const tool=el('div','fv-card-tool');tool.append(icon(r.tool),el('span','',t('fire.v23.newTool',{tool:t('fire.v23.tool.'+r.tool)})));card.append(tool,el('p','fv-card-tap',t('fire.v23.tapToStart')));}}
      else card.hidden=true;
      dialog.dataset.fvPhase=phase;dialog.dataset.fvRoom=snap.room?.id||'';
    }
    const key=coachKey();if(key!==lastCoach){lastCoach=key;coachText.textContent=t(key);}
  }
  // ---- audio: the fire mix reads a small adapter ------------------------------------------------------------------------------------
  const audioModel={truck:{speed:0},spraying:false,pressure:1,flames:[],refilling:false,water:1,maxWater:1,rescuing:false,ladder:{extension:0}},audioBalance={vehicle:{speed:1}};
  function updateAudio(){
    if(mode==='targets'){audioModel.spraying=model.spraying;audioModel.pressure=model.pressure;audioModel.flames=model.targets.filter(x=>!x.done&&(x.kind==='window'||x.kind==='roof'||x.kind==='fireball')).map(()=>({active:true,heat:1}));}
    else{audioModel.truck.speed=model.phase==='arrive'?1-model.truckProgress:0;audioModel.spraying=model.spraying&&model.tool!=='blanket';audioModel.pressure=model.tanks[model.tool]??1;audioModel.flames=model.room&&['play','intro'].includes(model.phase)?model.room.spots.filter(s=>!s.done).map(()=>({active:true,heat:1})):[];}
    audio.update(audioModel,audioBalance);
  }
  // ---- frame ------------------------------------------------------------------------------------------------------------------------
  let samples=0,slow=0;
  function tick(now){
    if(disposed)return;frame=requestAnimationFrame(tick);
    const elapsed=last===undefined?0:now-last,dt=paused||document.hidden?0:Math.min(.1,elapsed/1000);last=now;
    if(dt>0){samples++;if(elapsed>40)slow++;if(samples>=90){if(slow>45&&!lowQuality){lowQuality=true;resize();}samples=slow=0;}}
    try{
      if(!paused&&ready&&dt>0){const step={...input};delete input.tap;delete input.enter;delete input.finish;delete input.skip;delete input.tool;model.update(dt,step);} // one-shot inputs wait for a real frame
      updateAudio();
      if(ready){paint.setTransform(dpr,0,0,dpr,0,0);paint.clearRect(0,0,W,H);
        if(mode==='targets')painter.drawTargets(paint,model,model.time,paused?0:dt,dpr);else painter.drawInterior(paint,model,model.time,paused?0:dt,dpr);drawn++;firstFrame=true;}
      updateHud();
      if(model.result){const raw=model.result,result=ctx.finish(raw);if(!result.ok){ctx.cancel();ctx.onError?.(result.reason);}}
    }catch(error){cancelAnimationFrame(frame);ctx.cancel();ctx.onError?.('reason.gameStart');if(new URLSearchParams(location.search).get('dev')==='1')console.error(error);}
  }
  frame=requestAnimationFrame(tick);
  const session={
    get ready(){return ready&&firstFrame;},get loadFailed(){return loadFailed;},
    cancel:ctx.cancel,
    setPaused(value){paused=Boolean(value);audio.setPaused(paused);clear();last=undefined;},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);events.abort();observer.disconnect();audio.dispose();for(const l of links)l.remove();hud.remove();coach.remove();gauge.remove();wind?.remove();card?.remove();controls.replaceChildren();dialog.classList.remove('fire-v23','fire-v23-'+mode);delete dialog.dataset.fvPhase;delete dialog.dataset.fvRoom;canvas.width=canvas.height=0;},
    /** Model state plus where things are on the screen (CSS px of the canvas), for the browser checks. */
    get snapshot(){const s=model.snapshot(),r=canvas.getBoundingClientRect(),screen=p=>{const q=painter.toScreen(p.x,p.y);return {x:+(r.left+q.x).toFixed(1),y:+(r.top+q.y).toFixed(1)};};
      const out={...s,ready:session.ready,loaded,failed,renderMode:'canvas2d',renderMetrics:{loaded,failed,drawn,images:images.size,lowQuality},paused,audio:audio.snapshot(),viewport:{width:W,height:H,dpr,fit:{...painter.fit}}};
      if(mode==='targets'){out.screen={aim:screen(s.aim),impact:screen(s.impact),nozzle:screen(s.nozzle),targets:s.targets.map(x=>({id:x.id,kind:x.kind,done:x.done,...screen(x)}))};}
      else{const room=s.room;out.screen={door:screen(s.door)};if(room&&!['arrive','door','enter','victory'].includes(s.phase)){out.screen.spots=room.spots.map(x=>({id:x.id,kind:x.kind,done:x.done,...screen(x)}));const c=room.rescue;out.screen.rescue={...screen({x:c.x,y:(c.y*.4+c.headY*.6)}),state:c.state};}}
      return out;},
  };
  if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,painter,images};
  return session;
}
