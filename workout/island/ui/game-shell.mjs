import {nativeShellAction} from './press.mjs?v=island-c2-20261025-1';

const entries=new WeakMap();
export function installedShell(target=window){
  return Boolean(target.navigator.standalone||['standalone','minimal-ui'].some(mode=>target.matchMedia(`(display-mode: ${mode})`).matches)||(!target.document?.fullscreenElement&&target.matchMedia('(display-mode: fullscreen)').matches));
}

/** Called synchronously by a trusted entry click, before any game loading. The
 * document stays fullscreen when a game dialog is replaced or closed. */
export class FullscreenEntry {
  constructor({doc=document,target=window}={}){Object.assign(this,{doc,target});this.ready=Promise.resolve();}
  enter(){
    const {doc,target}=this;
    if(this.requesting||doc.fullscreenElement||installedShell(target))return this.ready;
    if(!doc.documentElement.requestFullscreen)return this.ready;
    this.requesting=true;
    let request;try{request=doc.documentElement.requestFullscreen({navigationUI:'hide'});}catch{request=Promise.reject();}
    this.ready=Promise.resolve(request).catch(()=>{}).then(()=>{
      this.requesting=false;
      if(doc.fullscreenElement){try{void target.screen.orientation?.lock?.('landscape')?.catch(()=>{});}catch{}}
    });
    return this.ready;
  }
}

const paths={install:'M12 3v12m-4-4 4 4 4-4M5 15v6h14v-6',play:'m9 5 11 7-11 7Z',exit:'M10 4H4v16h6m4-13 5 5-5 5m-5-5h14',sound:'m4 10 5-5v14l-5-5H1v-4Zm10-3a7 7 0 0 1 0 10',muted:'m4 10 5-5v14l-5-5H1v-4Zm10-2 7 8m0-8-7 8',pause:'M8 5v14M16 5v14',close:'m6 6 12 12M18 6 6 18'};
function shellIcon(name){const template=document.createElement('template');template.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';const svg=template.content.firstChild;svg.firstChild.setAttribute('d',paths[name]);return svg;}
function iconButton(action,label,icon){const b=document.createElement('button');b.type='button';b.className='secondary-button shell-icon';b.dataset.action=action;b.title=label;b.setAttribute('aria-label',label);b.append(shellIcon(icon));return b;}

/** Wire the existing adapters at the application boundary, without changing any
 * game. A programmatic/event launch may count down, but cannot request fullscreen. */
export function installGameShell({games,ui,t,countdownStepMs}){
  const entry=new FullscreenEntry(),abort=new AbortController(),options={capture:true,signal:abort.signal};
  entry.countdownStepMs=countdownStepMs;entries.set(document,entry);
  let entryGesture=null,prompt=null,appInstalled=false;
  document.addEventListener('click',event=>{entryGesture=event.isTrusted&&nativeShellAction(event.target.closest?.('button')?.dataset.action)?event:null;},options);
  const launch=games.launch;
  games.launch=function(...args){if(entryGesture?.eventPhase)entry.enter();return launch.apply(this,args);};
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;}, {signal:abort.signal});
  window.addEventListener('appinstalled',()=>{prompt=null;appInstalled=true;for(const b of ui.modalRoot.querySelectorAll('[data-action=shell-install]'))b.remove();},{signal:abort.signal});
  const help=modal=>{
    if(modal.querySelector('.shell-install-help'))return;
    const card=document.createElement('section');card.className='shell-install-help';card.setAttribute('aria-label',t('shell.install'));
    const image=document.createElement('img');image.src=new URL('../assets/icons/shell-share.svg',import.meta.url).href;image.alt=t('shell.shareImage');
    const text=document.createElement('p'),ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);text.textContent=t(ios?'shell.installIOS':'shell.installMenu');
    const close=iconButton('shell-install-close',t('shell.close'),'close');close.onclick=()=>{card.remove();modal.querySelector('[data-action=shell-install]')?.focus();};card.append(image,text,close);modal.append(card);close.focus();
  };
  const decorate=()=>{
    for(const modal of ui.modalRoot.querySelectorAll('.modal')){
      if(modal.classList.contains('game-screen'))continue;
      if(!modal.querySelector('[data-action=stage-play],[data-action=game-understood],[data-action=soccer-drill],.parent-controls'))continue;
      if(appInstalled||installedShell()||modal.querySelector('[data-action=shell-install]'))continue;
      const b=iconButton('shell-install',t('shell.install'),'install');
      b.onclick=async()=>{if(prompt){const saved=prompt;prompt=null;try{await saved.prompt();await saved.userChoice;}catch{help(modal);}}else help(modal);};const close=modal.querySelector('[data-action=close-modal]');if(close)close.after(b);else modal.prepend(b);
    }
  };
  const observer=new MutationObserver(decorate);observer.observe(ui.modalRoot,{childList:true,subtree:true});decorate();
  return ()=>{abort.abort();observer.disconnect();games.launch=launch;entries.delete(document);};
}

