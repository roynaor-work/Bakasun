// Opening screen of the island ("האי שלכם מתעורר…"): a short silent clip of the games
// themselves behind the text. The page paints first with a plain gradient and the text
// (static markup, no extra bytes). The clip is requested only when the island is still
// loading after SPLASH_DELAY_MS, never on a data saver, a slow link or when the visitor
// asked for reduced motion, and the request is cancelled the moment the island is ready.
// Any failure (missing file, offline, decode error, stall) leaves the static screen as is.
export const SPLASH_DELAY_MS=600;
export const SPLASH_STALL_MS=4000;
export const SPLASH_FAILSAFE_MS=25000;
export const SPLASH_FADE_MS=220;
export const SPLASH_FLAG='bootVideo'; // ?bootVideo=0 switches the clip off, ?bootVideo=1 forces it (tests)

/** Why the clip must not be requested, or '' when it may. */
export function clipBlocker({win=globalThis.window,search=win?.location?.search||''}={}){
  const flag=new URLSearchParams(search).get(SPLASH_FLAG);
  if(flag==='0')return 'flag';
  if(flag==='1')return '';
  if(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return 'reduced-motion';
  const c=win?.navigator?.connection;
  if(c?.saveData)return 'save-data';
  if(/(^|-)2g$/.test(c?.effectiveType||''))return 'slow-network';
  return '';
}

/**
 * Wires the static splash already in the document. Returns {end, state}. end() is safe to
 * call any number of times; it fades the splash out, cancels an unfinished clip download
 * and gives the page back to assistive technology.
 * options.src: the clip url (webm first, mp4 as a fallback source), options.delayMs for tests.
 */
export function startBootSplash({doc=globalThis.document,win=globalThis.window,sources=[],delayMs=SPLASH_DELAY_MS,stallMs=SPLASH_STALL_MS,failsafeMs=SPLASH_FAILSAFE_MS,fadeMs=SPLASH_FADE_MS}={}){
  const el=doc?.querySelector('[data-boot-splash]');
  const root=doc?.querySelector('#interface');
  const api={state:'static',end(){},text(){}};
  if(!el)return api;
  root?.setAttribute('aria-hidden','true');
  let ended=false,video=null,timers=[];
  const later=(fn,ms)=>{const id=win.setTimeout(fn,ms);timers.push(id);return id;};
  const dropVideo=reason=>{
    if(!video)return;
    const v=video;video=null;
    try{v.pause();}catch{}
    try{v.removeAttribute('src');for(const s of [...v.querySelectorAll('source')])s.remove();v.load();}catch{}
    v.remove();api.state=reason;el.dataset.clip=reason;
  };
  api.text=value=>{const p=el.querySelector('[data-boot-text]');if(p&&value)p.textContent=value;};
  api.end=()=>{
    if(ended)return;ended=true;
    for(const id of timers)win.clearTimeout(id);timers=[];
    dropVideo('ended');
    root?.removeAttribute('aria-hidden');
    el.dataset.state='leaving';
    const reduced=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(reduced||!fadeMs){el.remove();return;}
    later(()=>el.remove(),fadeMs+40);
  };
  const blocker=clipBlocker({win});
  if(blocker||!sources.length){api.state=blocker||'no-source';el.dataset.clip=api.state;}
  else later(()=>{
    if(ended||doc.hidden)return;
    video=doc.createElement('video');
    Object.assign(video,{muted:true,loop:true,playsInline:true,preload:'none',controls:false,disablePictureInPicture:true});
    video.defaultMuted=true;video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');video.tabIndex=-1;video.className='boot-splash-video';
    for(const [url,type] of sources){const s=doc.createElement('source');s.src=url;s.type=type;video.append(s);}
    video.addEventListener('playing',()=>{if(!video)return;api.state='playing';el.dataset.clip='playing';},{once:true});
    video.addEventListener('error',()=>dropVideo('failed'),true); // an error on a <source> does not bubble: capture it
    el.prepend(video);
    video.load();
    const started=video.play?.();
    started?.catch?.(()=>dropVideo('blocked'));
    later(()=>{if(video&&api.state!=='playing')dropVideo('stalled');},stallMs);
  },delayMs);
  later(()=>api.end(),failsafeMs);
  return api;
}
