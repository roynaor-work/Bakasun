import {createGameArt} from './art.mjs';
/** Owns one canvas, frame, observer and abortable listeners for one session. */
export function runCanvasGame(ctx, createModel, draw) {
  const { canvas, controls, status, config, t } = ctx;
  const model = createModel(ctx);
  const paint = canvas.getContext('2d');
  if (!paint) throw new Error('reason.gameStart');
  const quality={low:false};
  const art=createGameArt(ctx.gameId,config,ctx.balance);
  art.hudFont=config.visuals.hudFont;art.fleetLabel=t('minigame.fleet');art.enemyFleetLabel=t('minigame.enemyFleet');
  const renderContext={...ctx,art,quality};
  const events = new AbortController(), options = { signal: events.signal };
  const input = { x: undefined, y: undefined, firing: false, nova:false,ammo:false,charge:false,refill:false,left: false, right: false, angle:ctx.balance.defaultAngle, power:ctx.balance.defaultPower };
  const pointers = new Map(), keys = new Set();
  let frame, last, disposed = false, observer, scale = 1, offsetX = 0, offsetY = 0, statusTime=0, samples=0, totalFrameMs=0, lowQuality=false, paused=false, queuedFire=false, queuedNova=false, queuedAmmo=false, heldFire=false, cssWidth=0,cssHeight=0,pixelRatio=1;
  const clearInput = () => { pointers.clear(); keys.clear(); queuedNova=queuedAmmo=queuedFire=heldFire=input.firing=input.left=input.right=input.nova=input.ammo=input.charge=keys.has('charge');input.refill=keys.has('refill'); };
  function syncInput() {
    input.charge=keys.has('charge');input.refill=keys.has('refill');
    input.left = keys.has('ArrowLeft')||keys.has('left');input.right = keys.has('ArrowRight')||keys.has('right');heldFire=keys.has('fire');
    for(const value of pointers.values()){input.left||=value==='left';input.right||=value==='right';heldFire||=value==='fire'||value==='canvas';input.charge||=value==='charge';input.refill||=value==='refill';}
    if(input.left||input.right)input.x=undefined;
    input.firing=heldFire;
  }
  function position(event) {
    const box = canvas.getBoundingClientRect();
    input.x = Math.max(0, Math.min(config.width, (event.clientX - box.left - offsetX) / scale));
    input.y = Math.max(0, Math.min(config.height, (event.clientY - box.top - offsetY) / scale));
  }
  function resize() {
    if(disposed)return;
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, lowQuality?config.lowDpr:config.maxDpr);
    cssWidth=box.width;cssHeight=box.height;pixelRatio=dpr;
    const width=Math.max(1,Math.round(box.width*dpr)),height=Math.max(1,Math.round(box.height*dpr));
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    scale = Math.min(box.width/config.width,box.height/config.height);
    offsetX = (box.width-config.width*scale)/2; offsetY = (box.height-config.height*scale)/2;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); events.abort(); observer?.disconnect();
    for (const id of pointers.keys()) {
      for (const node of [canvas,...controls.querySelectorAll('button')]) if (node.hasPointerCapture?.(id)) node.releasePointerCapture(id);
    }
    clearInput(); canvas.width = canvas.height = 0;
    for(const value of Object.values(art)){
      if(value?.getContext)value.width=value.height=0;
      else if(Array.isArray(value))for(const sprite of value)sprite.width=sprite.height=0;
    }
  }
  try {
    canvas.addEventListener('pointerdown',event=>{
      event.preventDefault(); canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId,'canvas');queuedFire=true;position(event);syncInput();
    },options);
    canvas.addEventListener('pointermove',event=>{if(pointers.get(event.pointerId)==='canvas')position(event);},options);
    for (const node of controls.querySelectorAll('[data-game-control]')) {
      node.addEventListener('pointerdown',event=>{
        event.preventDefault();node.setPointerCapture(event.pointerId);pointers.set(event.pointerId,node.dataset.gameControl);if(node.dataset.gameControl==='fire')queuedFire=true;if(node.dataset.gameControl==='nova')queuedNova=true;if(node.dataset.gameControl==='ammo')queuedAmmo=true;syncInput();
      },options);
    }
    for(const node of controls.querySelectorAll('[data-game-control]'))node.addEventListener('click',event=>{if(event.detail!==0)return;const key=node.dataset.gameControl;if(key==='nova')queuedNova=true;else if(key==='ammo')queuedAmmo=true;else if(key==='refill'||key==='charge')input[key]=!input[key];},options);
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
    observer = new ResizeObserver(resize);observer.observe(canvas);resize();
    function tick(time) {
      if (disposed) return;
      const dt = last === undefined || document.hidden || paused ? 0 : Math.min(config.maxFrameSeconds,(time-last)/1000);
      if(last!==undefined&&!document.hidden){samples++;totalFrameMs+=time-last;if(!lowQuality&&samples>=config.qualitySampleFrames&&totalFrameMs/samples>config.slowFrameMs){lowQuality=quality.low=true;resize();}}
      last = time;
      try {
        input.firing=heldFire||queuedFire;input.nova=queuedNova;input.ammo=queuedAmmo;model.update(dt,input);if(dt>0)queuedFire=queuedNova=queuedAmmo=false;
        if (model.result) {
          const finished = ctx.finish(model.result);
          if (!finished.ok) { ctx.cancel();ctx.onError?.(finished.reason); }
          return;
        }
        paint.setTransform(pixelRatio,0,0,pixelRatio,0,0);paint.fillStyle=config.letterboxColor;paint.fillRect(0,0,cssWidth,cssHeight);
        paint.translate(offsetX,offsetY);paint.scale(scale,scale);draw(paint,model,renderContext);
        statusTime-=dt;
        if(statusTime<=0){
          let text=t(model.statusId||'minigame.status',model.statusValues?.()||{score:model.score,lives:model.lives,wave:model.wave,waves:model.settings.waves});
          if(model.powerup>=0)text+=' · '+t('minigame.powerupStatus',{name:t('powerup.'+ctx.balance.pickups.kinds[model.powerup]),seconds:Math.ceil(model.powerTime)});
          if(status.textContent!==text)status.textContent=text;
          if(ctx.gauges){ctx.gauges.water.value=model.water/model.maxWater;ctx.gauges.pressure.value=model.pressure/model.maxPressure;}
          if(ctx.novaButton)ctx.novaButton.disabled=model.novaCharges<=0||model.nova.flight>0||model.nova.life>0;
          if(ctx.ammoButton){const index=model.ammoIndex;ctx.ammoButton.textContent=t('minigame.ammoSwitch',{ammo:t(ctx.balance.ammo[index].title),count:index===0?t('ammo.unlimited'):model.ammo[index]});}
          if(ctx.fleetMeters){ctx.fleetMeters.player.value=model.lives/model.maxLives;ctx.fleetMeters.enemy.value=model.enemyFleetHp/model.maxEnemyFleet;}
          if(ctx.turnLabel)ctx.turnLabel.textContent=t(model.phase==='aim'?'minigame.aimTurn':'minigame.enemyTurn');
          statusTime=config.statusIntervalSeconds;
        }
        frame=requestAnimationFrame(tick);
      } catch { ctx.cancel();ctx.onError?.('reason.gameStart'); }
    }
    frame=requestAnimationFrame(tick);
    return { dispose, cancel: ctx.cancel, setPaused(value){paused=value;clearInput();last=undefined;},get snapshot() { return model.snapshot(); } };
  } catch(error) {dispose();throw error;}
}
