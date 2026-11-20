// Keeping the island's game assets on the device: soccer, basketball, ski, tennis and racing.
// One list (offline-manifest.json) drives everything: the download button, the
// background download after a release, the worker's rules and the tests.
// The download runs in the page and fills the Cache API; offline-sw.js serves from
// it. Save data is never touched: only Cache API entries named island-assets-<version>
// are created or removed here, never localStorage or IndexedDB game data.
//
// Offline v25 (17/11/2026, `?offlineV25=0` restores v24): per-game packages with sizes,
// a manifest with a SHA-256 prefix per file (download only what changed between releases,
// verify every download), the current cache copied into the next release's cache and the
// old cache dropped when the new worker takes over, persistent storage, and a worker that
// answers the app shell from the device first.
import {DATA_VERSION} from '../release.mjs';

export const OFFLINE_GAMES=Object.freeze({soccer:'כדורגל',hoops:'כדורסל',alpine:'סקי',alpineLeague:'ליגת הסקי',tennis:'טניס',racing:'מרוצים',naval:'ספינות',boar:'אי החזירים',fire:'כיבוי אש',alien:'הגנה מחייזרים',city:'העיר',catch:'תפוס את הפושע'});
export const STATUS_KEY='island.offline.status';
/** Same rule as offline-sw.js: only these island paths are answered from the cache. */
export const MANAGED=/\/(?:design|assets)\/.+\.(?:glb|webp|jpg|png|svg|ogg|mp3|json|wasm|mp4)$|\/vendor\/draco\/[^/]+\.(?:wasm|js)$/;
export const isManagedPath=pathname=>typeof pathname==='string'&&!pathname.includes('..')&&MANAGED.test(pathname);
export const cacheName=version=>'island-assets-'+String(version||'dev').replace(/[^\w.-]/g,'_');
const islandRoot=new URL('../',import.meta.url);

/** v25 flag: on unless the page was opened with ?offlineV25=0. */
export const V25_PARAM='offlineV25';
export function v25On(search=globalThis.location?.search||''){return new URLSearchParams(search).get(V25_PARAM)!=='0';}
/** Which offline packages a game (engine id) needs. Boar defense: code in the shell plus the boar pack (campaign weather layers and upgrade icons, 20/11/2026). */
export const PACKS_OF=Object.freeze({soccer:['soccer'],streetSlam:['hoops'],alpineRush:['alpine','alpineLeague'],tennis:['tennis'],islandRacing:['racing'],navalDuel:['naval'],fireRescue:['fire'],alienDefense:['alien'],catchCriminal:['catch'],boarDefense:['boar']});
/** The hub itself (city models) is always wanted; the three main games are the default when nothing was played yet. */
export const ALWAYS_PACKS=Object.freeze(['city']);
export const DEFAULT_PACKS=Object.freeze(['soccer','hoops','alpine','alpineLeague']);
/** Packages to keep on the device for the games played so far (engine ids), in manifest order. */
export function packsForGames(played=[]){
  const wanted=new Set(ALWAYS_PACKS);
  const fromPlay=[...new Set(played)].flatMap(id=>PACKS_OF[id]||[]);
  for(const p of fromPlay.length?fromPlay:DEFAULT_PACKS)wanted.add(p);
  return Object.keys(OFFLINE_GAMES).filter(p=>wanted.has(p));
}

export async function loadManifest(version=DATA_VERSION,fetcher=globalThis.fetch,root=islandRoot){
  const url=new URL('offline-manifest.json',root);url.searchParams.set('v',version);
  const response=await fetcher(url.href,{cache:'no-cache'});
  if(!response.ok)throw Error('manifest '+response.status);
  const manifest=await response.json();
  if(!manifest?.games||typeof manifest.games!=='object')throw Error('manifest shape');
  // V241-010: an explicit kill switch restores the pre-fix download set; the game flags
  // still select v2/v22 as before. Default downloads include every documented rollback body.
  if(new URLSearchParams(globalThis.location?.search||'').get('hoopsRollbackOffline')==='0'){
    const legacyBodies=new Set(['guard','wing','center'].map(id=>'assets/athlete-body-v22/models/'+id+'.glb'));
    manifest.games.hoops=(manifest.games.hoops||[]).filter(p=>!legacyBodies.has(p));
  }
  return manifest;
}
/** Unique paths for the named games (all games when none are named). The app shell
 * (code, styles, data) and the core icons are added with {shell:true}: they are what
 * lets the island open with no network at all. */
