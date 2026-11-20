// Offline v25 (17/11/2026): per-game packages, hashed manifest, partial release update, device-first
// worker, persistent storage and install. Node part; the browser part is tests/island-offline-v25-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {OFFLINE_GAMES,PACKS_OF,ALWAYS_PACKS,DEFAULT_PACKS,packsForGames,pathsFor,bytesFor,hrefOf,digestBlob,downloadSet,planRelease,removablePaths,autoPolicy,v25On,cacheName} from '../workout/island/ui/offline.mjs';
import {buildFiles,hashFile,HASH_CHARS} from '../workout/island/tools/offline-shell.mjs';
import {describePack,describeStatus25,describeStorage,packUpdates} from '../workout/island/ui/offline-panel.mjs';
import {installableManifest,installState,INSTALL_TEXT} from '../workout/island/ui/offline-install.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=file=>readFile(path.join(island,file),'utf8');
const manifest=JSON.parse(await read('offline-manifest.json'));
const config=JSON.parse(await read('data/config.json'));
const root='https://x.test/workout/island/';

test('v25 manifest: schema 2 with a hash and size for every listed file, up to date with the files on disk',async()=>{
 assert.equal(manifest.schema,2);
 const listed=new Set([...manifest.core,...manifest.shell,...Object.values(manifest.games).flat()]);listed.delete('offline-manifest.json');
 assert.deepEqual(Object.keys(manifest.files).sort(),[...listed].sort(),'every listed path has an entry, nothing else');
 for(const [p,[hash,size]] of Object.entries(manifest.files)){assert.match(hash,new RegExp(`^[0-9a-f]{${HASH_CHARS}}$`),p);assert.equal(size,(await stat(path.join(island,p===''?'index.html':p))).size,p+' size');}
 assert.deepEqual(manifest.files,await buildFiles(manifest),'hashes are stale: run node workout/island/tools/offline-shell.mjs');
 assert.equal(manifest.files['']?.[0],await hashFile(path.join(island,'index.html')),'the root entry is index.html');
 const sizes=Object.fromEntries(Object.entries(manifest.games).map(([g,l])=>[g,Math.round(bytesFor(manifest,l)/104857.6)/10]));
 console.log('v25 pack MB',JSON.stringify(sizes),'shell+core',Math.round(bytesFor(manifest,pathsFor(manifest,[],{shell:true}))/104857.6)/10);
});

test('v25 packages: every playable game maps to packages that exist, the hub is always kept, the default is the three main games',()=>{
 const games=Object.keys(config.minigames).filter(id=>typeof config.minigames[id]==='object'&&!Array.isArray(config.minigames[id])&&(config.minigames[id].levels||config.minigames[id].stages||id in PACKS_OF));
 for(const id of games)assert.ok(id in PACKS_OF,id+' has a package list (may be empty)');
 for(const packs of Object.values(PACKS_OF))for(const p of packs)assert.ok(p in OFFLINE_GAMES&&p in manifest.games,p);
 assert.deepEqual(packsForGames([]),Object.keys(OFFLINE_GAMES).filter(p=>[...ALWAYS_PACKS,...DEFAULT_PACKS].includes(p)));
 assert.deepEqual(packsForGames(['tennis','tennis','boarDefense']),['tennis','boar','city']);
 assert.deepEqual(packsForGames(['alpineRush']),['alpine','alpineLeague','city']);
 assert.ok(packsForGames(['streetSlam']).includes('hoops')&&!packsForGames(['streetSlam']).includes('soccer'));
});

const fakeCache=()=>{const m=new Map();return {m,async match(url){return m.get(String(url).split('?')[0])?.clone();},async put(url,res){m.set(String(url).split('?')[0],res);},async delete(url){return m.delete(String(url).split('?')[0]);},async keys(){return [...m.keys()].map(u=>({url:u}));}};};
const ok=(body='x',type='application/octet-stream')=>new Response(body,{status:200,headers:{'content-type':type}});
const hashOf=async text=>digestBlob(new Blob([text]));

