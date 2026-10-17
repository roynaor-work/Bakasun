/** Pointer activation for ordinary UI buttons. Held game controls and the parent
 * gate retain their own capture/hold lifecycle. Keyboard activation stays native. */
export function installPressFeedback({target=document,onFrame=()=>{}}={}){
  const abort=new AbortController(),options={capture:true,signal:abort.signal},handled=new Set(),pressed=new Map();
  let suppress=false;
  target.addEventListener('pointerdown',event=>{
    const node=event.target.closest?.('button');if(!node||node.disabled||node.closest('[inert]')||event.button>0)return;
    node.dataset.pressed='true';pressed.set(event.pointerId,node);
    const started=performance.now();requestAnimationFrame(()=>onFrame(performance.now()-started,node.dataset.action||node.dataset.gameControl||''));
    if(node.matches('[data-game-control],[data-action=parent]')||(!node.onclick&&!node.dataset.action))return;
    event.preventDefault();handled.add(event.pointerId);suppress=true;node.click();
  },options);
  for(const type of ['pointerup','pointercancel'])target.addEventListener(type,event=>{
    const node=pressed.get(event.pointerId);if(node)delete node.dataset.pressed;pressed.delete(event.pointerId);
    if(type==='pointercancel'){handled.delete(event.pointerId);suppress=false;}
  },options);
  target.addEventListener('click',event=>{
    if(event.isTrusted&&event.detail>0&&(handled.has(event.pointerId)||suppress)){event.preventDefault();event.stopImmediatePropagation();handled.delete(event.pointerId);suppress=false;}
  },options);
  return ()=>{abort.abort();for(const node of pressed.values())delete node.dataset.pressed;};
}
