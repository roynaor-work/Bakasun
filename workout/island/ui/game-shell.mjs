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

/** Shared fullscreen, pause, visibility and input/audio lifecycle for every adapter. */
export class GameShell {
  constructor({dialog,stage,controls,pauseButton,sound,t,onExit}) {
    Object.assign(this,{dialog,stage,controls,pauseButton,sound,t,onExit});
    this.events=new AbortController();this.paused=false;this.disposed=false;
    const options={signal:this.events.signal};
    pauseButton.addEventListener('click',()=>this.paused?this.resume():this.pause(),options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();},options);
    document.addEventListener('fullscreenchange',()=>{
      if(document.fullscreenElement===dialog)this.wasFullscreen=true;
      else if(this.wasFullscreen&&!this.disposed)this.pause('exit');
    },options);
    dialog.dataset.paused='false';
    try {
      const request=dialog.requestFullscreen?.({navigationUI:'hide'});
      Promise.resolve(request).then(()=>{
        if(this.disposed&&document.fullscreenElement===dialog)void document.exitFullscreen().catch(()=>{});
      }).catch(()=>{}); // iOS/denied permission keeps the fixed 100dvh layer.
    }catch{}
  }
  bind(session){this.session=session;if(document.hidden)this.pause();else session.setPaused?.(this.paused);}
  pause(kind='pause',content){
    if(this.disposed)return;
    this.paused=true;this.session?.setPaused?.(true);this.sound.setPaused(true);
    this.dialog.dataset.paused='true';this.stage.inert=this.controls.inert=true;
    this.pauseButton.textContent=this.t('game.resume');
    this.pauseButton.setAttribute('aria-label',this.t('game.resume'));
    this.sheet?.remove();const sheet=this.sheet=document.createElement('section');sheet.className='game-pause-sheet';sheet.dataset.pauseKind=kind;
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',this.t(kind==='exit'?'game.exitQuestion':'game.paused'));
    const card=document.createElement('div');card.className='game-pause-card';
    const heading=document.createElement('h2');heading.textContent=this.t(kind==='exit'?'game.exitQuestion':'game.paused');card.append(heading);
    if(content)card.append(content);
    const actions=document.createElement('div');actions.className='game-pause-actions';
    const resume=document.createElement('button');resume.type='button';resume.className='primary-button';resume.dataset.action='game-resume';resume.textContent=this.t(kind==='exit'?'game.stay':'game.resume');resume.onclick=()=>this.resume();
    const exit=document.createElement('button');exit.type='button';exit.className='secondary-button';exit.dataset.action='game-exit';exit.textContent=this.t('game.leave');exit.onclick=this.onExit;
    actions.append(resume,exit);card.append(actions);sheet.append(card);this.dialog.append(sheet);resume.focus();
  }
  resume(){
    if(this.disposed||document.hidden)return;
    this.paused=false;this.sheet?.remove();this.sheet=null;this.stage.inert=this.controls.inert=false;
    this.dialog.dataset.paused='false';this.pauseButton.textContent=this.t('game.pause');
    this.pauseButton.setAttribute('aria-label',this.t('game.pause'));
    this.sound.setPaused(false);this.sound.unlock();this.session?.setPaused?.(false);
    this.stage.querySelector('canvas')?.focus();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.events.abort();this.sheet?.remove();this.sound.setPaused(false);
    if(document.fullscreenElement===this.dialog)void document.exitFullscreen().catch(()=>{});
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
