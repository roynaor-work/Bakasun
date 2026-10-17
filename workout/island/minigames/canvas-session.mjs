import {createControls} from './controls.mjs?v=g6b-20261019-1';
import {upgradeCard} from './icons.mjs?v=g6b-20261019-1';
import {loadOptionalArt} from './model-art.mjs?v=g6b-20261019-1';
import {createGameArt} from './art.mjs?v=g6b-20261019-1';
import {fitGameViewport,gamePlayArea} from '../ui/game-shell.mjs?v=g6b-20261019-1';
/** Owns one canvas, frame, observer and abortable listeners for one session. */
export function runCanvasGame(ctx, createModel, draw, createView) {
  // Each adapter keeps its model coordinates; viewport changes never mutate shared game data.
  ctx={...ctx,config:{...ctx.config}};
  const { canvas, controls, status, config, t } = ctx;
  const model = createModel(ctx);
  const paint = canvas.getContext('2d');
  if (!paint) throw new Error('reason.gameStart');
  const quality={low:false};
  const art=createGameArt(ctx.gameId,config,ctx.balance);
  art.hudFont=config.visuals.hudFont;art.fleetLabel=t('minigame.fleet');art.enemyFleetLabel=t('minigame.enemyFleet');if(ctx.gameId==='navalDuel')art.enemyNames=model.enemies.map(e=>t(e.boss?'naval.boss':ctx.balance.shipTypes[e.kind].name));
  const view=createView?.(ctx,model);
  const renderContext={...ctx,art,quality,view};
  const gesture={x:0,y:0,angle:0,yaw:0};
  const naval=ctx.gameId==='navalDuel';let sharedControls,previousKick=false,heatFill;let stickPointer=null,stickOrigin;const stick=controls.querySelector('.naval-stick'),knob=controls.querySelector('.naval-knob');
  let qualitySamples=0,qualityMs=0,queuedSpread=false;
  const events = new AbortController(), options = { signal: events.signal };
  const input = { x: undefined, y: undefined, firing: false, nova:false,ammo:false,charge:false,refill:false,left: false, right: false, angle:ctx.balance.defaultAngle, yaw:ctx.balance.controls?.defaultYaw, power:ctx.balance.defaultPower,moveX:0,moveZ:0,yaw:0,elevation:ctx.balance.aim?.defaultElevation,angularAim:naval };
  const pointers = new Map(), keys = new Set();
  let frame, last, disposed = false, observer, scale = 1, scaleY = 1, offsetX = 0, offsetY = 0, statusTime=0, samples=0, totalFrameMs=0, lowQuality=false, paused=false, queuedFire=false, queuedNova=false, queuedAmmo=false, heldFire=false, cssWidth=0,cssHeight=0,pixelRatio=1;
  if(ctx.gameId==='alienDefense')void loadOptionalArt(art,ctx.balance,()=>disposed);
  const clearInput = () => {sharedControls?.reset();previousKick=false;input.moveX=input.moveZ=0;stickPointer=null;if(stick)stick.hidden=true; pointers.clear(); keys.clear(); queuedNova=queuedAmmo=queuedFire=heldFire=input.firing=input.left=input.right=input.nova=input.ammo=input.charge=input.refill=input.rescue=input.spread=queuedSpread=false;input.x=input.y=input.truckX=input.truckZ=input.targetX=input.targetZ=input.ammoIndex=undefined; };
  function syncInput() {
    input.charge=keys.has('charge');input.refill=keys.has('refill');input.rescue=keys.has('rescue');
    input.left = keys.has('ArrowLeft')||keys.has('left');input.right = keys.has('ArrowRight')||keys.has('right');heldFire=keys.has('fire');
    for(const value of pointers.values()){input.left||=value==='left';input.right||=value==='right';heldFire||=value==='fire'||(!naval&&value==='canvas');input.charge||=value==='charge';input.refill||=value==='refill';}
    if(input.left||input.right)input.x=undefined;
    for(const value of pointers.values())input.rescue||=value==='rescue';
    input.firing=heldFire;
  }
  function position(event,start=false) {
    const box = canvas.getBoundingClientRect();
    const x=Math.max(0,Math.min(config.width,(event.clientX-box.left-offsetX)/scale)),y=Math.max(0,Math.min(config.height,(event.clientY-box.top-offsetY)/scaleY));
    if(ctx.gameId==='fireRescue'){
      const b=ctx.balance,truckX=b.crew.truckX+(model.truck.x-b.vehicle.x)/b.render.worldScale,truckY=b.crew.truckY+(model.truck.z-b.vehicle.z)/b.render.worldScale;
      if(start&&(view?.isTruckAt?.(x,y)??(Math.abs(x-truckX)<70&&Math.abs(y-truckY)<45))){pointers.set(event.pointerId,'vehicle');queuedFire=false;}
      if(pointers.get(event.pointerId)==='vehicle'){const target=view?.truckTargetAt?.(x,y)||{x:b.vehicle.x+(x-b.crew.truckX)*b.render.worldScale,z:b.vehicle.z+(y-b.crew.truckY)*b.render.worldScale};input.truckX=target.x;input.truckZ=target.z;return;}
    }
    if(naval){if(start){gesture.x=event.clientX;gesture.y=event.clientY;gesture.yaw=input.yaw;gesture.elevation=input.elevation;}input.yaw=gesture.yaw+(event.clientX-gesture.x)*ctx.balance.controls.dragDegreesPerPixel*Math.PI/180;input.elevation=gesture.elevation-(event.clientY-gesture.y)*ctx.balance.controls.dragDegreesPerPixel;return;}
    input.x=x;input.y=y;
    applyCanvasGesture(input,ctx.gameId,gesture,ctx.balance,start);
    if(['fireRescue','alienDefense'].includes(ctx.gameId)){const point=view?.targetAt?.(input.x,input.y);if(point){input.x=point.x;input.y=point.y;}}
    if(naval){const point=view?.targetAt?.(input.x,input.y)||model.targetAt(input.x,input.y);input.targetX=point.x;input.targetZ=point.z;}
    if(naval){const slider=controls.querySelector('[data-game-input=angle]');if(slider)slider.value=input.angle;}
  }
  function resize() {
    if(disposed)return;
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, lowQuality?config.lowDpr:config.maxDpr);
    cssWidth=box.width;cssHeight=box.height;pixelRatio=dpr;
    const width=Math.max(1,Math.round(box.width*dpr)),height=Math.max(1,Math.round(box.height*dpr));
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    if(naval){scaleY=1;config.width=cssWidth;config.height=cssHeight;scale=1;offsetX=offsetY=0;view?.resize();return;}
    if(['alienDefense','fireRescue'].includes(ctx.gameId)){scale=cssWidth/config.width;scaleY=cssHeight/config.height;offsetX=offsetY=0;view?.resize?.(cssWidth,cssHeight);return;}
    const area=gamePlayArea(canvas,ctx.dialog,controls),fit=fitGameViewport(area.width,area.height,config.width,config.height);
    scale=scaleY=fit.scale;offsetX=area.x+fit.offsetX;offsetY=area.y+fit.offsetY;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); events.abort(); observer?.disconnect();
    for (const id of pointers.keys()) {
      for (const node of [canvas,...controls.querySelectorAll('button')]) if (node.hasPointerCapture?.(id)) node.releasePointerCapture(id);
    }
    sharedControls?.dispose();view?.dispose();
    clearInput(); input.rescue=false;canvas.width = canvas.height = 0;
    for(const value of Object.values(art)){
      if(value?.getContext)value.width=value.height=0;
      else if(Array.isArray(value))for(const sprite of value)if(sprite?.getContext)sprite.width=sprite.height=0;
    }
  }
  try {
    if(naval){sharedControls=createControls({root:controls,config:ctx.balance.controls});sharedControls.setHanded(true);sharedControls.setEnabled(true);const heat=document.createElement('div');heat.className='naval-heat';heatFill=document.createElement('span');heat.append(heatFill);controls.append(heat);}
    for(const node of [canvas,controls,ctx.dialog])for(const type of ['contextmenu','selectstart','dragstart'])node.addEventListener(type,event=>event.preventDefault(),options);
    canvas.addEventListener('pointerdown',event=>{
      event.preventDefault(); canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId,'canvas');if(!naval)queuedFire=true;position(event,true);syncInput();
    },options);
    canvas.addEventListener('pointermove',event=>{if(['canvas','vehicle'].includes(pointers.get(event.pointerId)))position(event);},options);
    for (const node of controls.querySelectorAll('[data-game-control]')) {
      node.addEventListener('pointerdown',event=>{
        if(naval&&node.dataset.gameControl==='fire')return;event.preventDefault();node.setPointerCapture(event.pointerId);pointers.set(event.pointerId,node.dataset.gameControl);if(node.dataset.ammoIndex!==undefined)input.ammoIndex=Number(node.dataset.ammoIndex);if(node.dataset.gameControl==='fire'&&!naval)queuedFire=true;if(node.dataset.gameControl==='nova')queuedNova=true;if(node.dataset.gameControl==='spread')queuedSpread=true;if(node.dataset.gameControl==='ammo')queuedAmmo=true;syncInput();
      },options);
    }
    for(const node of controls.querySelectorAll('[data-game-control]'))node.addEventListener('click',event=>{if(event.detail!==0)return;const key=node.dataset.gameControl;if(node.dataset.ammoIndex!==undefined)input.ammoIndex=Number(node.dataset.ammoIndex);if(key==='fire')queuedFire=true;else if(key==='nova')queuedNova=true;else if(key==='spread')queuedSpread=true;else if(key==='ammo')queuedAmmo=true;else if(key==='refill'||key==='charge'||key==='rescue')input[key]=!input[key];},options);
    for(const node of controls.querySelectorAll('[data-angle-step]'))node.addEventListener('click',()=>{const axis=node.dataset.angleAxis;if(axis==='angle'&&model.ammoIndex===2)return;const slider=controls.querySelector(`[data-game-input=${axis}]`);input[axis]=Math.max(Number(slider.min),Math.min(Number(slider.max),input[axis]+Number(node.dataset.angleStep)));slider.value=input[axis];},options);
    for(const node of controls.querySelectorAll('[data-game-input]'))node.addEventListener('input',()=>{input[node.dataset.gameInput]=Number(node.value);},options);
    for (const type of ['pointerup','pointercancel','lostpointercapture']) window.addEventListener(type,event=>{pointers.delete(event.pointerId);syncInput();},options);
    const key = event => {
      if (!['ArrowLeft','ArrowRight',' ','Enter'].includes(event.key) || (event.target!==canvas&&!event.target.dataset.gameControl)) return;
      event.preventDefault();
      const action=event.key==='ArrowLeft'||event.key==='ArrowRight'?event.key:(event.target.dataset.gameControl||'fire');
      if(event.type==='keydown'){
        keys.add(action);
        if(!event.repeat){if(action==='fire')queuedFire=true;else if(action==='nova')queuedNova=true;else if(action==='ammo')queuedAmmo=true;}
      }else keys.delete(action);
      syncInput();
    };
    ctx.dialog.addEventListener('keydown',key,options);ctx.dialog.addEventListener('keyup',key,options);
    window.addEventListener('blur',clearInput,options);
    document.addEventListener('visibilitychange',()=>{clearInput();last=undefined;},options);
    observer = new ResizeObserver(resize);for(const node of [canvas,controls,status])observer.observe(node);resize();
    function tick(time) {
      if (disposed) return;
      const dt = last === undefined || document.hidden || paused ? 0 : Math.min(config.maxFrameSeconds,(time-last)/1000);
      if(last!==undefined&&!document.hidden&&!paused){samples++;totalFrameMs+=time-last;if(!lowQuality&&samples>=config.qualitySampleFrames&&totalFrameMs/samples>config.slowFrameMs){lowQuality=quality.low=true;view?.degrade();qualitySamples=qualityMs=0;resize();}}
      if(view&&last!==undefined&&!document.hidden&&!paused){qualitySamples++;qualityMs+=time-last;if(qualitySamples>=ctx.balance.render.fallbackSampleFrames){if(qualityMs/qualitySamples>ctx.balance.render.fallbackFrameMs){if(!lowQuality){lowQuality=quality.low=true;view.degrade();resize();}else view.degrade(true);}qualitySamples=qualityMs=0;}}
      last = time;
      try {
        if(naval&&sharedControls){const sample=sharedControls.sample(),released=previousKick&&!sample.kickHeld;previousKick=sample.kickHeld;if(heatFill){heatFill.style.width=`${model.heat*100}%`;heatFill.parentNode.dataset.overheated=String(model.overheated);}input.moveX=sample.moveX;input.moveZ=sample.moveZ;input.angularAim=false;queuedFire=released;heldFire=model.ammoIndex===4&&sample.kickHeld;input.autoAim=!sample.kickAim.manual;input.assistAim=sample.kickAim.manual;if(sample.kickAim.manual){const range=ctx.balance.aim.minRange+sample.kickAim.height*ctx.balance.aim.rangePerDegree*ctx.balance.aim.maxElevation;input.targetX=model.playerShip.x-sample.kickAim.z*range;input.targetZ=model.playerShip.z+sample.kickAim.x*range;}else{input.targetX=input.targetZ=undefined;}}
        input.firing=heldFire||queuedFire;input.nova=queuedNova;input.spread=queuedSpread;input.ammo=queuedAmmo;if(!paused&&!document.hidden)model.update(dt,input);if(naval&&input.ammoIndex!==undefined)input.ammoIndex=model.ammoIndex;if(dt>0)queuedFire=queuedNova=queuedAmmo=queuedSpread=false;
        if (model.result) {
          const finished = ctx.finish(model.result);
          if (!finished.ok) { ctx.cancel();ctx.onError?.(finished.reason); }
          return;
        }
        paint.setTransform(pixelRatio,0,0,pixelRatio,0,0);paint.fillStyle=config.letterboxColor;paint.fillRect(0,0,cssWidth,cssHeight);
        paint.translate(offsetX,offsetY);paint.scale(scale,scaleY);draw(paint,model,renderContext);
        statusTime-=dt;
        if(statusTime<=0){
          let text=t(model.statusId||'minigame.status',model.statusValues?.()||{score:model.score,lives:model.lives,wave:model.wave,waves:model.settings.waves});
          if(ctx.gameId==='alienDefense'){art.clockText=String(Math.ceil(model.remaining));art.comboText='×'+model.combo;}
          if(ctx.gameId==='alienDefense')text+=' · '+t('minigame.waveClock',{seconds:Math.ceil(model.remaining),pattern:t('pattern.'+model.pattern)})+' · '+t('minigame.combo',{combo:model.combo})+' · '+t('minigame.loot',{coins:model.coins,crystals:model.crystals});
          if(model.powerup>=0)text+=' · '+t('minigame.powerupStatus',{name:t('powerup.'+ctx.balance.pickups.kinds[model.powerup]),seconds:Math.ceil(model.powerTime)});
          if(naval)text=t('minigame.aimCircle');
          if(ctx.warning){ctx.warning.hidden=!model.warningId;ctx.warning.textContent=(model.warningIds||[model.warningId]).filter(Boolean).map(id=>t(id)).join(' · ');}
          if(status.textContent!==text)status.textContent=text;
          if(ctx.gauges){ctx.gauges.water.value=model.water/model.maxWater;ctx.gauges.pressure.value=model.pressure/model.maxPressure;}
          if(ctx.novaButton)ctx.novaButton.disabled=model.novaCharges<=0||model.nova.flight>0||model.nova.life>0;
          if(ctx.spreadButton){const active=model.spreadTime>0,wait=Math.max(0,model.spreadCooldown-model.spreadTime);ctx.spreadButton.disabled=!active&&wait>0;ctx.spreadButton.textContent=t(active?'minigame.spreadActive':wait>0?'minigame.spreadWait':'minigame.spreadReady',{seconds:Math.ceil(active?model.spreadTime:wait)});}
          if(ctx.ammoButtons)for(let i=0;i<ctx.ammoButtons.length;i++){const button=ctx.ammoButtons[i],count=model.ammo[i];button.querySelector('.ammo-copy').textContent=String(count);button.setAttribute('aria-label',t('minigame.ammoCount',{ammo:t(ctx.balance.ammo[i].title),count}));button.setAttribute('aria-pressed',String(model.ammoIndex===i));button.disabled=count<=0;}
          if(ctx.upgradePanel){const panel=ctx.upgradePanel;panel.hidden=!model.choosing;if(model.choosing&&panel.dataset.wave!==String(model.wave)){panel.dataset.wave=model.wave;for(let i=0;i<ctx.upgradeButtons.length;i++){const id=model.choices[i],button=ctx.upgradeButtons[i];button.hidden=!id;if(!id)continue;upgradeCard(button,id,t('minigame.upgradeStack',{name:t('runUpgrade.'+id),rank:model.upgrades[id]+1}),t('runUpgrade.'+id+'.hint'));button.onclick=()=>{model.chooseUpgrade(i);clearInput();panel.hidden=true;statusTime=0;};}}}
          if(ctx.ammoButton){const index=model.ammoIndex;ctx.ammoButton.textContent=t('minigame.ammoSwitch',{ammo:t(ctx.balance.ammo[index].title),count:index===0?t('ammo.unlimited'):model.ammo[index]});}
          if(ctx.fleetMeters){ctx.fleetMeters.player.value=model.lives/model.maxLives;ctx.fleetMeters.enemy.value=model.enemyFleetHp/model.maxEnemyFleet;}
          if(naval){const fire=controls.querySelector('[data-game-control=fire]');fire.disabled=model.ammo[model.ammoIndex]<=0;}
          if(ctx.turnLabel)ctx.turnLabel.textContent=t(model.phase==='aim'?'minigame.aimTurn':'minigame.enemyTurn');
          statusTime=config.statusIntervalSeconds;
        }
        frame=requestAnimationFrame(tick);
      } catch { ctx.cancel();ctx.onError?.('reason.gameStart'); }
    }
    frame=requestAnimationFrame(tick);
    const session={ dispose, cancel: ctx.cancel, setPaused(value){paused=Boolean(value);clearInput();last=undefined;},get snapshot() { const snapshot=model.snapshot();snapshot.paused=paused;snapshot.viewport={scale,scaleY,offsetX,offsetY,width:cssWidth/scale,height:cssHeight/scaleY,modelWidth:config.width,modelHeight:config.height};if(naval){snapshot.canvasHeight=config.height;const project=(x,z)=>view?.projectTarget?.(x,z)||model.screenPoint(x,z);snapshot.aimScreen=project(model.aim.x,model.aim.z);snapshot.enemyScreens=model.enemies.filter(e=>e.active&&e.hp>0).map(e=>({index:e.index,...project(e.x,e.z)}));}if(ctx.gameId==='fireRescue'){const project=(x,y)=>view?.projectTarget?.(x,y)||{x,y};snapshot.flameScreens=model.flames.map(f=>({...project(f.x,f.y),active:f.active,heat:f.heat}));snapshot.rescueScreens=model.rescues.map(r=>({...project(r.x,r.y),rescued:r.rescued,expired:r.expired}));snapshot.truckScreen=view?.truckScreen?.()||{x:ctx.balance.crew.truckX+(model.truck.x-ctx.balance.vehicle.x)/ctx.balance.render.worldScale,y:ctx.balance.crew.truckY+(model.truck.z-ctx.balance.vehicle.z)/ctx.balance.render.worldScale};snapshot.aimScreen=project(model.aim.x,model.aim.y);snapshot.impactScreen=project(model.impact.x,model.impact.y);snapshot.renderMode=view?.mode||'canvas';}if(art.modelArt)snapshot.artModels={...art.modelArt};if(view){snapshot.renderMode=view.mode;snapshot.renderMetrics=view.metrics?.();}return snapshot; } };if(new URLSearchParams(location.search).get('dev')==='1')session.debug={model,view};return session;
  } catch(error) {dispose();throw error;}
}

/** Dragging the sea only supplies a target; firing requires the Fire button. */
export function applyCanvasGesture(input,gameId,anchor,balance,start=false){
  if(gameId!=='navalDuel')return;
  input.targetX=input.x;input.targetZ=input.y;
}
