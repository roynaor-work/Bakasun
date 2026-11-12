import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,access,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MANAGED,isManagedPath,cacheName,pathsFor,downloadSet,countCached,OFFLINE_GAMES} from '../workout/island/ui/offline.mjs';
import {buildShell} from '../workout/island/tools/offline-shell.mjs';
import {reportKey} from '../workout/island/ui/load-report.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=file=>readFile(path.join(island,file),'utf8');
const manifest=JSON.parse(await read('offline-manifest.json'));
const bytesOf=async list=>{let n=0;for(const p of list)if(p)n+=(await stat(path.join(island,p))).size;return n;};

test('offline manifest: every listed file exists, is cacheable by the worker rules and appears once per game',async()=>{
 assert.deepEqual(Object.keys(manifest.games).sort(),Object.keys(OFFLINE_GAMES).sort());
 for(const [game,list] of Object.entries(manifest.games)){
  assert.ok(list.length>=(game==='tennis'||game==='racing'||game==='naval'||game==='fire'||game==='alien'||game==='city'||game==='catch'?5:40),game+' has a real asset list');/* small packs */
  assert.equal(new Set(list).size,list.length,game+' has no duplicates');
  for(const p of list){await access(path.join(island,p));assert.ok(isManagedPath('/workout/island/'+p),p+' is served from the cache');}
 }
 for(const p of manifest.core){await access(path.join(island,p));}
});

test('offline manifest: sizes per game and for the island (reported in the release notes)',async()=>{
 const sizes={};for(const [game,list] of Object.entries(manifest.games))sizes[game]=await bytesOf(list);
 const union=pathsFor(manifest,undefined,{shell:false}),all=pathsFor(manifest,undefined,{shell:true});
 const assetsMb=(await bytesOf(union))/1048576,allMb=(await bytesOf(all))/1048576;
 console.log('offline MB',JSON.stringify(Object.fromEntries(Object.entries(sizes).map(([g,b])=>[g,Math.round(b/104857.6)/10])))+' assets '+assetsMb.toFixed(1)+' with app code '+allMb.toFixed(1));
 assert.ok(assetsMb>10&&assetsMb<80,'game assets stay a phone-sized download: '+assetsMb);
});

