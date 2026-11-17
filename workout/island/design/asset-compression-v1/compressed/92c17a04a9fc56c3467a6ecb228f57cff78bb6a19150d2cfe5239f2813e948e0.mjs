// "Stuck while loading?" for the three island games (soccer, basketball, ski).
// One watcher for all of them, independent of each game's own ready signal: the session
// says whether it is ready through the shared contract `session.ready` / `session.loadFailed`.
// For older or foreign sessions the three existing signals are read instead
// (soccer renderMetrics.assetStatus, ski snapshot.loaded, basketball renderMetrics.calls).
// The watcher only draws the rescue buttons; restarting is done by the caller.
export const STUCK_MS=12000;
// Every island game has the "stuck? restart" button. The value is the offline-manifest key the game's own assets are cleared by.
export const RESCUE_GAMES=Object.freeze({soccer:'soccer',streetSlam:'hoops',alpineRush:'alpine',tennis:'tennis',islandRacing:'racing',navalDuel:'naval',fireRescue:'fire',alienDefense:'alien',boarDefense:'boar',catchCriminal:'catch'});

/** 'ready' | 'loading' | 'failed' for any island session. */
export function loadState(session){
  if(!session)return 'loading';
  if(typeof session.ready==='boolean'){
    if(session.loadFailed)return 'failed';
    return session.ready?'ready':'loading';
  }
  let snap;try{snap=session.snapshot;}catch{return 'loading';}
  if(!snap)return 'loading';
  if(snap.error||snap.contractsStatus==='error')return 'failed';
  if(snap.ready===true)return 'ready';
  const m=snap.renderMetrics;
  if(snap.loaded||m?.assetStatus==='ready'||m?.calls>0||m?.drawCalls>0||m?.triangles>0)return 'ready';
  // A session with no render metrics at all (plain canvas games) has nothing asynchronous to wait for.
  if(!('renderMetrics' in snap))return 'ready';
  return 'loading';
}
/** Real activity since the game was launched: managed asset files that finished downloading (or came from the device cache) and their size. */
export function loadActivity(since,entries=globalThis.performance?.getEntriesByType?.('resource')||[]){
  let files=0,bytes=0;
  for(const e of entries){if(e.startTime<since||!/\.(glb|webp|jpg|png|ogg|json|wasm|mp4|mjs|js)(\?|$)/.test(e.name))continue;files++;bytes+=e.encodedBodySize||e.transferSize||0;}
  return {files,mb:Math.round(bytes/104857.6)/10};
}
/** Test hook: ?loadStuckMs=300 lowers the 12 second threshold. */
export function stuckThreshold(search=globalThis.location?.search||'',fallback=STUCK_MS){
  const v=Number(new URLSearchParams(search).get('loadStuckMs'));return Number.isFinite(v)&&v>=50?v:fallback;
}
/** Which action the next press offers: 0 restart, 1 light version, 2 clear the game's asset cache. */
export const rescueStep=attempts=>attempts>=2?'clear':attempts>=1?'lite':'restart';

/**
 * Starts watching one game session. attempts = how many manual restarts already happened
 * for this game. Resolves nothing; call .stop() when the game closes.
 */
export function watchLoading({session,dialog,t,attempts=0,thresholdMs=stuckThreshold(),pollMs=250,onRestart,onLite,onClear,onBack,onReady=()=>{},autoLite=false}){
  const doc=dialog.ownerDocument,started=Date.now();let box=null,stopped=false,timer;
  const make=(cls,text,action,fn)=>{const b=doc.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.dataset.action=action;b.onclick=fn;return b;};
  function show(failed){
    const step=rescueStep(attempts);
    if(!box){box=doc.createElement('div');box.className='load-rescue';box.dataset.loadRescue='true';box.setAttribute('role','group');box.setAttribute('aria-label',t('rescue.restart'));dialog.append(box);}
    box.dataset.step=step;box.dataset.failed=String(failed);
    const hint=doc.createElement('p');hint.className='load-rescue-hint';hint.textContent=t(failed&&step==='restart'?'rescue.hintFailed':step==='restart'?'rescue.hintStuck':step==='lite'?'rescue.hintLite':'rescue.hintClear');
    const row=doc.createElement('div');row.className='load-rescue-row';
    const main=step==='clear'?make('primary-button','','rescue-clear',()=>run(onClear)):step==='lite'?make('primary-button','','rescue-lite',()=>run(onLite)):make('primary-button','','rescue-restart',()=>run(onRestart));
    main.textContent=t(step==='clear'?'rescue.clear':step==='lite'?'rescue.lite':'rescue.restart');
    // Always keep the plain restart reachable next to the escalated step.
    const extra=step==='restart'?[]:[make('secondary-button',t('rescue.restart'),'rescue-restart',()=>run(onRestart))];
    row.append(main,...extra,make('secondary-button',t('rescue.back'),'rescue-back',()=>{stop();onBack?.();}));
    box.replaceChildren(hint,row);
  }
  // From 1.5 s on a slow load shows what is really happening: files and megabytes arrived so far, and the seconds. No invented percentage.
  const sinceMark=globalThis.performance?.now?.()??0;let line=null;
  function progress(){
    const sec=Math.round((Date.now()-started)/1000);if(sec<2)return;
    const a=loadActivity(sinceMark);
    if(!line){line=doc.createElement('p');line.className='load-progress';line.setAttribute('role','status');line.dataset.loadProgress='true';const bar=doc.createElement('span');bar.className='load-progress-bar';line.append(bar,doc.createElement('bdi'));dialog.append(line);}
    line.lastChild.textContent=t('rescue.progress',{files:a.files,mb:a.mb,sec});
  }
  let pressed=false;
  function run(fn){if(pressed)return;pressed=true;stop();fn?.();}
  function tick(){
    if(stopped)return;
    const state=loadState(session);
    if(state==='ready'){stop();onReady();return;}
    progress();
    // A heavy game that fails to load goes straight to its light version once, instead of waiting for a press.
    if(state==='failed'&&autoLite&&onLite){run(onLite);return;}
    if(state==='failed'){if(!box||box.dataset.failed!=='true')show(true);}
    else if(!box&&Date.now()-started>=thresholdMs)show(false);
    timer=setTimeout(tick,pollMs);
  }
  function stop(){stopped=true;clearTimeout(timer);box?.remove();box=null;line?.remove();line=null;}
  timer=setTimeout(tick,pollMs);
  return {stop,get visible(){return Boolean(box);}};
}
