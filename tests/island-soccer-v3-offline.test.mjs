import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOCCER_ASSET_PATHS,SOCCER_CACHE_PATTERNS,isSoccerCachedPath,soccerCacheName} from '../workout/island/minigames/soccer-offline.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');

test('v3 offline: every soccer asset in the device-cache list exists and is matched by the cache patterns',async()=>{
 assert.ok(SOCCER_ASSET_PATHS.length>=40);
 assert.equal(new Set(SOCCER_ASSET_PATHS).size,SOCCER_ASSET_PATHS.length,'no duplicates');
 for(const p of SOCCER_ASSET_PATHS){
  await access(path.join(island,p));
  assert.ok(isSoccerCachedPath('/workout/island/'+p),p+' is served from the cache');
  assert.ok(isSoccerCachedPath('/'+p),p+' matches under any island root');
 }
});

test('v3 offline: application code, versioned data and other games never come from the soccer cache',()=>{
 for(const p of ['/workout/island/index.html','/workout/island/app.mjs','/workout/island/minigames/soccer.mjs','/workout/island/data/config.json','/workout/island/release.mjs','/workout/island/soccer-sw.js',
  '/workout/island/design/models2/hoops-court.glb','/workout/island/design/motion2/hoops/shots.json','/workout/island/design/characters2/skier.glb','/workout/island/vendor/three.module.js','/workout/island/design/environment/textures/../../../app.mjs'])
  assert.equal(isSoccerCachedPath(p),false,p);
 assert.equal(isSoccerCachedPath(null),false);
 assert.equal(soccerCacheName('island-v2-20261101-1'),'island-soccer-island-v2-20261101-1');
 assert.equal(soccerCacheName('a/b c'),'island-soccer-a_b_c');
 assert.equal(soccerCacheName(''),'island-soccer-dev');
});

test('v3 offline: the service worker is a plain classic script with the same patterns, no code from text and a version-scoped cache',async()=>{
 const source=await readFile(path.join(island,'soccer-sw.js'),'utf8');
 for(const banned of ['eval(','importScripts(','new Function','document.','innerHTML'])assert.ok(!source.includes(banned),banned);
 assert.ok(!/^\s*(import|export)\s/m.test(source),'classic worker, not a module');
 for(const pattern of SOCCER_CACHE_PATTERNS)assert.ok(source.includes(pattern.source),'worker carries pattern '+pattern.source);
 assert.ok(source.includes("'island-soccer-'+VERSION"),'cache name is version scoped');
 assert.ok(source.includes("name.startsWith('island-soccer-')&&name!==CACHE")&&source.includes('caches.delete'),'old soccer caches are dropped on activate');
 assert.ok(source.includes("request.method!=='GET'")&&source.includes('url.origin===self.location.origin'),'only same-origin GET');
 assert.ok(source.includes("'soccer-precache'")&&source.includes("'soccer-precache-progress'")&&source.includes("'soccer-precache-done'"));
});

test('v3 offline: the soccer menu registers the worker with the release version, offers the one-time download and keeps the last load report',async()=>{
 const card=await readFile(path.join(island,'ui/soccer-card.mjs'),'utf8'),session=await readFile(path.join(island,'minigames/soccer-session.mjs'),'utf8'),view=await readFile(path.join(island,'minigames/soccer-view.mjs'),'utf8');
 assert.ok(card.includes("new URL('soccer-sw.js',islandRoot)")&&card.includes("url.searchParams.set('v',DATA_VERSION)"),'worker URL carries the release version so a release drops the old cache');
 assert.ok(card.includes("updateViaCache:'none'"));
 assert.ok(card.includes("data-action='soccer-download-assets'")||card.includes("dataset.action='soccer-download-assets'"));
 assert.ok(card.includes("'island.soccer.assetsDownloaded'")&&card.includes("'island.soccer.lastLoadReport'"));
 assert.ok(session.includes("'island.soccer.lastLoadReport'")&&session.includes('saveLoadReport'),'the match writes the report once assets settle');
 assert.ok(view.includes('function report()')&&view.includes('characterError')&&view.includes('sceneFailure'),'the view exposes what loaded and why fallbacks happened');
 const scene=await readFile(path.join(island,'minigames/soccer-design-scene.mjs'),'utf8'),character=await readFile(path.join(island,'minigames/soccer-design-character.mjs'),'utf8');
 assert.ok(character.includes('export async function retrying')&&(character.match(/retrying\(/g)||[]).length>=4,'character files are fetched with retries');
 assert.ok((scene.match(/retrying\(/g)||[]).length>=2,'stadium models and textures are fetched with retries');
});

test('v3 offline: retrying returns the first success, retries transient failures and names the asset on exhaustion',async()=>{
 const {retrying}=await import('../workout/island/minigames/soccer-design-character.mjs');
 let calls=0;
 assert.equal(await retrying(async()=>{calls++;if(calls<3)throw Error('net');return 'ok';},'x'),'ok');assert.equal(calls,3);
 await assert.rejects(retrying(async()=>{throw Error('HTTP 404');},'characters2/soccer-player.glb',2),/characters2\/soccer-player\.glb: HTTP 404/);
});
