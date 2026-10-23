/** Feedback starts on contact. Actions wait for a release without scrolling. */
export function installPressFeedback({target=document,onFrame=()=>{},compatibilityClickMs=400,now=()=>performance.now(),scheduleFrame=callback=>requestAnimationFrame(callback)}={}){
  const abort=new AbortController(),options={capture:true,signal:abort.signal},pressed=new Map();
  let suppressUntil=-Infinity,keyboardTarget=null,nativeTarget=null;
  const button=event=>event.target.closest?.('button');
  const cancel=()=>{suppressUntil=now()+compatibilityClickMs;nativeTarget=null;};
  target.addEventListener('keydown',event=>{if(event.isTrusted&&['Enter',' '].includes(event.key))keyboardTarget=button(event);},options);
  target.addEventListener('pointerdown',event=>{
    keyboardTarget=nativeTarget=null;const node=button(event);
    if(!node||node.disabled||node.closest('[inert]')||event.button>0)return;
    // A fresh finger is independent of a previous compatibility click.
    suppressUntil=-Infinity;node.dataset.pressed='true';
    const scrollers=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight||parent.scrollWidth>parent.clientWidth)scrollers.push([parent,parent.scrollTop,parent.scrollLeft]);
    pressed.set(event.pointerId,{node,x:event.clientX||0,y:event.clientY||0,moved:false,scrollers,held:node.matches('[data-game-control],[data-action=parent]'),native:nativeShellAction(node.dataset.action)});
    const started=now();scheduleFrame(()=>onFrame(now()-started,node.dataset.action||node.dataset.gameControl||''));
  },options);
  target.addEventListener('pointermove',event=>{const press=pressed.get(event.pointerId);if(press&&Math.hypot((event.clientX||0)-press.x,(event.clientY||0)-press.y)>9){press.moved=true;delete press.node.dataset.pressed;}},options);
  for(const type of ['pointerup','pointercancel'])target.addEventListener(type,event=>{
    const press=pressed.get(event.pointerId);if(!press)return;pressed.delete(event.pointerId);delete press.node.dataset.pressed;
    if(press.held)return;
    const moved=press.moved||Math.hypot((event.clientX||0)-press.x,(event.clientY||0)-press.y)>9||press.scrollers.some(([node,top,left])=>node.scrollTop!==top||node.scrollLeft!==left);
    if(type==='pointercancel'||moved||button(event)!==press.node){cancel();event.preventDefault();event.stopImmediatePropagation();return;}
    if(press.native){nativeTarget=press.node;return;}
    if(!press.node.onclick&&!press.node.dataset.action)return;
    cancel();event.preventDefault();event.stopImmediatePropagation();press.node.click();
  },options);
  target.addEventListener('click',event=>{
    const node=button(event),keyboard=keyboardTarget&&event.detail===0&&keyboardTarget===node;keyboardTarget=null;
    const native=event.isTrusted&&nativeTarget&&nativeTarget===node;nativeTarget=null;
    if(keyboard)return;
    if(native){suppressUntil=now()+compatibilityClickMs;return;}
    if(event.isTrusted&&now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}
  },options);
  return ()=>{abort.abort();for(const {node}of pressed.values())delete node.dataset.pressed;pressed.clear();};
}

export function nativeShellAction(action){return ['stage-play','game-understood','soccer-drill','game-again','game-next-stage','event-play','shell-install'].includes(action);}