test('offline manifest: the basketball motion clips and the shell list are complete and up to date',async()=>{
 const motion=JSON.parse(await read('design/motion2/hoops/manifest.json'));
 for(const clip of motion.clips)assert.ok(manifest.games.hoops.includes('design/motion2/hoops/'+clip.file.replace(/^\.\//,'')),clip.file);
 assert.deepEqual(manifest.shell,await buildShell(),'shell list is stale: run node workout/island/tools/offline-shell.mjs');
 for(const must of ['','index.html','app.mjs','release.mjs','minigames/hoops-session.mjs','minigames/alpine-session.mjs','minigames/soccer-session.mjs','vendor/three.module.js'])assert.ok(manifest.shell.includes(must),must);
 assert.ok(!manifest.shell.some(p=>/^(tests|tools|verification)\//.test(p)));
});

test('offline worker: classic script with the same managed rule as the page, version scoped, no code from text',async()=>{
 const source=await read('offline-sw.js');
 for(const banned of ['eval(','importScripts(','new Function','document.','innerHTML','localStorage','indexedDB'])assert.ok(!source.includes(banned),banned);
 assert.ok(!/^\s*(import|export)\s/m.test(source),'classic worker, not a module');
 assert.ok(source.includes(MANAGED.source),'worker carries the same managed pattern as ui/offline.mjs');
 assert.ok(source.includes("'island-assets-'+VERSION"));
 assert.equal(cacheName('island-v2-20261107-10'),'island-assets-island-v2-20261107-10');
});

function runWorker(version='v1'){
 const listeners={},store=new Map(),cacheMap=new Map();
 const cacheApi={
  async keys(){return [...cacheMap.keys()];},async delete(name){return cacheMap.delete(name);},
  async open(name){if(!cacheMap.has(name))cacheMap.set(name,new Map());const m=cacheMap.get(name);return {async match(url){return m.get(String(url).split('?')[0])?.clone();},async put(url,res){m.set(String(url).split('?')[0],res);},m};},
 };
 const context={URL,Response,AbortController,setTimeout,clearTimeout,Promise,caches:cacheApi,
  self:{location:{href:'https://x.test/workout/island/offline-sw.js?v='+version,origin:'https://x.test'},addEventListener(type,fn){listeners[type]=fn;},skipWaiting(){},clients:{claim:async()=>{}}},fetch:null};
 context.fetch=(...a)=>context.fetchImpl(...a);
 vm.createContext(context);
 return readFile(path.join(island,'offline-sw.js'),'utf8').then(code=>{vm.runInContext(code,context);return {context,listeners,cacheMap,cacheApi,store};});
}
const fakeEvent=(href,method='GET')=>{let answered;return {request:{url:href,method,headers:new Headers(),clone(){return this;}},respondWith(p){answered=p;},get answered(){return answered;}};};

test('offline worker: old caches are dropped on activate, only the current version stays',async()=>{
 const w=await runWorker('v2');await w.cacheApi.open('island-soccer-old');await w.cacheApi.open('island-assets-v1');await w.cacheApi.open('island-assets-v2');await w.cacheApi.open('unrelated');
 let work;await w.listeners.activate({waitUntil:p=>{work=p;}});await work;
 assert.deepEqual((await w.cacheApi.keys()).sort(),['island-assets-v2','unrelated']);
});

test('offline worker: cached assets come from the device, other requests and other origins are left alone',async()=>{
 const w=await runWorker();const cache=await w.cacheApi.open('island-assets-v1');
 await cache.put('https://x.test/workout/island/design/models/soccer-ball.glb',new Response('cached'));
 w.context.fetchImpl=async()=>{throw Error('network must not be used');};
 const hit=fakeEvent('https://x.test/workout/island/design/models/soccer-ball.glb?x=1');w.listeners.fetch(hit);assert.equal(await (await hit.answered).text(),'cached');
 for(const href of ['https://other.test/workout/island/design/models/soccer-ball.glb','https://x.test/workout/island/release.json?check=1','https://x.test/workout/island/offline-sw.js'])assert.equal((()=>{const e=fakeEvent(href);w.listeners.fetch(e);return e.answered;})(),undefined,href);
 const post=fakeEvent('https://x.test/workout/island/design/models/soccer-ball.glb','POST');w.listeners.fetch(post);assert.equal(post.answered,undefined);
});

test('offline worker: a stalled asset ends in a 504 after a retry, a network error stays an error, and the app shell opens offline',async()=>{
 const w=await runWorker();let calls=0;
 w.context.fetchImpl=(request,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));};
 // Shorten the timeout through the worker's own constants.
 vm.runInContext('MISS_TIMEOUT_MS=30;',w.context);
 const stalled=fakeEvent('https://x.test/workout/island/design/models/soccer-ball.glb');w.listeners.fetch(stalled);
 const response=await stalled.answered;assert.equal(response.status,504);assert.equal(calls,2,'one retry');
 // Shell: cached copy is served when the network is gone.
 const cache=await w.cacheApi.open('island-assets-v1');await cache.put('https://x.test/workout/island/app.mjs',new Response('shell'));await cache.put('https://x.test/workout/island/',new Response('<html>'));
 w.context.fetchImpl=async()=>{throw new TypeError('offline');};
 for(const [href,text] of [['https://x.test/workout/island/app.mjs?v=island-v9','shell'],['https://x.test/workout/island/?dev=1','<html>'],['https://x.test/workout/island/index.html','<html>']]){
  const e=fakeEvent(href);w.listeners.fetch(e);assert.equal(await (await e.answered).text(),text,href);
 }
});

const fakeCache=()=>{const m=new Map();return {m,async match(url){return m.get(url);},async put(url,res){m.set(url,res);}};};
const ok=(body='x',type='application/octet-stream')=>new Response(body,{status:200,headers:{'content-type':type}});

test('download: files are cached with progress, retried after a failure, and already cached files are skipped',async()=>{
 const cache=fakeCache(),seen=[],failures=new Map([['https://x/b',1]]),fetched=[];
 await cache.put('https://x/a',ok('old'));
 const fetcher=async url=>{fetched.push(url);const left=failures.get(url)||0;if(left){failures.set(url,left-1);throw Error('net');}return ok('data-'+url);};
 const result=await downloadSet({urls:['https://x/a','https://x/b','https://x/c'],cache,fetcher,wait:async()=>{},onProgress:p=>seen.push(p.done)});
 assert.deepEqual(result.failed,[]);assert.equal(result.total,3);assert.equal(result.fresh,2);assert.ok(!fetched.includes('https://x/a'));
 assert.equal(fetched.filter(u=>u==='https://x/b').length,2,'b retried once');
 assert.equal(seen.at(-1),3);assert.equal(await countCached(cache,['https://x/a','https://x/b','https://x/c']),3);
});

test('download: a file that keeps failing or hangs is reported, never thrown, and the rest still downloads',async()=>{
 const cache=fakeCache();
 const fetcher=(url,{signal})=>{
  if(url.endsWith('/bad'))return Promise.resolve(new Response('',{status:404}));
  if(url.endsWith('/hang'))return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));
  if(url.endsWith('/html'))return Promise.resolve(ok('<html>','text/html'));
  return Promise.resolve(ok('fine'));
 };
 const result=await downloadSet({urls:['https://x/bad','https://x/hang','https://x/html','https://x/good'],cache,fetcher,attempts:2,timeoutMs:20,wait:async()=>{}});
 assert.deepEqual(result.failed.map(f=>f.href.split('/').pop()).sort(),['bad','hang','html']);
 assert.match(result.failed.find(f=>f.href.endsWith('/hang')).reason,/timeout 20 ms/);
 assert.match(result.failed.find(f=>f.href.endsWith('/bad')).reason,/HTTP 404/);
 assert.ok(await cache.match('https://x/good'));
});

test('save data safety: the offline code never clears or deletes game saves',async()=>{
 for(const file of ['ui/offline.mjs','ui/offline-panel.mjs','ui/load-report.mjs','offline-sw.js']){
  const source=await read(file);
  for(const banned of ['localStorage.clear','removeItem','indexedDB','.clear()','sessionStorage'])assert.ok(!source.includes(banned),file+' uses '+banned);
 }
 const offline=await read('ui/offline.mjs');
 assert.deepEqual([...offline.matchAll(/setItem\(([^,]+),/g)].map(m=>m[1]),['STATUS_KEY'],'the only key written is the offline status');
});

test('wiring: one panel in the main games menu, automatic download and release check on every open, reports for all three games',async()=>{
 const activity=await read('ui/activity.mjs'),app=await read('app.mjs'),hoops=await read('minigames/hoops-session.mjs'),alpine=await read('minigames/alpine-session.mjs'),soccer=await read('minigames/soccer-session.mjs'),card=await read('ui/soccer-card.mjs'),panel=await read('ui/offline-panel.mjs');
 assert.ok(activity.includes('dialog.append(cards,offlinePanel())'));
 assert.ok(panel.includes("dataset.action='offline-download-all'")&&panel.includes("dataset.action='offline-check-update'")&&panel.includes('הורדת כל המשחקים למכשיר')&&panel.includes('בדיקת עדכון והורדה'));
 assert.ok(app.includes('releaseWatch.poll()')&&app.includes('startAutoDownload(')&&app.includes('prefetchRelease(')&&app.includes('registerOfflineWorker()'));
 assert.ok(app.includes('canRun:()=>!engine.isMinigameActive()'),'the background download waits while a game runs');
 assert.ok(hoops.includes("saveGameReport('hoops'")&&alpine.includes("saveGameReport('alpine'")&&soccer.includes("'island.soccer.lastLoadReport'")&&card.includes("reportPanel('soccer')"));
 assert.equal(reportKey('soccer'),'island.soccer.lastLoadReport');assert.equal(reportKey('hoops'),'island.hoops.lastLoadReport');
 assert.ok(hoops.includes('timeout 45 s'),'basketball load has a clear timeout');
});

test('CSP: scripts and workers come from the island only; no blob workers or inline scripts',async()=>{
 const html=await read('index.html'),csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 const directive=name=>csp.split(';').map(d=>d.trim()).find(d=>d.startsWith(name+' '));
 assert.equal(directive('script-src'),"script-src 'self'");
 assert.equal(directive('worker-src'),undefined,'workers fall back to script-src, which has no blob:');
 assert.ok(!/script-src[^;]*(blob:|unsafe)/.test(csp));
 for(const file of ['ui/offline.mjs','ui/load-report.mjs','ui/offline-panel.mjs'])assert.ok(!/new Worker|createObjectURL|new Blob/.test(await read(file)),file);
});
