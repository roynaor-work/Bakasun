import {fireIndicators} from './fire-navigation.mjs?v=island-ultra-20261023-1';
import {createG2nAudio} from './g2n-audio.mjs?v=island-ultra-20261023-1';
import {createControls} from './controls.mjs?v=island-ultra-20261023-1';
import {installFireUI,updateFireUI} from './fire-ui.mjs?v=island-ultra-20261023-1';
import {drawFireCity} from './fire-canvas.mjs?v=island-ultra-20261023-1';

/** Fire owns its overlay and lifecycle; shared controls and shell stay untouched. */
export function runFireSession(source,createModel,draw,createView){
  const audio=createG2nAudio();audio.unlock();
  const ctx={...source,sound:audio.play,config:{...source.config}},model=createModel(ctx),{canvas,controls,dialog,config,balance}=ctx;
  const paint=canvas.getContext('2d');if(!paint)throw Error('reason.gameStart');
  const ui=installFireUI(ctx),view=createView?.(ctx,model),events=new AbortController(),options={signal:events.signal};
  const shared=createControls({root:controls,config:balance.controls});shared.setHanded(true);shared.setEnabled(true);
  const input={},keyboardActions=new Set(),quality={low:false};let disposed=false,paused=false,frame,last,width=0,height=0,dpr=1,samples=0,frameMs=0,refill=false,pointer=null;
  dialog.addEventListener('pointerdown',audio.unlock,options);dialog.addEventListener('keydown',audio.unlock,options);
  const clear=()=>{shared.reset();keyboardActions.clear();refill=false;pointer=null;for(const key of Object.keys(input))delete input[key];};
  ui.refill.addEventListener('pointerdown',event=>{if(paused)return;event.preventDefault();refill=true;ui.refill.setPointerCapture(event.pointerId);},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])ui.refill.addEventListener(type,()=>refill=false,options);
  ui.refill.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();refill=true;}},options);
  ui.refill.addEventListener('keyup',()=>refill=false,options);
  for(const [button,action]of [[ui.spray,'fire'],[ui.ladder,'rescue']]){button.addEventListener('keydown',event=>{if(!paused&&[' ','Enter'].includes(event.key)){event.preventDefault();keyboardActions.add(action);}},options);button.addEventListener('keyup',()=>keyboardActions.delete(action),options);button.addEventListener('blur',()=>keyboardActions.delete(action),options);}
  ui.finish.addEventListener('click',()=>{if(!paused&&model.firesOut)input.finish=true;},options);
  function aim(event){const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/width*config.width,y=(event.clientY-rect.top)/height*config.height,p=view?.targetAt(x,y)||drawFireCity.targetAt(x,y,model,ctx);input.x=p.x;input.y=p.y;}
  canvas.addEventListener('pointerdown',event=>{if(paused)return;event.preventDefault();pointer=event.pointerId;canvas.setPointerCapture(pointer);aim(event);},options);
  canvas.addEventListener('pointermove',event=>{if(event.pointerId===pointer)aim(event);},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{if(event.pointerId===pointer)pointer=null;},options);
  for(const type of ['contextmenu','selectstart','dragstart'])dialog.addEventListener(type,event=>event.preventDefault(),options);
  window.addEventListener('blur',clear,options);document.addEventListener('visibilitychange',()=>{clear();last=undefined;},options);
  function resize(){if(disposed)return;const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;config.width=width;config.height=height;dpr=Math.min(globalThis.devicePixelRatio||1,quality.low?config.lowDpr:config.maxDpr);canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));view?.resize(width,height);}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const session={
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);events.abort();observer.disconnect();shared.dispose();audio.dispose();view?.dispose();ui.dispose();canvas.width=canvas.height=0;},
    cancel:ctx.cancel,
    setPaused(value){paused=Boolean(value);audio.setPaused(paused);shared.setEnabled(!paused);clear();last=undefined;},
    get snapshot(){const s=model.snapshot(),project=(x,y)=>view?.mode==='three'?view.projectTarget(x,y):drawFireCity.project(x,y,model,ctx);const truckScreen=()=>view?.mode==='three'?view.truckScreen():drawFireCity.projectWorld(model.truck,model,ctx);return {...s,indicators:fireIndicators(model,ctx,project,truckScreen),audio:audio.snapshot(),paused,viewport:{scale:width/config.width,scaleY:height/config.height,offsetX:0,offsetY:0,width:config.width,height:config.height,modelWidth:config.width,modelHeight:config.height},flameScreens:model.flames.map(f=>({...project(f.x,f.y),heat:f.heat,active:f.active})),rescueScreens:model.rescues.map(r=>({...project(r.x,r.y),rescued:r.rescued,expired:r.expired})),truckScreen:view?.mode==='three'?view.truckScreen():drawFireCity.projectWorld(model.truck,model,ctx),aimScreen:project(model.aim.x,model.aim.y),impactScreen:project(model.impact.x,model.impact.y),renderMode:view?.mode||'canvas',renderMetrics:view?.metrics(),ui:{textFree:true}};}
  };
  if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,view,audio};
  function tick(now){
    if(disposed)return;
    const elapsed=last===undefined?0:now-last,dt=paused||document.hidden?0:Math.min(config.maxFrameSeconds,elapsed/1000);last=now;
    if(dt>0){samples++;frameMs+=elapsed;if(samples>=balance.render.fallbackSampleFrames){if(frameMs/samples>balance.render.fallbackFrameMs){if(!quality.low){quality.low=true;view?.degrade();resize();}else view?.degrade(true);}samples=frameMs=0;}}
    try{
      const sample=shared.sample();const movement=view?.mode==='three'?view.movementAt(sample.moveX,sample.moveZ):{moveX:sample.moveX,moveZ:sample.moveZ};input.moveX=movement.moveX;input.moveZ=movement.moveZ;input.firing=sample.kickHeld||keyboardActions.has('fire');input.rescue=sample.passHeld||keyboardActions.has('rescue');input.refill=refill;input.charge=!input.firing&&!input.rescue&&model.pressure<model.maxPressure; // pump handles idle pressure automatically
      if(input.rescue){const r=model.ladder.target;if(r){input.x=r.x;input.y=r.y;}}
      else if(input.firing){
        if(sample.kickAim.manual){input.x=model.nozzle.x+sample.kickAim.x*model.range;input.y=model.nozzle.y+sample.kickAim.z*model.range;}
        else if(pointer===null){const f=model.flames.filter(f=>f.active&&f.heat>0).sort((a,b)=>Math.hypot(a.x-model.nozzle.x,a.y-model.nozzle.y)-Math.hypot(b.x-model.nozzle.x,b.y-model.nozzle.y))[0];if(f){input.x=f.x;input.y=f.y;}}
      }
      if(!paused&&!document.hidden)model.update(dt,input);
      audio.update(model,balance);
      if(model.result){const result=ctx.finish(model.result);if(!result.ok){ctx.cancel();ctx.onError?.(result.reason);}return;}
      paint.setTransform(dpr,0,0,dpr,0,0);paint.scale(width/config.width,height/config.height);
      if(!view?.draw(paint))drawFireCity(paint,model,ctx);
      updateFireUI(ui,model,balance);frame=requestAnimationFrame(tick);
    }catch(error){ctx.cancel();ctx.onError?.('reason.gameStart');if(new URLSearchParams(location.search).get('dev')==='1')console.error(error);}
  }
  frame=requestAnimationFrame(tick);return session;
}
