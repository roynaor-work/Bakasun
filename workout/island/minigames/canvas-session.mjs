/** Owns one canvas, frame, observer and abortable listeners for one session. */
export function runCanvasGame(ctx, createModel, draw) {
  const { canvas, controls, status, config, t } = ctx;
  const model = createModel(ctx);
  const paint = canvas.getContext('2d');
  if (!paint) throw new Error('reason.gameStart');
  const events = new AbortController(), options = { signal: events.signal };
  const input = { x: undefined, y: undefined, firing: false, left: false, right: false, angle:ctx.balance.defaultAngle, power:ctx.balance.defaultPower };
  const pointers = new Map(), keys = new Set();
  let frame, last, disposed = false, observer, scale = 1, offsetX = 0, offsetY = 0, statusTime=0, samples=0, totalFrameMs=0, lowQuality=false, paused=false, queuedFire=false, heldFire=false, cssWidth=0,cssHeight=0,pixelRatio=1;
  const clearInput = () => { pointers.clear(); keys.clear(); queuedFire=heldFire=input.firing = input.left = input.right = false; };
  function syncInput() {
    input.left = keys.has('ArrowLeft');input.right = keys.has('ArrowRight');heldFire=keys.has(' ')||keys.has('Enter');
    for(const value of pointers.values()){input.left||=value==='left';input.right||=value==='right';heldFire||=value==='fire'||value==='canvas';}
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
  }
  try {
    canvas.addEventListener('pointerdown',event=>{
      event.preventDefault(); canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId,'canvas');queuedFire=true;position(event);syncInput();
    },options);
    canvas.addEventListener('pointermove',event=>{if(pointers.get(event.pointerId)==='canvas')position(event);},options);
    for (const node of controls.querySelectorAll('[data-game-control]')) {
      node.addEventListener('pointerdown',event=>{
        event.preventDefault();node.setPointerCapture(event.pointerId);pointers.set(event.pointerId,node.dataset.gameControl);if(node.dataset.gameControl==='fire')queuedFire=true;syncInput();
      },options);
    }
    for(const node of controls.querySelectorAll('[data-game-input]'))node.addEventListener('input',()=>{input[node.dataset.gameInput]=Number(node.value);},options);
    for (const type of ['pointerup','pointercancel','lostpointercapture']) window.addEventListener(type,event=>{pointers.delete(event.pointerId);syncInput();},options);
    const key = event => {
      if (!['ArrowLeft','ArrowRight',' ','Enter'].includes(event.key) || (event.target!==canvas&&!event.target.dataset.gameControl)) return;
      event.preventDefault();
      if(event.type==='keydown') {keys.add(event.key);if(event.key===' '||event.key==='Enter')queuedFire=true;} else keys.delete(event.key);
      syncInput();
    };
    ctx.dialog.addEventListener('keydown',key,options);ctx.dialog.addEventListener('keyup',key,options);
    window.addEventListener('blur',clearInput,options);
    document.addEventListener('visibilitychange',()=>{clearInput();last=undefined;},options);
    observer = new ResizeObserver(resize);observer.observe(canvas);resize();
    function tick(time) {
      if (disposed) return;
      const dt = last === undefined || document.hidden || paused ? 0 : Math.min(config.maxFrameSeconds,(time-last)/1000);
      if(last!==undefined&&!document.hidden){samples++;totalFrameMs+=time-last;if(!lowQuality&&samples>=config.qualitySampleFrames&&totalFrameMs/samples>config.slowFrameMs){lowQuality=true;resize();}}
      last = time;
      try {
        input.firing=heldFire||queuedFire;model.update(dt,input);if(dt>0)queuedFire=false;
        if (model.result) {
          const finished = ctx.finish(model.result);
          if (!finished.ok) { ctx.cancel();ctx.onError?.(finished.reason); }
          return;
        }
        paint.setTransform(pixelRatio,0,0,pixelRatio,0,0);paint.fillStyle=config.letterboxColor;paint.fillRect(0,0,cssWidth,cssHeight);
        paint.translate(offsetX,offsetY);paint.scale(scale,scale);draw(paint,model,ctx);
        statusTime-=dt;
        if(statusTime<=0){
          const text=t(model.statusId||'minigame.status',model.statusValues?.()||{score:model.score,lives:model.lives,wave:model.wave,waves:model.settings.waves});
          if(status.textContent!==text)status.textContent=text;
          if(ctx.gauges){ctx.gauges.water.value=model.water/model.maxWater;ctx.gauges.pressure.value=model.pressure;}
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
