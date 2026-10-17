/** Pointer activation for ordinary UI buttons. Held game controls and the parent
 * gate retain their own capture/hold lifecycle. Keyboard activation stays native. */
export function installPressFeedback({target=document,onFrame=()=>{},compatibilityClickMs=400,now=()=>performance.now(),scheduleFrame=callback=>requestAnimationFrame(callback)}={}){
  const abort=new AbortController(),options={capture:true,signal:abort.signal},handled=new Set(),pressed=new Map();
  let suppressUntil=-Infinity,keyboardTarget=null,nativeTarget=null;
  target.addEventListener('keydown',event=>{if(event.isTrusted&&['Enter',' '].includes(event.key))keyboardTarget=event.target.closest?.('button');},options);
  target.addEventListener('pointerdown',event=>{
    keyboardTarget=null;nativeTarget=null;
    const node=event.target.closest?.('button');if(!node||node.disabled||node.closest('[inert]')||event.button>0)return;
    node.dataset.pressed='true';pressed.set(event.pointerId,node);
    const started=now();scheduleFrame(()=>onFrame(now()-started,node.dataset.action||node.dataset.gameControl||''));
    // Touch activation exists on release, not pointerdown. Entry/install actions
    // must keep the browser's trusted click so gated APIs can use that activation.
    if(nativeShellAction(node.dataset.action)){nativeTarget=node;return;}
    if(node.matches('[data-game-control],[data-action=parent]')||(!node.onclick&&!node.dataset.action))return;
    event.preventDefault();handled.add(event.pointerId);suppressUntil=now()+compatibilityClickMs;node.click();
  },options);
  for(const type of ['pointerup','pointercancel'])target.addEventListener(type,event=>{
    const node=pressed.get(event.pointerId);if(node)delete node.dataset.pressed;pressed.delete(event.pointerId);
    if(type==='pointercancel'&&node===nativeTarget)nativeTarget=null;
    // Retargeted releases must not invoke a newly exposed control either.
    if(handled.delete(event.pointerId)){
      // A long hold must not outlast the guard before its release/click arrives.
      suppressUntil=Math.max(suppressUntil,now()+compatibilityClickMs);
      if(type==='pointerup'){event.preventDefault();event.stopImmediatePropagation();}
    }
  },options);
  target.addEventListener('click',event=>{
    const keyboard=keyboardTarget&&event.detail===0&&keyboardTarget===event.target.closest?.('button');keyboardTarget=null;
    const native=event.isTrusted&&nativeTarget&&nativeTarget===event.target.closest?.('button');nativeTarget=null;
    // A compatibility click may have a different/missing pointerId or detail=0.
    // Cancellation and earlier clicks cannot consume this time window. Our
    // immediate node.click() is untrusted and still reaches the button once.
    if(event.isTrusted&&!keyboard&&!native&&now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}
  },options);
  return ()=>{abort.abort();for(const node of pressed.values())delete node.dataset.pressed;};
}

export function nativeShellAction(action){return ['stage-play','game-understood','soccer-drill','game-again','game-next-stage','event-play','shell-install'].includes(action);}