test('v25 download: every file is verified against the manifest hash, a wrong file is retried and reported, a corrupt cached file is replaced on verify',async()=>{
 const good=await hashOf('good-bytes'),cache=fakeCache();
 const expect={'https://x/a':good,'https://x/b':good,'https://x/c':await hashOf('cached-ok')};
 await cache.put('https://x/c',ok('cached-ok'));await cache.put('https://x/d',ok('corrupt'));expect['https://x/d']=await hashOf('fine-d');
 let fetched=[];
 const fetcher=async url=>{fetched.push(url);if(url.endsWith('/a'))return ok('good-bytes');if(url.endsWith('/b'))return ok('tampered');if(url.endsWith('/d'))return ok('fine-d');return ok('?');};
 const r=await downloadSet({urls:['https://x/a','https://x/b','https://x/c','https://x/d'],cache,fetcher,expect,verify:true,attempts:2,wait:async()=>{}});
 assert.deepEqual(r.failed.map(f=>[f.href.split('/').pop(),f.reason]),[['b','hash mismatch']]);
 assert.equal(fetched.filter(u=>u.endsWith('/b')).length,2,'a wrong file is retried');
 assert.ok(!fetched.some(u=>u.endsWith('/c')),'a cached file with the right hash is not fetched');
 assert.equal(r.bad,1,'the corrupt cached d was detected');assert.equal(await (await cache.match('https://x/d')).text(),'fine-d');
 assert.equal(r.fresh,2);assert.ok(!cache.m.has('https://x/b'),'a wrong file never enters the cache');
 // Without a hash the download works as before (manifest without files, plain http without WebCrypto).
 const plain=await downloadSet({urls:['https://x/a'],cache:fakeCache(),fetcher,expect:{},wait:async()=>{}});assert.deepEqual(plain.failed,[]);
 const noCrypto=await downloadSet({urls:['https://x/b'],cache:fakeCache(),fetcher,expect:{'https://x/b':good},digest:async()=>null,wait:async()=>{}});assert.deepEqual(noCrypto.failed,[],'no WebCrypto: not verified, not failed');
});

test('v25 release download asks the server directly (?v25fresh=1) so the current cache cannot answer with the old copy',async()=>{
 const cache=fakeCache(),fetched=[];const fetcher=async url=>{fetched.push(url);return ok('new');};
 await downloadSet({urls:['https://x/a.glb','https://x/b.json?v=1'],cache,fetcher,direct:true,wait:async()=>{}});
 assert.deepEqual(fetched,['https://x/a.glb?v25fresh=1','https://x/b.json?v=1&v25fresh=1']);
 assert.ok(cache.m.has('https://x/a.glb')&&cache.m.has('https://x/b.json'),'stored under the bare href');
});

test('v25 release plan: unchanged files are copied from the current cache, changed or missing ones are downloaded',async()=>{
 const next={games:{g:['a.glb','b.glb','c.glb']},core:[],shell:['app.mjs'],files:{'a.glb':[await hashOf('A'),10],'b.glb':[await hashOf('B2'),20],'c.glb':[await hashOf('C'),30],'app.mjs':[await hashOf('APP'),5]}};
 const current={'a.glb':'A','b.glb':'B','app.mjs':'APP'};
 const have=new Set(Object.keys(current).map(p=>root+p)),hashOfHref=async href=>hashOf(current[href.slice(root.length)]);
 const plan=await planRelease(next,pathsFor(next,['g'],{shell:true}),{have,hashOf:hashOfHref,root:new URL(root)});
 assert.deepEqual(plan.copy,['app.mjs','a.glb']);assert.deepEqual(plan.download,['b.glb','c.glb']);
 assert.equal(plan.copyBytes,15);assert.equal(plan.downloadBytes,50);
 const updates=packUpdates({files:{'a.glb':[await hashOf('A')],'b.glb':[await hashOf('B')],'c.glb':[await hashOf('C')]}},next);
 assert.deepEqual(updates,{g:{changed:1,bytes:20}});
});