/** Own only two entries: map -> games -> active game. Back reuses the guard via
 * forward(), and closing traverses to the map; the next entry truncates forward history. */
export class GameNavigation {
  constructor({target=window,onGameBack=()=>{},onMenuBack=()=>{},onMapBack}={}) {
    Object.assign(this,{target,onGameBack,onMenuBack,onMapBack});this.history=target.history;this.mapGuard=Boolean(onMapBack);
    const marker=this.history.state?.islandShell;
    this.owner=marker?.owner||`island-${Date.now()}-${Math.random()}`;
    this.depth=marker?.depth||0;this.desired=0;this.traversing=false;
    if(!marker||this.mapGuard&&!marker.mapGuard){
      this.depth=this.mapGuard?-1:0;
      this.history.replaceState({...this.history.state,islandShell:{owner:this.owner,depth:this.depth,mapGuard:this.mapGuard}},'');
    }
    this.listener=event=>this.pop(event);target.addEventListener('popstate',this.listener);
    this.reconcile();
  }
  menu(){this.desired=1;this.reconcile();}
  game(){this.desired=2;this.reconcile();}
  leave(){this.desired=0;this.reconcile();}
  stayOnMap(){if(!this.mapQuestion||this.exiting)return;this.mapQuestion=false;this.desired=0;this.reconcile();}
  exitIsland(){if(!this.mapQuestion)return;this.exiting=true;this.mapQuestion=false;this.history.go(-1);}
  reconcile(){
    if(this.traversing)return;
    if(this.depth>this.desired){this.traversing=true;this.history.go(this.desired-this.depth);return;}
    while(this.depth<this.desired){this.depth++;this.history.pushState({...this.history.state,islandShell:{owner:this.owner,depth:this.depth,mapGuard:this.mapGuard}},'');}
  }
  pop(event){
    if(this.exiting)return;
    const own=event.state?.islandShell,wasTraversal=this.traversing;
    this.traversing=false;this.depth=own?.owner===this.owner?own.depth:0;
    if(!wasTraversal&&this.mapGuard&&this.desired===0&&this.depth<0){this.mapQuestion=true;this.onMapBack();return;}
    if(!wasTraversal&&this.desired===2&&this.depth<2){
      this.onGameBack();
      // Restore the existing guard, including when Back is pressed repeatedly.
      this.traversing=true;this.history.go(2-this.depth);return;
    }
    if(!wasTraversal&&this.desired===1&&this.depth===0){this.desired=0;this.onMenuBack();return;}
    this.reconcile();
  }
  dispose(){this.target.removeEventListener('popstate',this.listener);}
}

