/** Owns one canvas, frame, observer and abortable listeners for one session. */
export function runCanvasGame(ctx, createModel, draw) {
  const { canvas, controls, status, config, t } = ctx;
  const model = createModel(ctx);
  const paint = canvas.getContext('2d');
  if (!paint) throw new Error('reason.gameStart');
  const events = new AbortController(), options = { signal: events.signal };
  const input = { x: config.width / 2, firing: false, left: false, right: false };
  const pointers = new Map(), keys = new Set();
  let frame, last, disposed = false, observer, scale = 1, offsetX = 0, offsetY = 0;
  const clearInput = () => { pointers.clear(); keys.clear(); input.firing = input.left = input.right = false; };
  function syncInput() {
    input.left = keys.has('ArrowLeft') || [...pointers.values()].includes('left');
    input.right = keys.has('ArrowRight') || [...pointers.values()].includes('right');
    input.firing = keys.has(' ') || keys.has('Enter') || [...pointers.values()].some(v=>v==='fire'||v==='canvas');
  }
  function position(event) {
    const box = canvas.getBoundingClientRect();
    input.x = Math.max(0, Math.min(config.width, (event.clientX - box.left - offsetX) / scale));
  }
  function resize() {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, config.maxDpr);
    canvas.width = Math.max(1,Math.round(box.width*dpr)); canvas.height = Math.max(1,Math.round(box.height*dpr));
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
      event.preventDefault(); canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId,'canvas');position(event);syncInput();
    },options);
    canvas.addEventListener('pointermove',event=>{if(pointers.get(event.pointerId)==='canvas')position(event);},options);
    for (const node of controls.querySelectorAll('[data-game-control]')) {
      node.addEventListener('pointerdown',event=>{
        event.preventDefault();node.setPointerCapture(event.pointerId);pointers.set(event.pointerId,node.dataset.gameControl);syncInput();
      },options);
    }
    for (const type of ['pointerup','pointercancel','lostpointercapture']) window.addEventListener(type,event=>{pointers.delete(event.pointerId);syncInput();},options);
    const key = event => {
      if (!['ArrowLeft','ArrowRight',' ','Enter'].includes(event.key) || event.target.dataset.action==='game-exit') return;
      event.preventDefault();
      if(event.type==='keydown') keys.add(event.key); else keys.delete(event.key);
      syncInput();
    };
    ctx.dialog.addEventListener('keydown',key,options);ctx.dialog.addEventListener('keyup',key,options);
    window.addEventListener('blur',clearInput,options);
    document.addEventListener('visibilitychange',()=>{clearInput();last=undefined;},options);
    observer = new ResizeObserver(resize);observer.observe(canvas);resize();
    function tick(time) {
      if (disposed) return;
      const dt = last === undefined || document.hidden ? 0 : Math.min(config.maxFrameSeconds,(time-last)/1000);
      last = time;
      try {
        model.update(dt,input);
        if (model.result) {
          const finished = ctx.finish(model.result);
          if (!finished.ok) { ctx.cancel();ctx.onError?.(finished.reason); }
          return;
        }
        const box=canvas.getBoundingClientRect(), dpr=canvas.width/Math.max(1,box.width);
        paint.setTransform(dpr,0,0,dpr,0,0);paint.fillStyle=config.letterboxColor;paint.fillRect(0,0,box.width,box.height);
        paint.translate(offsetX,offsetY);paint.scale(scale,scale);draw(paint,model,ctx);
        const text=t('minigame.status',{score:model.score,lives:model.lives,wave:model.wave, waves:model.settings.waves});
        if(status.textContent!==text)status.textContent=text;
        frame=requestAnimationFrame(tick);
      } catch { ctx.cancel();ctx.onError?.('reason.gameStart'); }
    }
    frame=requestAnimationFrame(tick);
    return { dispose, cancel: ctx.cancel, get snapshot() { return model.snapshot(); } };
  } catch(error) {dispose();throw error;}
}