export function pathsFor(manifest,games=Object.keys(manifest.games),{shell=false}={}){
  const seen=new Set();
  if(shell)for(const path of [...(manifest.core||[]),...(manifest.shell||[])])seen.add(path);
  for(const game of games)for(const path of manifest.games[game]||[])seen.add(path);return [...seen];
}
export const hrefOf=(path,root=islandRoot)=>new URL(path,root).href;
/** Bytes of a list of paths from the manifest's files map (0 for a path without an entry). */
export function bytesFor(manifest,paths){let n=0;for(const p of paths)n+=manifest.files?.[p]?.[1]||0;return n;}
/** href -> expected hash prefix, for every listed path the manifest knows the hash of. */
export function expectedHashes(manifest,paths,root=islandRoot){const map={};for(const p of paths){const h=manifest.files?.[p]?.[0];if(h)map[hrefOf(p,root)]=h;}return map;}
/** Same algorithm as tools/offline-shell.mjs: hex prefix of SHA-256. Null when the page has no WebCrypto (plain http). */
export async function digestBlob(blob,chars=16){
  const subtle=globalThis.crypto?.subtle;if(!subtle)return null;
  const hash=await subtle.digest('SHA-256',await blob.arrayBuffer());
  return [...new Uint8Array(hash)].slice(0,chars/2).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/** Fetch every url into the cache with a per-attempt timeout, retries and a small
 * parallel pool. A file that still fails is reported, never thrown: the game then
 * loads over the network or falls back to its light version. Files already cached
 * are skipped, so an interrupted download resumes. With `expect` (href -> hash prefix)
 * every download is verified and a wrong file is retried; with {verify:true} the files
 * already in the cache are hashed too and a corrupt one is replaced. {direct:true} adds
 * ?v25fresh=1 so the worker lets the request through to the server (next release files). */
export const freshHref=href=>href+(href.includes('?')?'&':'?')+'v25fresh=1';
export async function downloadSet({urls,cache,fetcher=globalThis.fetch,onProgress=()=>{},concurrency=3,attempts=3,timeoutMs=60000,wait=ms=>new Promise(r=>setTimeout(r,ms)),signal,gate,pauseMs=0,expect=null,verify=false,digest=digestBlob,direct=false}){
  const failed=[];let done=0,bytes=0,fresh=0,bad=0;const queue=[...urls],total=urls.length;
  const tick=()=>onProgress({done,total,bytes,percent:total?Math.round(done/total*100):100});
  async function one(href){
    const want=expect?.[href]||null,hit=await cache.match(href,{ignoreSearch:true});
    if(hit){
      if(!(verify&&want))return;
      const got=await digest(await hit.clone().blob()).catch(()=>null);
      if(got===null||got===want)return;
      bad++;await cache.delete(href,{ignoreSearch:true}).catch(()=>{});
    }
    let reason='';
    for(let attempt=1;attempt<=attempts;attempt++){
      if(signal?.aborted){reason='aborted';break;}
      const control=new AbortController(),timer=setTimeout(()=>control.abort(),timeoutMs),stop=()=>control.abort();signal?.addEventListener('abort',stop,{once:true});
      try{
        const response=await fetcher(direct?freshHref(href):href,{cache:'no-cache',signal:control.signal});
        if(!response.ok)throw Error('HTTP '+response.status);
        if(/text\/html/i.test(response.headers.get('content-type')||'')&&!/\.html?$/.test(href)&&!/\/(\?.*)?$/.test(href))throw Error('not an asset (html)');
        const body=await response.blob();
        if(want){const got=await digest(body).catch(()=>null);if(got!==null&&got!==want)throw Error('hash mismatch');}
        await cache.put(href,new Response(body,{status:200,headers:response.headers}));
        bytes+=body.size;fresh++;return;
      }catch(error){reason=control.signal.aborted&&!signal?.aborted?`timeout ${timeoutMs} ms`:String(error?.message||error);}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
      if(attempt<attempts)await wait(400*attempt);
    }
    failed.push({href,reason});
  }
  // gate(): resolves true when a file may start (a game is not running); files in flight finish. pauseMs spaces files out (gentle background download).
  async function worker(){while(queue.length){if(gate)while(!signal?.aborted&&!(await gate()))await wait(1000);if(signal?.aborted)break;const href=queue.shift();await one(href);done++;tick();if(pauseMs&&queue.length)await wait(pauseMs);}}
  tick();
  await Promise.all(Array.from({length:Math.min(concurrency,Math.max(1,queue.length))},worker));
  return {total,fresh,failed,bytes,bad};
}
export async function countCached(cache,urls){let n=0;for(const href of urls)if(await cache.match(href,{ignoreSearch:true}))n++;return n;}
/** Bare hrefs (no query) of everything in a cache, read once instead of one match() per file. */
export async function cachedSet(cache){const set=new Set();if(!cache)return set;for(const request of await cache.keys()){const u=new URL(request.url);u.search='';u.hash='';set.add(u.href);}return set;}
/** Open a cache only if it exists (caches.open would create an empty one, e.g. the old release's cache right after its worker dropped it). */
export async function openExisting(name,cacheStorage=globalThis.caches){return (await cacheStorage.has(name))?cacheStorage.open(name):null;}

function storage(){try{return globalThis.localStorage||null;}catch{return null;}}
export function readStatus(){try{return JSON.parse(storage()?.getItem(STATUS_KEY)||'null');}catch{return null;}}
function writeStatus(value){try{storage()?.setItem(STATUS_KEY,JSON.stringify(value));}catch{}}
export const saveDataOn=()=>Boolean(globalThis.navigator?.connection?.saveData);
export const offlineSupported=()=>typeof caches!=='undefined'&&typeof navigator!=='undefined'&&Boolean(navigator.serviceWorker)&&typeof location!=='undefined'&&/^https?:$/.test(location.protocol);

/** Background download policy from what the browser exposes about the connection.
 * saveData or a 2G class link: nothing in the background (the button still works).
 * A link the browser reports as cellular: only the app shell (so the island opens
 * offline), the game packages wait for Wi-Fi. Unknown type (iOS, desktop): everything. */
export function autoPolicy(connection=globalThis.navigator?.connection||null){
  if(!connection)return {shell:true,packs:true,reason:'unknown'};
  if(connection.saveData)return {shell:false,packs:false,reason:'save-data'};
  if(/^(?:slow-2g|2g)$/.test(connection.effectiveType||''))return {shell:false,packs:false,reason:'slow'};
  if(/^(?:cellular|bluetooth|wimax)$/.test(connection.type||''))return {shell:true,packs:false,reason:'cellular'};
  return {shell:true,packs:true,reason:connection.type||'unknown'};
}

let registration=null;
const workerUrl=(version,v25=v25On())=>{const url=new URL('offline-sw.js',islandRoot);url.searchParams.set('v',version);if(v25)url.searchParams.set('v25','1');return url;};
/** Registers offline-sw.js with the release version, so a release replaces the old cache. */
export function registerOfflineWorker(){
  if(registration!==null||!offlineSupported())return registration;
  registration=navigator.serviceWorker.register(workerUrl(DATA_VERSION).href,{scope:islandRoot.pathname,updateViaCache:'none'}).catch(()=>null);
  return registration;
}

/** What is on the device for this version, counted from the real cache, with bytes from the manifest. */
export async function offlineStatus(version=DATA_VERSION){
  if(!offlineSupported())return {supported:false,games:{}};
  const manifest=await loadManifest(version),have=await cachedSet(await openExisting(cacheName(version))),games={};
  const count=paths=>{let n=0,b=0;for(const p of paths)if(have.has(hrefOf(p))){n++;b+=manifest.files?.[p]?.[1]||0;}return {have:n,haveBytes:b};};
  const all=new Set();
  for(const game of Object.keys(OFFLINE_GAMES)){
    const paths=pathsFor(manifest,[game]);paths.forEach(p=>all.add(p));
    const c=count(paths);games[game]={total:paths.length,bytes:bytesFor(manifest,paths),...c,complete:c.have===paths.length};
  }
  const shellPaths=pathsFor(manifest,[],{shell:true});shellPaths.forEach(p=>all.add(p));
  const shellCount=count(shellPaths),total=count([...all]);
  return {supported:true,version,hashed:Boolean(manifest.files),total:all.size,bytes:bytesFor(manifest,[...all]),...total,complete:total.have===all.size,shell:{total:shellPaths.length,bytes:bytesFor(manifest,shellPaths),...shellCount,complete:shellCount.have===shellPaths.length},games};
}

/** "Clear this game's asset cache": removes only this game's own asset files from the
 * island-assets-* caches (never the shell, never localStorage, IndexedDB or saves).
 * Returns how many cache entries were deleted. */
export async function clearGameAssets(game,{version=DATA_VERSION,cacheStorage=globalThis.caches,fetcher=globalThis.fetch}={}){
  if(!cacheStorage||!OFFLINE_GAMES[game])return 0;
  const manifest=await loadManifest(version,fetcher),own=new Set(pathsFor(manifest,[game]).map(p=>hrefOf(p)));
  let removed=0;
  for(const name of await cacheStorage.keys()){
    if(!name.startsWith('island-assets-'))continue;
    const cache=await cacheStorage.open(name);
    for(const request of await cache.keys()){const u=new URL(request.url);u.search='';u.hash='';if(own.has(u.href)&&await cache.delete(request))removed++;}
  }
  return removed;
}
/** Pure part of deletePack: which of the game's files may go. A file shared with another
 * package that is complete on the device (or with the shell) stays. */
export function removablePaths(manifest,game,have){
  const own=pathsFor(manifest,[game]),keep=new Set(pathsFor(manifest,[],{shell:true}));
  for(const other of Object.keys(manifest.games)){if(other===game)continue;const paths=pathsFor(manifest,[other]);if(paths.every(p=>have.has(hrefOf(p))))paths.forEach(p=>keep.add(p));}
  return own.filter(p=>!keep.has(p));
}
/** v25 "delete this package": removes the game's files from the current cache, except files
 * another downloaded package or the shell still needs. Returns {removed, bytes}. Saves untouched. */
export async function deletePack(game,{version=DATA_VERSION,cacheStorage=globalThis.caches,fetcher=globalThis.fetch}={}){
  if(!cacheStorage||!OFFLINE_GAMES[game])return {removed:0,bytes:0};
  const manifest=await loadManifest(version,fetcher),cache=await openExisting(cacheName(version),cacheStorage);if(!cache)return {removed:0,bytes:0};const have=await cachedSet(cache);
  let removed=0,bytes=0;
  for(const p of removablePaths(manifest,game,have)){if(await cache.delete(hrefOf(p),{ignoreSearch:true})){removed++;bytes+=manifest.files?.[p]?.[1]||0;}}
  return {removed,bytes};
}

let running=null;
/** Download the named games (all by default). One download at a time; a second call
 * joins the first. onProgress({done,total,bytes,percent}). Resolves with
 * {total,failed,bytes,games,version}. Never rejects for a single bad file. */
export function downloadGames({games=Object.keys(OFFLINE_GAMES),version=DATA_VERSION,onProgress,signal,timeoutMs,attempts,concurrency,gate,pauseMs,verify=false}={}){
  if(running){if(onProgress)running.listeners.add(onProgress);return running.promise;}
  const listeners=new Set(onProgress?[onProgress]:[]);
  const promise=(async()=>{
    if(!offlineSupported())throw Error('worker-unavailable');
    await registerOfflineWorker();
    const manifest=await loadManifest(version),paths=pathsFor(manifest,games,{shell:true}),urls=paths.map(p=>hrefOf(p));
    const cache=await caches.open(cacheName(version));
    const result=await downloadSet({urls,cache,signal,timeoutMs,attempts,concurrency,gate,pauseMs,expect:expectedHashes(manifest,paths),verify,onProgress:p=>{for(const l of listeners)l(p);}});
    const missing=new Set(result.failed.map(f=>f.href)),perGame={};
    for(const game of games){const list=pathsFor(manifest,[game]).map(p=>hrefOf(p));perGame[game]={total:list.length,missing:list.filter(u=>missing.has(u)).length};}
    const previous=readStatus();
    writeStatus({version,at:new Date().toISOString(),games:{...(previous?.version===version?previous.games:{}),...Object.fromEntries(Object.entries(perGame).map(([g,v])=>[g,{...v,ok:v.missing===0}]))},failed:result.failed.slice(0,20)});
    return {version,games:perGame,total:result.total,fresh:result.fresh,failed:result.failed,bytes:result.bytes,bad:result.bad};
  })().finally(()=>{running=null;});
  running={promise,listeners};return promise;
}
export const downloadBusy=()=>Boolean(running);

/** Pure part of the release prefetch: for each wanted path of the next release, "copy" when the
 * current cache holds a file with the very hash the next manifest expects, "download" otherwise.
 * `hashOf(href)` hashes the current copy (null = missing). The current manifest is not consulted:
 * a file is copied only when its bytes are proven right. */
export async function planRelease(next,paths,{have,hashOf,root=islandRoot}){
  const copy=[],download=[];
  for(const p of paths){
    const href=hrefOf(p,root),want=next.files?.[p]?.[0];
    if(want&&have.has(href)&&(await hashOf(href))===want)copy.push(p);else download.push(p);
  }
  return {copy,download,copyBytes:bytesFor(next,copy),downloadBytes:bytesFor(next,download)};
}
/** A newer release was announced: fill its cache while the current one keeps running.
 * v25: files whose hash did not change are copied from the current cache (no network),
 * only the changed ones are downloaded; the packages kept are those complete on the device.
 * The new worker, registered by switchRelease or on the next open, finds the cache full
 * and drops the old one. One prefetch per version at a time (the panel and the release
 * watcher may both ask). Resolves {copied, copiedBytes, downloaded:{...}, total}. */
const prefetching=new Map();
export function prefetchRelease(version,options={}){
  if(prefetching.has(version)){const job=prefetching.get(version);if(options.onProgress)job.listeners.add(options.onProgress);return job.promise;}
  const listeners=new Set(options.onProgress?[options.onProgress]:[]);
  const promise=prefetchReleaseOnce(version,{...options,onProgress:p=>{for(const l of listeners)l(p);}}).finally(()=>{prefetching.delete(version);});
  prefetching.set(version,{promise,listeners});return promise;
}
async function prefetchReleaseOnce(version,{onProgress,games,v25=v25On(),concurrency=2,pauseMs=0,gate}={}){
  if(!offlineSupported()||saveDataOn()||version===DATA_VERSION)return null;
  const next=await loadManifest(version),nextCache=await caches.open(cacheName(version));
  if(!v25||!next.files){
    const urls=pathsFor(next,undefined,{shell:true}).map(p=>hrefOf(p));
    return downloadSet({urls,cache:nextCache,onProgress});
  }
  const current=await openExisting(cacheName(DATA_VERSION)),have=await cachedSet(current),already=await cachedSet(nextCache);
  if(!games){const status=await offlineStatus();games=Object.keys(OFFLINE_GAMES).filter(g=>status.games[g]?.complete);}
  const paths=pathsFor(next,games,{shell:true}).filter(p=>!already.has(hrefOf(p)));
  const hashOf=async href=>{const hit=current?await current.match(href,{ignoreSearch:true}):null;return hit?digestBlob(await hit.blob()):null;};
  const plan=await planRelease(next,paths,{have,hashOf});
  let copied=0;
  for(const p of plan.copy){const hit=current?await current.match(hrefOf(p),{ignoreSearch:true}):null;if(hit){await nextCache.put(hrefOf(p),hit);copied++;}else plan.download.push(p);}
  const urls=plan.download.map(p=>hrefOf(p));
  const downloaded=await downloadSet({urls,cache:nextCache,onProgress,concurrency,pauseMs,gate,expect:expectedHashes(next,plan.download),direct:true});
  return {version,copied,copiedBytes:plan.copyBytes,planned:plan.downloadBytes,downloaded,total:paths.length,games};
}
/** v25: hand the island to the new release. Registers the worker of `version` (its activate
 * drops every other island cache), waits until it controls the page, then reloads. Resolves
 * false (and does not reload) when the new worker could not take over, e.g. with no network. */
export async function switchRelease(version,{timeoutMs=15000,reload=url=>location.replace(url)}={}){
  if(!offlineSupported())return false;
  let reg;try{reg=await navigator.serviceWorker.register(workerUrl(version).href,{scope:islandRoot.pathname,updateViaCache:'none'});}catch{return false;}
  const controls=()=>Boolean(navigator.serviceWorker.controller&&new URL(navigator.serviceWorker.controller.scriptURL).searchParams.get('v')===version);
  const ok=await new Promise(resolve=>{
    const started=Date.now(),timer=setInterval(()=>{if(controls()){clearInterval(timer);resolve(true);}else if(Date.now()-started>timeoutMs||reg.installing?.state==='redundant'&&!controls()){clearInterval(timer);resolve(controls());}},100);
  });
  if(!ok)return false;
  registration=null;
  // The new worker's activate drops every other island cache; drop the current one here too, in case this page re-created it meanwhile.
  if(version!==DATA_VERSION)await caches.delete(cacheName(DATA_VERSION)).catch(()=>{});
  const url=new URL(location.href);url.searchParams.set('release',version);reload(url.href);return true;
}

/** Persistent storage: ask once, report usage and quota. `persisted` null = the browser has no such API. */
export async function persistStorage(){try{return navigator.storage?.persist?await navigator.storage.persist():null;}catch{return null;}}
export async function storageInfo(){
  const info={usage:null,quota:null,persisted:null};
  try{if(navigator.storage?.estimate){const e=await navigator.storage.estimate();info.usage=e.usage??null;info.quota=e.quota??null;}}catch{}
  try{if(navigator.storage?.persisted)info.persisted=await navigator.storage.persisted();}catch{}
  return info;
}

/** Background download after a release (or when something is missing). It never competes with
 * play: it starts only after `idleMs` (60 s) with no game and no open panel, downloads one file at
 * a time with a pause between files, and holds back between files the moment a game starts
 * (files already in flight finish). Skipped on a data saver and on a weak device
 * (`allowed()` false): there the download button is the only way. `?autodownload=0` turns it off.
 * v25: the shell goes first (the island opens offline), then only the packages of the games
 * played so far (`selectPacks()`, default the three main games), by the connection policy
 * (`autoPolicy`); it looks again every `recheckMs` for a newly played game. */
export function startAutoDownload({canRun=()=>true,allowed=()=>true,onState=()=>{},idleMs=60000,delayMs=4000,pollMs=5000,retryMs=120000,maxWaits=720,pauseMs=250,concurrency=1,selectPacks=null,policy=autoPolicy,recheckMs=120000,v25=v25On()}={}){
  if(!offlineSupported())return ()=>{};
  if(new URLSearchParams(globalThis.location?.search||'').get('autodownload')==='0')return ()=>{};
  let stopped=false,timer=null,waits=0,retried=false,idleSince=null;
  const later=(fn,ms)=>{clearTimeout(timer);timer=setTimeout(()=>{if(!stopped)fn();},ms);};
  const idle=()=>{if(!canRun()){idleSince=null;return false;}idleSince??=Date.now();return Date.now()-idleSince>=idleMs;};
  async function attempt(){
    const rule=v25?policy():{shell:!saveDataOn(),packs:!saveDataOn(),reason:saveDataOn()?'save-data':'all'};
    if(!rule.shell){onState({state:rule.reason==='save-data'?'save-data':'slow-connection',reason:rule.reason});return;}
    if(!allowed()){onState({state:'weak-device'});return;}
    if(navigator.onLine===false){onState({state:'offline'});return;}
    if(!idle()&&waits++<maxWaits){onState({state:'waiting-idle'});later(attempt,pollMs);return;}
    let status;try{status=await offlineStatus();}catch(error){onState({state:'error',error:String(error?.message||error)});return;}
    const wanted=v25?(rule.packs?(selectPacks?selectPacks():packsForGames()):[]):Object.keys(OFFLINE_GAMES);
    const missing=!status.shell.complete||wanted.some(g=>!status.games[g]?.complete);
    if(!missing){onState({state:'ready',status,wanted});if(v25&&recheckMs)later(attempt,recheckMs);return;}
    onState({state:'downloading',wanted});
    try{
      const gate=async()=>canRun()&&allowed();
      let result;
      if(v25&&!status.shell.complete){result=await downloadGames({games:[],concurrency,pauseMs,gate,onProgress:p=>onState({state:'downloading',phase:'shell',progress:p})});}
      if(!v25||wanted.length)result=await downloadGames({games:wanted,concurrency,pauseMs,gate,onProgress:p=>onState({state:'downloading',phase:'packs',progress:p})});
      onState({state:result.failed.length?'partial':'ready',result,wanted});
      if(result.failed.length&&!retried){retried=true;later(attempt,retryMs);}
      else if(v25&&recheckMs)later(attempt,recheckMs);
    }catch(error){onState({state:'error',error:String(error?.message||error)});}
  }
  later(attempt,delayMs);
  return ()=>{stopped=true;clearTimeout(timer);};
}
/** Manual "check for update and download": looks for a newer release first. */
export async function checkAndDownload({onProgress,fetcher=globalThis.fetch,games,verify=false}={}){
  let latest=DATA_VERSION;
  try{const response=await fetcher(new URL('release.json?check='+Date.now(),islandRoot).href,{cache:'no-store'});if(response.ok){const v=(await response.json()).version;if(/^[a-z0-9-]{1,80}$/.test(v))latest=v;}}catch{}
  const registered=await registerOfflineWorker();try{await registered?.update();}catch{}
  const result=await downloadGames({version:DATA_VERSION,onProgress,games,verify});
  return {...result,latest,newer:latest!==DATA_VERSION};
}

export const megabytes=bytes=>Math.round(bytes/1048576*10)/10;
