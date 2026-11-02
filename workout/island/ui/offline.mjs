// Keeping the island's game assets on the device: soccer, basketball and ski.
// One list (offline-manifest.json) drives everything: the download button, the
// background download after a release, the worker's rules and the tests.
// The download runs in the page and fills the Cache API; offline-sw.js serves from
// it. Save data is never touched: only Cache API entries named island-assets-<version>
// are created or removed here, never localStorage or IndexedDB game data.
import {DATA_VERSION} from '../release.mjs';

export const OFFLINE_GAMES=Object.freeze({soccer:'כדורגל',hoops:'כדורסל',alpine:'סקי'});
export const STATUS_KEY='island.offline.status';
/** Same rule as offline-sw.js: only these island paths are answered from the cache. */
export const MANAGED=/\/(?:design|assets)\/.+\.(?:glb|webp|jpg|png|svg|ogg|json|wasm)$|\/vendor\/draco\/[^/]+\.(?:wasm|js)$/;
export const isManagedPath=pathname=>typeof pathname==='string'&&!pathname.includes('..')&&MANAGED.test(pathname);
export const cacheName=version=>'island-assets-'+String(version||'dev').replace(/[^\w.-]/g,'_');
const islandRoot=new URL('../',import.meta.url);

export async function loadManifest(version=DATA_VERSION,fetcher=globalThis.fetch,root=islandRoot){
  const url=new URL('offline-manifest.json',root);url.searchParams.set('v',version);
  const response=await fetcher(url.href,{cache:'no-cache'});
  if(!response.ok)throw Error('manifest '+response.status);
  const manifest=await response.json();
  if(!manifest?.games||typeof manifest.games!=='object')throw Error('manifest shape');
  return manifest;
}
/** Unique paths for the named games (all games when none are named). The app shell
 * (code, styles, data), the core icons and the island's own boot assets (`island`) are added with {shell:true}: they are what
 * lets the island open with no network at all. */
export function pathsFor(manifest,games=Object.keys(manifest.games),{shell=false}={}){
  const seen=new Set();
  if(shell)for(const path of [...(manifest.core||[]),...(manifest.island||[]),...(manifest.shell||[])])seen.add(path);
  for(const game of games)for(const path of manifest.games[game]||[])seen.add(path);return [...seen];
}
export const hrefOf=(path,root=islandRoot)=>new URL(path,root).href;

/** Fetch every url into the cache with a per-attempt timeout, retries and a small
 * parallel pool. A file that still fails is reported, never thrown: the game then
 * loads over the network or falls back to its light version. Files already cached
 * are skipped, so an interrupted download resumes. */
export async function downloadSet({urls,cache,fetcher=globalThis.fetch,onProgress=()=>{},concurrency=3,attempts=3,timeoutMs=60000,wait=ms=>new Promise(r=>setTimeout(r,ms)),signal}){
  const failed=[];let done=0,bytes=0,fresh=0;const queue=[...urls],total=urls.length;
  const tick=()=>onProgress({done,total,bytes,percent:total?Math.round(done/total*100):100});
  async function one(href){
    if(await cache.match(href,{ignoreSearch:true}))return;
    let reason='';
    for(let attempt=1;attempt<=attempts;attempt++){
      if(signal?.aborted){reason='aborted';break;}
      const control=new AbortController(),timer=setTimeout(()=>control.abort(),timeoutMs),stop=()=>control.abort();signal?.addEventListener('abort',stop,{once:true});
      try{
        const response=await fetcher(href,{cache:'no-cache',signal:control.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        if(/text\/html/i.test(response.headers.get('content-type')||'')&&!/(?:\.html?|\/)$/.test(href))throw Error('not an asset (html)');
        const body=await response.blob();
        await cache.put(href,new Response(body,{status:200,headers:response.headers}));
        bytes+=body.size;fresh++;return;
      }catch(error){reason=control.signal.aborted&&!signal?.aborted?`timeout ${timeoutMs} ms`:String(error?.message||error);}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
      if(attempt<attempts)await wait(400*attempt);
    }
    failed.push({href,reason});
  }
  async function worker(){while(queue.length){const href=queue.shift();await one(href);done++;tick();}}
  tick();
  await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,queue.length))},worker));
  return {total,fresh,failed,bytes};
}
export async function countCached(cache,urls){let n=0;for(const href of urls)if(await cache.match(href,{ignoreSearch:true}))n++;return n;}

function storage(){try{return globalThis.localStorage||null;}catch{return null;}}
export function readStatus(){try{return JSON.parse(storage()?.getItem(STATUS_KEY)||'null');}catch{return null;}}
function writeStatus(value){try{storage()?.setItem(STATUS_KEY,JSON.stringify(value));}catch{}}
export const saveDataOn=()=>Boolean(globalThis.navigator?.connection?.saveData);
export const offlineSupported=()=>typeof caches!=='undefined'&&typeof navigator!=='undefined'&&Boolean(navigator.serviceWorker)&&typeof location!=='undefined'&&/^https?:$/.test(location.protocol);

let registration=null;
/** Registers offline-sw.js with the release version, so a release replaces the old cache. */
export function registerOfflineWorker(){
  if(registration!==null||!offlineSupported())return registration;
  const url=new URL('offline-sw.js',islandRoot);url.searchParams.set('v',DATA_VERSION);
  registration=navigator.serviceWorker.register(url.href,{scope:islandRoot.pathname,updateViaCache:'none'}).catch(()=>null);
  return registration;
}