test('v25 delete package: a game\'s files go, files shared with another complete package or the shell stay',()=>{
 const m={core:['icon.svg'],shell:['app.mjs'],games:{soccer:['ball.glb','athlete.glb','icon.svg'],hoops:['hoop.glb','athlete.glb'],tennis:['racket.glb','athlete.glb']},files:{}};
 const have=new Set(['ball.glb','athlete.glb','icon.svg','hoop.glb','app.mjs','racket.glb'].map(p=>hrefOf(p)));
 assert.deepEqual(removablePaths(m,'soccer',have),['ball.glb'],'athlete shared with complete hoops/tennis, icon is core');
 const haveSoccerOnly=new Set(['ball.glb','athlete.glb','icon.svg','app.mjs'].map(p=>hrefOf(p)));
 assert.deepEqual(removablePaths(m,'soccer',haveSoccerOnly),['ball.glb','athlete.glb'],'nothing else complete: the shared file goes too');
});

test('v25 background policy: data saver and 2G download nothing, cellular downloads the shell only, Wi-Fi or unknown everything',()=>{
 assert.deepEqual(autoPolicy(null),{shell:true,packs:true,reason:'unknown'});
 assert.deepEqual(autoPolicy({saveData:true,type:'wifi'}),{shell:false,packs:false,reason:'save-data'});
 assert.deepEqual(autoPolicy({effectiveType:'2g'}),{shell:false,packs:false,reason:'slow'});
 assert.deepEqual(autoPolicy({effectiveType:'4g',type:'cellular'}),{shell:true,packs:false,reason:'cellular'});
 assert.deepEqual(autoPolicy({effectiveType:'4g',type:'wifi'}),{shell:true,packs:true,reason:'wifi'});
 assert.deepEqual(autoPolicy({effectiveType:'4g'}),{shell:true,packs:true,reason:'unknown'});
 assert.equal(v25On(''),true);assert.equal(v25On('?offlineV25=0'),false);assert.equal(v25On('?offlineV25=1&x=1'),true);
});

function runWorker(query){
 const listeners={},cacheMap=new Map();
 const cacheApi={async keys(){return [...cacheMap.keys()];},async delete(name){return cacheMap.delete(name);},async open(name){if(!cacheMap.has(name))cacheMap.set(name,new Map());const m=cacheMap.get(name);return {async match(url){return m.get(String(url).split('?')[0])?.clone();},async put(url,res){m.set(String(url).split('?')[0],res);},m};}};
 const context={URL,Response,AbortController,setTimeout,clearTimeout,Promise,caches:cacheApi,self:{location:{href:'https://x.test/workout/island/offline-sw.js?'+query,origin:'https://x.test'},addEventListener(type,fn){listeners[type]=fn;},skipWaiting(){},clients:{claim:async()=>{}}},fetch:null};
 context.fetch=(...a)=>context.fetchImpl(...a);vm.createContext(context);
 return readFile(path.join(island,'offline-sw.js'),'utf8').then(code=>{vm.runInContext(code,context);return {context,listeners,cacheApi};});
}
const fakeEvent=href=>{let answered;return {request:{url:href,method:'GET',headers:new Headers(),clone(){return this;}},respondWith(p){answered=p;},get answered(){return answered;}};};

