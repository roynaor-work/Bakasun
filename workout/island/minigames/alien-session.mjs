import {createG2mAudio} from './g2m-audio.mjs?v=island-cityplay-20261025-1';
import {createControls} from './controls.mjs?v=island-cityplay-20261025-1';
import {createGameArt} from './art.mjs?v=island-cityplay-20261025-1';
import {loadOptionalArt} from './model-art.mjs?v=island-cityplay-20261025-1';
import {alienIcon,alienHandedness} from './alien-ui.mjs';
import {alienBakeSettings} from './alien-assets.mjs';
import {alienFlightAxis,createAlienFlightInput} from './alien-flight-input.mjs?v=island-cityplay-20261025-1';
import {createAlienFlightHud} from './alien-flight-input-hud.mjs?v=island-cityplay-20261025-1';

/** Keep action pulses until a simulation frame can consume them. A touch which
 * starts and ends between RAFs must still launch exactly one missile. */
export function alienFrameInput(controls,dt,flight,deadzone=.12){
 if(dt<=0)return null;
 const sample=controls.sample();
 const input={moveX:sample.moveX,firing:sample.kickHeld,nova:sample.passHeld};
 if(!flight)return input;
 const intent=flight.sample(),keyboard=alienFlightAxis(sample.moveX,deadzone);
 input.moveX=keyboard||intent.moveX;input.firing=Boolean(sample.kickHeld||intent.autoFire);input.flight=true;
 if(!keyboard&&intent.active&&Number.isFinite(intent.x))input.x=intent.x;
 return input;
}

/** Alien-only lifecycle; the other games keep their existing canvas adapter. */
export function runAlienSession(ctx,createModel,draw,createView){
 const {canvas,controls,status,dialog,balance:b,config,t}=ctx;
 const audio=createG2mAudio();
 const model=createModel({...ctx,sound:audio.play,roundChoices:false,completion:'waves'}),paint=canvas.getContext('2d');
 if(!paint)throw Error('reason.gameStart');
 const art=createGameArt('alienDefense',config,b),quality={low:false};
 art.hudFont=config.visuals.hudFont;art.clockText=art.comboText='';
 let shared,flight,resetting=false;
 let disposed=false,paused=false,frame,last,cssWidth=1,cssHeight=1,dpr=1,samples=0,frameMs=0;
 const view=createView?.({...ctx,art},model),renderContext={...ctx,art,quality,view};
 void loadOptionalArt(art,alienBakeSettings(b),()=>disposed);
 status.hidden=true;status.textContent='';ctx.upgradePanel?.remove();ctx.spreadButton?.remove();
 controls.classList.add('alien-controls');
 const shoot=controls.querySelector('#shoot'),missile=controls.querySelector('#pass');
 shoot.setAttribute('aria-label',t('minigame.fire'));shoot.replaceChildren(alienIcon('fire'));
 missile.setAttribute('aria-label',t('minigame.nova'));missile.replaceChildren(alienIcon('nova'));
 const count=document.createElement('small');count.className='alien-ammo';missile.append(count);
 const pause=dialog.querySelector('[data-action=game-pause]');pause?.replaceChildren(alienIcon('pause'));
 const stick=controls.querySelector('#joystick');stick.hidden=false;
 function resetInput(){
  if(resetting)return;resetting=true;
  flight?.reset();shared?.reset();model.resetInput?.();model.player.vx=0;model.player.bank=0;
  resetting=false;
 }
 shared=createControls({root:controls,config:b.controls,onGesture:()=>audio.unlock(),onCancel:resetInput});
 shared.setHanded(alienHandedness(b.controls));shared.setEnabled(true);
 flight=createAlienFlightInput({canvas,controls,config:b.controls,modelWidth:config.width,playerRadius:b.playerRadius,getPlayerX:()=>model.player.x,onGesture:()=>audio.unlock(),onCancel:resetInput});flight.setEnabled(true);
 const flightHud=createAlienFlightHud({dialog,controls});
 const resize=()=>{if(disposed)return;const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);if(width!==cssWidth||height!==cssHeight)resetInput();cssWidth=width;cssHeight=height;dpr=Math.min(devicePixelRatio||1,quality.low?config.lowDpr:config.maxDpr);canvas.width=Math.round(cssWidth*dpr);canvas.height=Math.round(cssHeight*dpr);model.effectAspect=(cssWidth/cssHeight)/(config.width/config.height);view?.resize(cssWidth,cssHeight);};
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 const events=new AbortController(),options={signal:events.signal};
 document.addEventListener('visibilitychange',()=>{resetInput();shared.setEnabled(!paused&&!document.hidden);flight.setEnabled(!paused&&!document.hidden);audio.setPaused(paused||document.hidden);last=undefined;},options);
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
    const input=alienFrameInput(shared,dt,flight,b.controls.deadzone);model.update(dt,input);
    samples++;frameMs+=elapsed;
    if(samples>=b.render.fallbackSampleFrames){const slow=frameMs/samples>b.render.fallbackFrameMs;if(slow){if(quality.low)view?.degrade(true);else{quality.low=true;view?.degrade();resize();}}samples=frameMs=0;}
   }
   if(model.result){const result=ctx.finish(model.result);if(!result.ok){ctx.cancel();ctx.onError?.(result.reason);}return;}
   paint.setTransform(dpr,0,0,dpr,0,0);paint.save();paint.scale(cssWidth/config.width,cssHeight/config.height);renderContext.pixelAspect=(cssWidth/cssHeight)/(config.width/config.height);draw(paint,model,renderContext);paint.restore();hud();flightHud.update(model,flight.sample(),paused||document.hidden);
   count.textContent=String(model.novaCharges);
   missile.disabled=!model.aliens.some(a=>a.y+a.radius>0)||model.novaCharges<=0||model.nova.flight>0||model.nova.life>0;
   const charge=model.nova.flight>0?1-model.nova.flight/b.nova.throwSeconds:model.nova.life>0?1-model.nova.life/b.nova.seconds:model.novaCharges>0?1:0;
   missile.style.setProperty('--charge',`${charge*100}%`);
   missile.setAttribute('aria-label',`${t('minigame.nova')} ${model.novaCharges}`);
   frame=requestAnimationFrame(tick);
  }catch(error){dispose();ctx.cancel();ctx.onError?.('reason.gameStart');}
 }
 function dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);events.abort();observer.disconnect();resetInput();flight.dispose();flightHud.dispose();shared.dispose();audio.dispose({finishTail:model.result?.outcome==='win'});view?.dispose();
  for(const value of Object.values(art)){if(value?.getContext)value.width=value.height=0;else if(Array.isArray(value))for(const sprite of value)if(sprite?.getContext)sprite.width=sprite.height=0;}
  canvas.width=canvas.height=0;
 }
 const session={dispose,cancel:ctx.cancel,setPaused(value){paused=Boolean(value);resetInput();shared.setEnabled(!paused&&!document.hidden);flight.setEnabled(!paused&&!document.hidden);flightHud.setPaused(paused);audio.setPaused(paused);last=undefined;},get snapshot(){return {...model.snapshot(),audio:audio.metrics(),paused,flightInput:flight.sample(),renderMode:view?.mode||'canvas',renderMetrics:view?.metrics?.(),viewport:{width:config.width,height:config.height,modelWidth:config.width,modelHeight:config.height,scale:cssWidth/config.width,scaleY:cssHeight/config.height,offsetX:0,offsetY:0},artModels:art.modelArt};}};
 if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,view};
 frame=requestAnimationFrame(tick);return session;
}
