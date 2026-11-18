import {createG2mAudio} from './g2m-audio.mjs?v=island-v2-20261107-17';
import {createControls} from './controls.mjs?v=island-v2-20261107-17';
import {createGameArt} from './art.mjs?v=island-v2-20261107-17';
import {loadOptionalArt} from './model-art.mjs?v=island-v2-20261107-17';
import {alienIcon,alienHandedness} from './alien-ui.mjs';
import {alienBakeSettings} from './alien-assets.mjs';
import {alienFlightAxis,createAlienFlightInput} from './alien-flight-input.mjs?v=island-v2-20261107-17';
import {alienV9Enabled} from './alien-v9.mjs';
import {createAlienFlightHud} from './alien-flight-input-hud.mjs?v=island-v2-20261107-17';
import {alienV15Enabled} from './alien-v15.mjs?v=island-v2-20261107-17';
import {createV15ShotAudio} from './alien-v15-audio.mjs?v=island-v2-20261107-17';
import {v23Config} from './alien-v23.mjs?v=island-v2-20261107-17';
import {createAlienVulcan} from './alien-v23-ui.mjs?v=island-v2-20261107-17';
import {alienHudV24Enabled,alienRefillEnabled,v24Config} from './alien-v24.mjs?v=island-v2-20261107-17';
import {createAlienV24Audio} from './alien-v24-audio.mjs?v=island-v2-20261107-17';
import {createAlienV25Audio} from './alien-v25-audio.mjs?v=island-v2-20261107-17';
import {preloadAlienV25} from './alien-v25-draw.mjs?v=island-v2-20261107-17';
import {alienHudV25Enabled,SPECIALS} from './alien-v25-arsenal.mjs?v=island-v2-20261107-17';
import {createAlienSpecialSwitch,ensureAlienV25Style} from './alien-v25-ui.mjs?v=island-v2-20261107-17';
let v24Styled=false;
/** v24 HUD stylesheet, once per page. */
function ensureV24Style(){if(v24Styled||!globalThis.document?.head)return;v24Styled=true;const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./alien-v24.css?v=island-v2-20261107-17',import.meta.url).href;document.head.append(link);}

/** Keep action pulses until a simulation frame can consume them. A touch which
 * starts and ends between RAFs must still launch exactly one missile. */
export function alienFrameInput(controls,dt,flight,deadzone=.12,vulcan=null,specialSwitch=null){
 if(dt<=0)return null;
 const sample=controls.sample();
 const input={moveX:sample.moveX,firing:sample.kickHeld,nova:sample.passHeld};
 // v23: the Vulcan has its own button (and key); without it (?alienFire=v15) the input keeps the v22 shape.
 if(vulcan)input.vulcan=vulcan.sample();
 // v25 arsenal: the weapon switch (button or C) as an edge; absent with ?alienArsenal=0, so the input keeps the v24 shape.
 if(specialSwitch)input.switchSpecial=specialSwitch.sample();
 if(!flight)return input;
 const intent=flight.sample(),keyboard=alienFlightAxis(sample.moveX,deadzone);
 input.moveX=keyboard||intent.moveX;input.firing=Boolean(sample.kickHeld||intent.autoFire);input.flight=true;
 if(!keyboard&&intent.active&&Number.isFinite(intent.x))input.x=intent.x;
 return input;
}

/** Alien-only lifecycle; the other games keep their existing canvas adapter. */
export function runAlienSession(ctx,createModel,draw,createView){
 const {canvas,controls,status,dialog,balance:b,config,t}=ctx;
 const audio=createG2mAudio({v13:b.v13}),shotAudio=b.v14&&alienV15Enabled()?createV15ShotAudio():null,v24Audio=b.v14&&alienV15Enabled()&&alienRefillEnabled()?createAlienV24Audio():null;
 // v15: steady cannon shots use their own single-shot sound; every other event (and Vulcan bursts) keeps the shared audio.
 // v24: the magazine pick-up and the Vulcan lock play the Codex samples (alien-v24-audio); the shared bank ignores those names.
 // v25: the Vulcan's rotary loop (alien-v25-audio) follows model.vulcanOn; once it is decoded the per-bullet 'shot' of the Vulcan stream is
 // left to it, and the lock plays its clutch and air release. Until it loads (or with ?alienVulcan=v24) everything below is v24 as it was.
 // v25 arsenal: the lightning, the shockwave and the ammo pick-up are synthesized there too (the shared bank stands in if that context is not up).
 let v25Audio=null,vulcan25=false;
 const sound=event=>{if(event==='lightning'||event==='shockwave'||event==='ammo'){if(!v25Audio?.play(event))audio.play(event==='ammo'?'bonus':event==='shockwave'?'missileExplosion':'laser');return;}if(event==='overheat'&&vulcan25&&v25Audio){v25Audio.play('overheat');return;}if(event==='refill'||event==='overheat'){v24Audio?.play(event);return;}if(event==='shotSingle'){if(!shotAudio||!shotAudio.play())audio.play('shot');return;}if(event==='shot'&&vulcan25&&v25Audio?.ready)return;audio.play(event);};
 const model=createModel({...ctx,sound,roundChoices:false,completion:'waves'}),paint=canvas.getContext('2d');
 vulcan25=Boolean(model.v25);if(model.v25||model.arsenalOn){v25Audio=createAlienV25Audio();if(model.v25)preloadAlienV25();}
 if(!paint)throw Error('reason.gameStart');
 const art=createGameArt('alienDefense',config,b),quality={low:false};
 art.hudFont=config.visuals.hudFont;art.clockText=art.comboText='';
 let shared,flight,vulcan,specialSwitch,resetting=false;
 let disposed=false,paused=false,frame,last,cssWidth=1,cssHeight=1,dpr=1,samples=0,frameMs=0;
 const view=createView?.({...ctx,art},model),renderContext={...ctx,art,quality,view};
 // v24.4 hull contact (alien-hull.mjs, ?alienHull=0 keeps v24.3): rounds stop where the 3D ship is drawn; the canvas fallback draws the hit circle (0).
 model.hull={get pxPerUnit(){return view&&view.mode==='three'?cssHeight/config.height:0;}};
 void loadOptionalArt(art,alienBakeSettings(b),()=>disposed);
 status.hidden=true;status.textContent='';ctx.upgradePanel?.remove();ctx.spreadButton?.remove();
 controls.classList.add('alien-controls');if(alienV9Enabled())controls.dataset.alienV9='true';
 const shoot=controls.querySelector('#shoot'),missile=controls.querySelector('#pass');
 shoot.setAttribute('aria-label',t('minigame.fire'));shoot.replaceChildren(alienIcon('fire'));
 missile.setAttribute('aria-label',t('minigame.nova'));missile.replaceChildren(alienIcon('nova'));
 const count=document.createElement('small');count.className='alien-ammo';missile.append(count);
 const pause=dialog.querySelector('[data-action=game-pause]');pause?.replaceChildren(alienIcon('pause'));
 const stick=controls.querySelector('#joystick');stick.hidden=false;
 function resetInput(){
  if(resetting)return;resetting=true;
  flight?.reset();shared?.reset();vulcan?.reset();specialSwitch?.setEnabled(!paused&&!document.hidden);model.resetInput?.();model.player.vx=0;model.player.bank=0;
  resetting=false;
 }
 shared=createControls({root:controls,config:b.controls,onGesture:()=>{audio.unlock();shotAudio?.unlock();v24Audio?.unlock();v25Audio?.unlock();},onCancel:resetInput});
 shared.setHanded(alienHandedness(b.controls));shared.setEnabled(true);
 flight=createAlienFlightInput({canvas,controls,config:b.controls,modelWidth:config.width,playerRadius:b.playerRadius,getPlayerX:()=>model.player.x,onGesture:()=>{audio.unlock();shotAudio?.unlock();v25Audio?.unlock();},onCancel:resetInput});flight.setEnabled(true);
 // v23: a second fire button for the Vulcan (the fire button stays the steady cannon). Only when the model runs v23.
 if(model.v23){vulcan=createAlienVulcan({controls,cfg:v23Config(b),label:t('minigame.vulcan'),lockedLabel:t('minigame.vulcanLocked'),regularLabel:t('minigame.fireRegular'),onGesture:()=>{audio.unlock();shotAudio?.unlock();v24Audio?.unlock();v25Audio?.unlock();}});vulcan.setEnabled(true);}
 // v24 HUD: thin rings in one column at the right edge (alien-v24.css); ?alienHud=v23 keeps the v23 row. Only with the two-button fire.
 const hudV24=Boolean(vulcan)&&alienHudV24Enabled(),captionSeconds=v24Config(b).refill.hudSeconds;if(hudV24){ensureV24Style();controls.dataset.alienHud='v24';controls.dataset.alienCaptions='on';}
 // v25 HUD (?alienHud=v24 keeps the v24 column and the text by the stick): the same rings lower, from the bottom corner up, and no text on the left.
 const hudV25=hudV24&&alienHudV25Enabled();if(hudV25){ensureAlienV25Style();controls.dataset.alienLow='on';}
 // v25 arsenal (?alienArsenal=0 keeps the missile alone): the special button fires the selected weapon, the switch beside it picks the next one.
 if(model.arsenalOn){ensureAlienV25Style();specialSwitch=createAlienSpecialSwitch({controls,special:missile,missileIcon:missile.querySelector('svg'),labels:{missile:t('minigame.nova'),lightning:t('minigame.lightning'),shockwave:t('minigame.shockwave'),switch:t('minigame.weaponSwitch')},onGesture:()=>{audio.unlock();shotAudio?.unlock();v24Audio?.unlock();v25Audio?.unlock();}});specialSwitch.setEnabled(true);}
 const flightHud=createAlienFlightHud({dialog,controls});if(hudV25){const hudRoot=dialog.querySelector('.alien-flight-hud');if(hudRoot)hudRoot.dataset.low='on';}
 const resize=()=>{if(disposed)return;const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);if(width!==cssWidth||height!==cssHeight)resetInput();cssWidth=width;cssHeight=height;dpr=Math.min(devicePixelRatio||1,quality.low?config.lowDpr:config.maxDpr);canvas.width=Math.round(cssWidth*dpr);canvas.height=Math.round(cssHeight*dpr);model.effectAspect=(cssWidth/cssHeight)/(config.width/config.height);view?.resize(cssWidth,cssHeight);};
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 const events=new AbortController(),options={signal:events.signal};
 document.addEventListener('visibilitychange',()=>{resetInput();shared.setEnabled(!paused&&!document.hidden);flight.setEnabled(!paused&&!document.hidden);vulcan?.setEnabled(!paused&&!document.hidden);audio.setPaused(paused||document.hidden);shotAudio?.setPaused(paused||document.hidden);v24Audio?.setPaused(paused||document.hidden);v25Audio?.setPaused(paused||document.hidden);last=undefined;},options);
 window.addEventListener('blur',()=>{resetInput();last=undefined;},options);
 for(const kind of ['contextmenu','selectstart','dragstart'])dialog.addEventListener(kind,e=>{e.preventDefault();resetInput();},options);
 function hud(){
  const r=b.render,x=r.hudInset,y=r.hudInset,s=r.hudHeartSize;
  paint.fillStyle='#c5fff1';
  for(let i=0;i<model.maxLives;i++){paint.globalAlpha=i<model.lives?1:.18;const hx=x+i*r.hudHeartGap;paint.beginPath();paint.moveTo(hx,y+s);paint.bezierCurveTo(hx-s*2,y,hx-s,y-s,hx,y-s/3);paint.bezierCurveTo(hx+s,y-s,hx+s*2,y,hx,y+s);paint.fill();}
  paint.globalAlpha=1;
  for(let i=0;i<model.settings.waves;i++){paint.fillStyle=i<model.wave?'#9bf8e4':'#38536e';paint.beginPath();paint.arc(cssWidth/2+(i-(model.settings.waves-1)/2)*r.hudDotGap,y,r.hudDotRadius,0,Math.PI*2);paint.fill();}
 }
 function tick(now){
  if(disposed)return;
  const elapsed=last===undefined?0:now-last,dt=paused||document.hidden?0:Math.min(config.maxFrameSeconds,elapsed/1000);last=now;
  try{
   audio.sync();
   if(dt>0){
    const input=alienFrameInput(shared,dt,flight,b.controls.deadzone,vulcan,specialSwitch);model.update(dt,input);
    samples++;frameMs+=elapsed;
    if(samples>=b.render.fallbackSampleFrames){const slow=frameMs/samples>b.render.fallbackFrameMs;if(slow){if(quality.low)view?.degrade(true);else{quality.low=true;view?.degrade();resize();}}samples=frameMs=0;}
   }
   if(model.result){const result=ctx.finish(model.result);if(!result.ok){ctx.cancel();ctx.onError?.(result.reason);}return;}
   paint.setTransform(dpr,0,0,dpr,0,0);paint.save();paint.scale(cssWidth/config.width,cssHeight/config.height);renderContext.pixelAspect=(cssWidth/cssHeight)/(config.width/config.height);draw(paint,model,renderContext);paint.restore();hud();flightHud.update(model,flight.sample(),paused||document.hidden);vulcan?.update(model);v25Audio?.update(model);if(hudV24){const captions=model.time<captionSeconds?'on':'off';if(controls.dataset.alienCaptions!==captions)controls.dataset.alienCaptions=captions;}
   // v25 arsenal: the count, the disabled state and the arc follow the selected special weapon (the missile as before).
   const sel=model.arsenalOn?model.special:0,ammoNow=model.arsenalOn?model.specialAmmo[sel]:model.novaCharges;specialSwitch?.update(model);
   count.textContent=String(ammoNow);
   missile.disabled=sel===1?ammoNow<=0||!model.aliens.some(a=>a.y+a.radius>0&&a.y<model.player.y-10):sel===2?ammoNow<=0||model.shockwaves.length>0||!model.aliens.length:!model.aliens.some(a=>a.y+a.radius>0)||model.novaCharges<=0||model.nova.flight>0||model.nova.life>0;
   const charge=model.nova.flight>0?1-model.nova.flight/(model.nova.flightMax||b.nova.throwSeconds):model.nova.life>0?1-model.nova.life/b.nova.seconds:model.novaCharges>0?1:0;
   const arc=sel===2&&model.shockwaves.length?model.shockwaves[0].r/(model.arsenalCfg?.shockwave.maxRadius||330):sel>0?(ammoNow>0?1:0):charge;
   missile.style.setProperty('--charge',`${arc*100}%`);
   missile.setAttribute('aria-label',`${t(sel===1?'minigame.lightning':sel===2?'minigame.shockwave':'minigame.nova')} ${ammoNow}`);
   frame=requestAnimationFrame(tick);
  }catch(error){dispose();ctx.cancel();ctx.onError?.('reason.gameStart');}
 }
 function dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);events.abort();observer.disconnect();resetInput();flight.dispose();flightHud.dispose();vulcan?.dispose();specialSwitch?.dispose();if(hudV25)delete controls.dataset.alienLow;if(hudV24){delete controls.dataset.alienHud;delete controls.dataset.alienCaptions;}shared.dispose();audio.dispose({finishTail:model.result?.outcome==='win'});shotAudio?.dispose();v24Audio?.dispose();v25Audio?.dispose();view?.dispose();
  for(const value of Object.values(art)){if(value?.getContext)value.width=value.height=0;else if(Array.isArray(value))for(const sprite of value)if(sprite?.getContext)sprite.width=sprite.height=0;}
  canvas.width=canvas.height=0;
 }
 const session={dispose,cancel:ctx.cancel,setPaused(value){paused=Boolean(value);resetInput();shared.setEnabled(!paused&&!document.hidden);flight.setEnabled(!paused&&!document.hidden);vulcan?.setEnabled(!paused&&!document.hidden);flightHud.setPaused(paused);audio.setPaused(paused);shotAudio?.setPaused(paused);v24Audio?.setPaused(paused);v25Audio?.setPaused(paused);last=undefined;},get snapshot(){return {...model.snapshot(),audio:audio.metrics(),shotAudio:shotAudio?.metrics()||null,paused,flightInput:flight.sample(),vulcanButton:vulcan?{held:vulcan.held,level:vulcan.button.dataset.level,blink:vulcan.button.dataset.blink,heat:vulcan.button.style.getPropertyValue('--heat'),locked:vulcan.button.dataset.locked==='true'}:null,hud:hudV25?'v25':hudV24?'v24':vulcan?'v23':'v22',special:model.arsenalOn?{selected:SPECIALS[model.special],ammo:[...model.specialAmmo],switch:Boolean(specialSwitch)}:null,v24Audio:v24Audio?.metrics()||null,v25Audio:v25Audio?.metrics()||null,vulcanV25:Boolean(model.v25),renderMode:view?.mode||'canvas',renderMetrics:view?.metrics?.(),viewport:{width:config.width,height:config.height,modelWidth:config.width,modelHeight:config.height,scale:cssWidth/config.width,scaleY:cssHeight/config.height,offsetX:0,offsetY:0},artModels:art.modelArt};}};
 if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,view};
 frame=requestAnimationFrame(tick);return session;
}