test('v25 worker: the app shell is answered from the device first and from the network only when missing; the manifest of another release always reaches the network; v24 registration keeps network-first',async()=>{
 const w=await runWorker('v=v7&v25=1'),cache=await w.cacheApi.open('island-assets-v7');
 await cache.put('https://x.test/workout/island/app.mjs',new Response('device'));await cache.put('https://x.test/workout/island/',new Response('<html>'));await cache.put('https://x.test/workout/island/offline-manifest.json',new Response('{"cur":1}'));
 let calls=0;w.context.fetchImpl=async()=>{calls++;return new Response('network',{status:200});};
 for(const href of ['https://x.test/workout/island/app.mjs?v=v7','https://x.test/workout/island/?release=v7','https://x.test/workout/island/index.html','https://x.test/workout/island/offline-manifest.json?v=v7']){
  const e=fakeEvent(href);w.listeners.fetch(e);assert.notEqual(e.answered,undefined,href);assert.match(await (await e.answered).text(),/device|<html>|cur/,href);
 }
 assert.equal(calls,0,'no network for cached shell files');
 const miss=fakeEvent('https://x.test/workout/island/ui/new-module.mjs?v=v7');w.listeners.fetch(miss);assert.equal(await (await miss.answered).text(),'network');assert.equal(calls,1);
 const other=fakeEvent('https://x.test/workout/island/offline-manifest.json?v=v8');w.listeners.fetch(other);assert.equal(other.answered,undefined,'the next release manifest is not intercepted');
 for(const href of ['https://x.test/workout/island/release.json?check=1','https://x.test/workout/island/offline-sw.js?v=v8&v25=1','https://x.test/workout/island/app.mjs?v25fresh=1','https://x.test/workout/island/design/x/a.glb?v25fresh=1']){const e=fakeEvent(href);w.listeners.fetch(e);assert.equal(e.answered,undefined,href+' is left to the network');}
 // v24 registration (no v25 flag): network first, device when the network fails.
 const old=await runWorker('v=v7'),oldCache=await old.cacheApi.open('island-assets-v7');await oldCache.put('https://x.test/workout/island/app.mjs',new Response('device'));
 old.context.fetchImpl=async()=>new Response('network',{status:200});const e1=fakeEvent('https://x.test/workout/island/app.mjs?v=v7');old.listeners.fetch(e1);assert.equal(await (await e1.answered).text(),'network');
 old.context.fetchImpl=async()=>{throw new TypeError('offline');};const e2=fakeEvent('https://x.test/workout/island/app.mjs?v=v7');old.listeners.fetch(e2);assert.equal(await (await e2.answered).text(),'device','network gone: the device copy answers in v24 mode too');
 // Activate of the next release's worker drops the current cache (the old release is removed once the new one is live).
 const next=await runWorker('v=v8&v25=1');await next.cacheApi.open('island-assets-v7');await next.cacheApi.open('island-assets-v8');let work;await next.listeners.activate({waitUntil:p=>{work=p;}});await work;
 assert.deepEqual(await next.cacheApi.keys(),['island-assets-v8']);assert.equal(cacheName('v8'),'island-assets-v8');
});

test('v25 install: manifest.webmanifest is installable (id, start_url, display, 192/512 and maskable icons) and the texts cover every state',async()=>{
 const wm=JSON.parse(await read('manifest.webmanifest'));
 assert.deepEqual(installableManifest(wm),{ok:true,problems:[]});
 assert.equal(wm.id,'./');assert.equal(wm.start_url,'./');assert.equal(wm.scope,'./');assert.equal(wm.dir,'rtl');
 for(const icon of wm.icons)await stat(path.join(island,icon.src));
 assert.deepEqual(installableManifest({name:'x',display:'browser',icons:[]}).problems,['start_url','id','display','icon 192','icon 512','maskable icon']);
 assert.ok(['installed','prompt','ios','manual'].includes(installState()));
 for(const state of ['installed','prompt','ios','manual'])assert.ok(INSTALL_TEXT[state].length>20,state);
 assert.match(INSTALL_TEXT.ios,/שיתוף/);assert.match(INSTALL_TEXT.ios,/הוספה למסך הבית/);
});

