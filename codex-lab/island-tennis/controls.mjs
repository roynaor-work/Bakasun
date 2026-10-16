// One lifecycle for keyboard and pointer input, including cancellation/blur.
export function createControls({canvas, hitButton, getState, config, onGesture = () => {}}) {
  const abort = new AbortController(), signal = abort.signal, keys = new Set();
  let pointer = null, pressed = false, tap = false, targetX, disposed = false;
  const listen = (target,type,fn,options={}) => target.addEventListener(type,fn,{...options,signal});
  function clear() { keys.clear(); pressed = false; tap = false; pointer = null; targetX = undefined; }
  const interactive = e => e.target.closest('button,select,input,dialog,a');
  function down(e) {
    if (e.button !== 0 || pointer || (interactive(e) && e.currentTarget !== hitButton)) return;
    onGesture();
    pointer = {id:e.pointerId,x:e.clientX,y:e.clientY,start:performance.now(),drag:false,lower:e.clientY>=innerHeight/2,base:getState().players[0].x,button:e.currentTarget===hitButton};
    pressed = true; e.currentTarget.setPointerCapture?.(e.pointerId); e.preventDefault();
  }
  function move(e) {
    if (!pointer || e.pointerId!==pointer.id || pointer.button || !pointer.lower) return;
    const dx=e.clientX-pointer.x;
    if(Math.abs(dx)>=config.controls.dragThreshold)pointer.drag=true;
    if(pointer.drag) targetX=pointer.base+dx/canvas.clientWidth*config.court.halfWidth*2*config.controls.dragSensitivity;
    e.preventDefault();
  }
  function up(e) {
    if(!pointer||e.pointerId!==pointer.id)return;
    const serving=getState().phase==='serve'&&getState().server===0;
    if(!pointer.drag&&(serving||pointer.button||(performance.now()-pointer.start)/1000<=config.controls.tapMaxSeconds))tap=true;
    pressed=false;pointer=null;e.preventDefault();
  }
  for(const el of [canvas,hitButton])listen(el,'pointerdown',down,{passive:false});
  listen(window,'pointermove',move,{passive:false});listen(window,'pointerup',up,{passive:false});listen(window,'pointercancel',clear);
  listen(window,'keydown',e=>{
    if(interactive(e)&&e.target!==hitButton)return;
    if(['ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();onGesture();keys.add(e.code);if(e.code==='Space'&&!e.repeat)pressed=true;}
  });
  listen(window,'keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&pressed){tap=true;pressed=false;e.preventDefault();}});
  listen(window,'blur',clear);listen(document,'visibilitychange',clear);
  for(const type of ['contextmenu','selectstart','dragstart'])listen(canvas,type,e=>e.preventDefault());
  // Keyboard activation remains accessible and is separate from pointer release.
  listen(hitButton,'click',e=>{if(e.detail===0&&!keys.has('Space')){onGesture();tap=true;}});
  return {read(){const swing=tap;tap=false;const move=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);if(move)targetX=undefined;return {swing,charge:pressed,move,targetX};},reset:clear,dispose(){if(disposed)return;disposed=true;abort.abort();clear();}};
}