export function gamePresentation(config,id){return config.gameShell.games[id];}
/** Shared fullscreen, pause, visibility and input/audio lifecycle for every adapter. */
export class GameShell {
  constructor({dialog,stage,controls,pauseButton,sound,t,onExit,landscape=false}) {
    Object.assign(this,{dialog,stage,controls,pauseButton,sound,t,onExit});
    this.events=new AbortController();this.paused=false;this.disposed=false;
    const options={signal:this.events.signal};
    pauseButton.addEventListener('click',()=>this.paused?this.resume():this.pause('exit'),options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();},options);
    document.addEventListener('fullscreenchange',()=>{
      if(document.fullscreenElement)this.wasFullscreen=true;
      else if(this.wasFullscreen&&!this.disposed)this.pause('exit');
    },options);
    this.wasFullscreen=Boolean(document.fullscreenElement);
    const entry=entries.get(document);this.starting=Boolean(entry);
    dialog.dataset.paused='false';
    this.landscape=landscape;
    if(landscape){
      const overlay=this.rotationOverlay=document.createElement('section');overlay.className='soccer-rotate';
      overlay.setAttribute('role','region');overlay.setAttribute('aria-label',t('soccer.rotate'));
      overlay.innerHTML='<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5"><rect x="38" y="22" width="44" height="76" rx="8" transform="rotate(35 60 60)"/><path d="M20 64a42 42 0 0 1 72-34m-1-15 3 17-17-2M100 56a42 42 0 0 1-72 34m1 15-3-17 17 2"/></g></svg>';
      const pause=iconButton('game-rotate-pause',t('game.pause'),'pause');pause.addEventListener('click',()=>this.pause(),options);
      overlay.append(pause);dialog.append(overlay);
      const resize=()=>this.setOrientationBlocked(window.innerHeight>window.innerWidth);
      window.addEventListener('resize',resize,options);screen.orientation?.addEventListener?.('change',resize,options);resize();
    }
    if(entry)this.countdown(entry);
  }
  async countdown(entry){
    const overlay=this.countdownOverlay=document.createElement('div');overlay.className='shell-countdown';overlay.setAttribute('role','status');overlay.setAttribute('aria-label',this.t('shell.ready'));overlay.innerHTML='<i></i><i></i>';this.dialog.append(overlay);this.dialog.dataset.starting='true';
    await entry.ready;
    if(this.disposed)return;
    for(const dot of overlay.children){await new Promise(resolve=>{this.countdownResolve=resolve;this.countdownTimer=setTimeout(resolve,entry.countdownStepMs);});if(this.disposed)return;dot.classList.add('done');}
    this.starting=false;overlay.remove();this.dialog.dataset.starting='false';this.applyPause();
  }
  setOrientationBlocked(value){
    value=Boolean(value);if(this.orientationBlocked===value)return;
    this.orientationBlocked=value;this.rotationOverlay.hidden=!value;
    this.dialog.dataset.orientationBlocked=String(value);this.applyPause();if(!value&&!this.paused)this.sound.unlock();
  }
  applyPause(){
    const blocked=this.paused||this.orientationBlocked||this.starting;
    this.session?.setPaused?.(Boolean(blocked));this.sound.setPaused(Boolean(blocked));
    this.stage.inert=this.controls.inert=Boolean(blocked);
  }
  bind(session){
    this.session=session;
    for(const b of this.controls.querySelectorAll('button'))if(!b.hasAttribute('aria-label'))b.setAttribute('aria-label',b.textContent.trim());
    if(document.hidden)this.pause();else this.applyPause();
  }
  pause(kind='pause',content){
    if(this.disposed)return;
    this.paused=true;this.session?.setPaused?.(true);this.sound.setPaused(true);
    this.dialog.dataset.paused='true';this.stage.inert=this.controls.inert=true;
    this.sheet?.remove();const sheet=this.sheet=document.createElement('section');sheet.className='game-pause-sheet';sheet.dataset.pauseKind=kind;
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',this.t(kind==='exit'?'game.exitQuestion':'game.paused'));
    const card=document.createElement('div');card.className='game-pause-card';
    const heading=document.createElement('h2');heading.className='shell-pause-heading';heading.setAttribute('aria-label',this.t(kind==='exit'?'game.exitQuestion':'game.paused'));card.append(heading);
    if(content)card.append(content);
    const actions=document.createElement('div');actions.className='game-pause-actions';
    const resume=iconButton('game-resume',this.t('game.resume'),'play');resume.onclick=()=>this.resume();
    const exit=iconButton('game-exit',this.t('game.returnIsland'),'exit');exit.onclick=this.onExit;
    const mute=iconButton('game-pause-sound',this.t('sound.mute'),'sound');const label=()=>{const text=this.t(this.sound.muted?'sound.unmute':'sound.mute');mute.title=text;mute.setAttribute('aria-label',text);mute.setAttribute('aria-pressed',String(this.sound.muted));mute.replaceChildren(shellIcon(this.sound.muted?'muted':'sound'));};mute.onclick=()=>{this.sound.setMuted(!this.sound.muted);label();};label();
    actions.append(resume,mute,exit);card.append(actions);sheet.append(card);this.dialog.append(sheet);resume.focus();
  }
  resume(){
    if(this.disposed||document.hidden)return;
    this.paused=false;this.sheet?.remove();this.sheet=null;
    this.dialog.dataset.paused='false';
    this.applyPause();if(!this.orientationBlocked){this.sound.unlock();this.stage.querySelector('canvas')?.focus();}
    else this.rotationOverlay.querySelector('button')?.focus();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.events.abort();this.sheet?.remove();this.sound.setPaused(false);
    clearTimeout(this.countdownTimer);this.countdownResolve?.();this.countdownOverlay?.remove();this.rotationOverlay?.remove();
  }
}

/** Fit fixed model coordinates into any viewport without stretching or clipping. */
export function fitGameViewport(width,height,modelWidth,modelHeight){
  const scale=Math.min(width/modelWidth,height/modelHeight);
  return {scale,offsetX:Math.max(0,(width-modelWidth*scale)/2),offsetY:Math.max(0,(height-modelHeight*scale)/2),
    width:width/scale,height:height/scale};
}

/** HUD and controls float over a full-window canvas; keep the whole model visible between them. */
export function gamePlayArea(canvas,dialog,controls){
  const box=canvas.getBoundingClientRect(),c=controls.getBoundingClientRect();
  let top=8;
  for(const selector of ['.game-header','.game-status:not(.soccer-live-status)','.soccer-roster','.soccer-scoreboard']){
    const node=dialog.querySelector(selector);if(node)top=Math.max(top,node.getBoundingClientRect().bottom-box.top+8);
  }
  const side=box.width>box.height&&c.width<box.width*.5&&c.top<box.top+box.height*.5;
  const width=Math.max(1,side?c.left-box.left-16:box.width-16);
  const height=Math.max(1,(side?box.height-8:c.top-box.top-8)-top);
  return {x:8,y:top,width,height};
}