test('v25 panel texts: package states, summary and storage line',()=>{
 assert.equal(describePack(null),'לא זמין');
 assert.equal(describePack({complete:true,have:3,total:3}),'מוכן');
 assert.equal(describePack({complete:false,have:0,total:3}),'לא הורד');
 assert.equal(describePack({complete:false,have:1,total:3}),'חלקי · 1 מתוך 3');
 assert.equal(describePack({complete:true},{downloading:{percent:40}}),'בהורדה · 40%');
 assert.equal(describePack({complete:true},{update:{changed:2,bytes:3*1048576}}),'יש עדכון (2 קבצים, 3 MB)');
 const games=Object.fromEntries(Object.keys(OFFLINE_GAMES).map(g=>[g,{complete:g==='soccer'}]));
 assert.match(describeStatus25({supported:true,complete:false,have:10,haveBytes:20*1048576,bytes:97*1048576,shell:{complete:true,have:5,total:5},games}),/האפליקציה שמורה · 1 מתוך 12 משחקים מוכנים · 20 מתוך 97 MB/);
 assert.match(describeStatus25({supported:true,complete:true,bytes:97*1048576,games}),/שמור לגרסה הזו: כל המשחקים במכשיר \(97 MB\)/);
 assert.equal(describeStatus25({supported:false,games:{}}),'ההורדה למכשיר לא זמינה בדפדפן הזה. המשחקים נטענים מהרשת.');
 assert.equal(describeStorage({usage:null,quota:null,persisted:null}),'');
 assert.match(describeStorage({usage:50*1048576,quota:2*1073741824,persisted:false}),/50 MB · פנוי לאפליקציה: 2 GB · שמירה קבועה: לא/);
 assert.match(describeStorage({usage:50*1048576,quota:null,persisted:true}),/שמירה קבועה: כן/);
});

test('v25 wiring and safety: flag in the app, package rows and actions in the panel, no save key touched, no workers from text, both panels behind the one flag',async()=>{
 const app=await read('app.mjs'),panel=await read('ui/offline-panel.mjs'),offline=await read('ui/offline.mjs'),install=await read('ui/offline-install.mjs'),sw=await read('offline-sw.js'),html=await read('index.html');
 assert.ok(app.includes('v25On()')&&app.includes('switchRelease(')&&app.includes('selectPacks:')&&app.includes('readyRelease===pendingRelease'),'app: flag, release switch after prefetch, packs by games played');
 assert.ok(app.includes('prefetchRelease(')&&app.includes('startAutoDownload(')&&app.includes('registerOfflineWorker()'),'v24 wiring kept');
 for(const must of ["dataset.action='offline-download-all'","'offline-check-update'","'offline-pack-download'","'offline-pack-delete'","'offline-install'","'offline-persist'",'הורדת כל המשחקים למכשיר','בדיקת עדכון והורדה','מחיקה מהמכשיר','בטוח? מחיקה'])assert.ok(panel.includes(must),must);
 assert.ok(panel.includes('v25On()?offlinePanel25')&&panel.includes('offlinePanel24'),'the v24 panel stays behind ?offlineV25=0');
 assert.ok(sw.includes("PARAMS.get('v25')==='1'")&&sw.includes('if(V25&&hit)return hit;'),'worker: device-first only when registered with the flag');
 assert.ok(offline.includes("searchParams.set('v25','1')"),'the worker is registered with the flag');
 assert.ok(html.includes('./ui/offline-panel.css?v=island-v2-20261107-20'));
 for(const [file,source] of [['ui/offline.mjs',offline],['ui/offline-panel.mjs',panel],['ui/offline-install.mjs',install],['offline-sw.js',sw]]){
  for(const banned of ['localStorage.clear','removeItem','indexedDB','.clear()','sessionStorage','new Worker','createObjectURL','new Blob(','eval(','new Function','innerHTML'])assert.ok(!source.includes(banned),file+' uses '+banned);
 }
 assert.deepEqual([...offline.matchAll(/setItem\(([^,]+),/g)].map(m=>m[1]),['STATUS_KEY'],'the only key written is the offline status');
 assert.ok(!/setItem|localStorage/.test(panel+install),'panel and install write nothing to storage');
 // Cache deletions only touch island-assets-* caches (never another app's cache).
 for(const m of offline.matchAll(/cacheStorage\.keys\(\)[^\n]*\n[^\n]*/g))assert.ok(/island-assets-/.test(m[0]),'cache enumeration is filtered to the island');
});