/** What is on the device for this version, counted from the real cache. */
export async function offlineStatus(version=DATA_VERSION){
  if(!offlineSupported())return {supported:false,games:{}};
  const manifest=await loadManifest(version),cache=await caches.open(cacheName(version)),games={};let all=new Set();
  for(const game of Object.keys(OFFLINE_GAMES)){
    const urls=pathsFor(manifest,[game]).map(p=>hrefOf(p));urls.forEach(u=>all.add(u));
    const have=await countCached(cache,urls);games[game]={total:urls.length,have,complete:have===urls.length};
  }
  const shell=pathsFor(manifest,[],{shell:true}).map(p=>hrefOf(p));shell.forEach(u=>all.add(u));
  const shellHave=await countCached(cache,shell),have=await countCached(cache,[...all]);
  return {supported:true,version,total:all.size,have,complete:have===all.size,shell:{total:shell.length,have:shellHave,complete:shellHave===shell.length},games};
}

let running=null;
/** Download the named games (all by default). One download at a time; a second call
 * joins the first. onProgress({done,total,bytes,percent}). Resolves with
 * {total,failed,bytes,games,version}. Never rejects for a single bad file. */
export function downloadGames({games=Object.keys(OFFLINE_GAMES),version=DATA_VERSION,onProgress,signal,timeoutMs,attempts}={}){
  if(running){if(onProgress)running.listeners.add(onProgress);return running.promise;}
  const listeners=new Set(onProgress?[onProgress]:[]);
  const promise=(async()=>{
    if(!offlineSupported())throw Error('worker-unavailable');
    await registerOfflineWorker();
    const manifest=await loadManifest(version),urls=pathsFor(manifest,games,{shell:true}).map(p=>hrefOf(p));
    const cache=await caches.open(cacheName(version));
    const result=await downloadSet({urls,cache,signal,timeoutMs,attempts,onProgress:p=>{for(const l of listeners)l(p);}});
    const missing=new Set(result.failed.map(f=>f.href)),perGame={};
    for(const game of games){const list=pathsFor(manifest,[game]).map(p=>hrefOf(p));perGame[game]={total:list.length,missing:list.filter(u=>missing.has(u)).length};}
    const previous=readStatus();
    writeStatus({version,at:new Date().toISOString(),games:{...(previous?.version===version?previous.games:{}),...Object.fromEntries(Object.entries(perGame).map(([g,v])=>[g,{...v,ok:v.missing===0}]))},failed:result.failed.slice(0,20)});
    return {version,games:perGame,total:result.total,fresh:result.fresh,failed:result.failed,bytes:result.bytes};
  })().finally(()=>{running=null;});
  running={promise,listeners};return promise;
}
/** A newer release was announced: fill its cache while the current one keeps running.
 * The new worker, registered on the next open, finds the cache already full. */
export async function prefetchRelease(version,{onProgress}={}){
  if(!offlineSupported()||saveDataOn()||version===DATA_VERSION)return null;
  const manifest=await loadManifest(version),urls=pathsFor(manifest,undefined,{shell:true}).map(p=>hrefOf(p));
  const cache=await caches.open(cacheName(version));
  return downloadSet({urls,cache,onProgress});
}
/** Background download after a release (or when something is missing). Skips on a
 * data saver, waits while a game is running, and retries once after a failure. */
export function startAutoDownload({canRun=()=>true,onState=()=>{},delayMs=4000,pollMs=30000,retryMs=120000,maxWaits=40}={}){
  if(!offlineSupported())return ()=>{};
  let stopped=false,timer=null,waits=0,retried=false;
  const later=(fn,ms)=>{timer=setTimeout(()=>{if(!stopped)fn();},ms);};
  async function attempt(){
    if(saveDataOn()){onState({state:'save-data'});return;}
    if(navigator.onLine===false){onState({state:'offline'});return;}
    let status;try{status=await offlineStatus();}catch(error){onState({state:'error',error:String(error?.message||error)});return;}
    if(status.complete){onState({state:'ready',status});return;}
    if(!canRun()&&waits++<maxWaits){later(attempt,pollMs);return;}
    onState({state:'downloading'});
    try{
      const result=await downloadGames({onProgress:p=>onState({state:'downloading',progress:p})});
      onState({state:result.failed.length?'partial':'ready',result});
      if(result.failed.length&&!retried){retried=true;later(attempt,retryMs);}
    }catch(error){onState({state:'error',error:String(error?.message||error)});}
  }
  later(attempt,delayMs);
  return ()=>{stopped=true;clearTimeout(timer);};
}
/** Manual "check for update and download": looks for a newer release first. */
export async function checkAndDownload({onProgress,fetcher=globalThis.fetch}={}){
  let latest=DATA_VERSION;
  try{const response=await fetcher(new URL('release.json?check='+Date.now(),islandRoot).href,{cache:'no-store'});if(response.ok){const v=(await response.json()).version;if(/^[a-z0-9-]{1,80}$/.test(v))latest=v;}}catch{}
  const registered=await registerOfflineWorker();try{await registered?.update();}catch{}
  const result=await downloadGames({version:DATA_VERSION,onProgress});
  return {...result,latest,newer:latest!==DATA_VERSION};
}

export const megabytes=bytes=>Math.round(bytes/1048576*10)/10;
