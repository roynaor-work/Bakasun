import {DATA_VERSION} from '../release.mjs?v=island-naval-aim-20261030-1';

/** A local frame preserves the original game's CSS, Three.js and campaign.
 * The island still owns fullscreen, Back, visibility, pause, mute and exit. */
export function runBoarSession(ctx) {
  let disposed=false,paused=false,ready=false,frame,bridge,error=null,timeout,observer;
  const listeners=[];
  const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));};
  const muted=()=>{try{return globalThis.localStorage?.getItem('island.sound')==='off';}catch{return false;}};
  const syncSound=()=>bridge?.setMuted(muted());
  const session={
    setPaused(value){paused=Boolean(value);bridge?.setPaused(paused);syncSound();if(bridge&&!paused)frame.contentWindow?.focus();},
    dispose(){
      if(disposed)return;disposed=true;clearTimeout(timeout);observer?.disconnect();
      for(const remove of listeners)remove();
      try{bridge?.dispose();}catch{}
      if(frame){frame.src='about:blank';frame.remove();}
      ctx.canvas?.removeAttribute('hidden');ctx.controls?.removeAttribute('hidden');
      ctx.dialog?.classList.remove('boar-game-screen');
    },
    get snapshot(){return {ready,paused,disposed,error,campaign:bridge?.snapshot||null};}
  };
  if(!ctx.canvas)return session;
  const doc=ctx.canvas.ownerDocument,stage=ctx.canvas.parentElement;
  frame=doc.createElement('iframe');frame.className='boar-game-frame';
  frame.title='אי החזירים — הגנת החווה';frame.setAttribute('allow','autoplay; fullscreen');
  const url=new URL('./boar-island/index.html',import.meta.url);url.searchParams.set('v',DATA_VERSION);url.searchParams.set('island','1');
  if(new URLSearchParams(globalThis.location?.search).get('dev')==='1')url.searchParams.set('qa','1');
  const failed=()=>{if(disposed)return;error='reason.gameStart';ctx.warning.hidden=false;ctx.warning.textContent=ctx.t('boar.loadError');};
  listen(frame,'load',()=>{
    if(disposed)return;
    bridge=frame.contentWindow?.__boarIsland;
    if(!bridge?.ready){failed();return;}
    clearTimeout(timeout);error=null;ready=true;ctx.warning.hidden=true;
    bridge.onExit=()=>ctx.cancel();
    bridge.onPause=()=>ctx.dialog.querySelector('[data-action=game-pause]')?.click();
    bridge.setPaused(paused);syncSound();if(!paused)frame.contentWindow.focus();
  });
  listen(frame,'error',failed);
  const toggle=ctx.dialog.querySelector('.sound-toggle');
  if(toggle){
    observer=new MutationObserver(syncSound);observer.observe(toggle,{attributes:true,childList:true,subtree:true});
  }
  listen(ctx.dialog,'click',event=>{
    if(['game-sound','game-pause-sound'].includes(event.target.closest('button')?.dataset.action))queueMicrotask(syncSound);
  });
  listen(doc.defaultView,'storage',event=>{if(event.key==='island.sound')syncSound();});
  ctx.dialog.classList.add('boar-game-screen');ctx.canvas.hidden=true;ctx.controls.hidden=true;
  ctx.status.textContent='';frame.src=url.href;stage.append(frame);
  timeout=setTimeout(()=>{if(!ready)failed();},60000);
  return session;
}
