import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(process.env.SOCCER_QUALITY_SOURCE||fileURLToPath(new URL('../../../../../',import.meta.url)));
const base=path.resolve(process.env.SOCCER_QUALITY_BASE||fileURLToPath(new URL('../../../../../',import.meta.url)));
const island=path.join(root,'workout/island');
const {loadManifest,pathsFor,downloadSet}=await import(pathToFileURL(path.join(island,'ui/offline.mjs')));
const {buildShell}=await import(pathToFileURL(path.join(island,'tools/offline-shell.mjs')));
const manifest=JSON.parse(await readFile(path.join(island,'offline-manifest.json'),'utf8'));
const previousManifest=JSON.parse(await readFile(path.join(base,'workout/island/offline-manifest.json'),'utf8'));
const fetcher=async()=>({ok:true,json:async()=>manifest});

async function withLocation(search,run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 Object.defineProperty(globalThis,'location',{value:{search},configurable:true});
 try{return await run();}finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
}

test('offline shell includes exactly the final runtime dependency closure',async()=>{
 assert.deepEqual(manifest.shell,await buildShell(island));
 for(const file of ['minigames/soccer-quality.mjs','minigames/soccer-quality-team.mjs','minigames/soccer-quality-keeper.mjs','minigames/soccer-draco-js-worker.mjs'])assert.ok(manifest.shell.includes(file),file);
});

test('manifest selects JS only for quality soccer while legacy and other games preserve their assets',async()=>{
 const before=JSON.stringify(manifest);
 for(const search of ['','?soccerQuality=0','?soccerQualityLoft=0'])await withLocation(search,async()=>{
  const selected=await loadManifest('test',fetcher);
  assert.deepEqual(selected.games.soccer,previousManifest.games.soccer);
 });
 for(const search of ['?soccerQuality=v1','?soccerQualityKeeper=1'])await withLocation(search,async()=>{
  const selected=await loadManifest('test',fetcher);
  assert.ok(selected.games.soccer.includes('vendor/draco/draco_decoder.js'));
  assert.ok(!selected.games.soccer.some(file=>/\.wasm$|draco_wasm_wrapper\.js$/.test(file)));
  for(const game of Object.keys(manifest.games))if(game!=='soccer')assert.deepEqual(selected.games[game],previousManifest.games[game],game);
 });
 assert.equal(JSON.stringify(manifest),before,'fetched manifest stays reusable across flag selections');
});

test('quality soccer download uses JS decoder with all dependency scripts and zero WASM fetches',async()=>{
 await withLocation('?soccerQuality=v1',async()=>{
  const selected=await loadManifest('test',fetcher),files=pathsFor(selected,['soccer'],{shell:true}),requested=[];
  const result=await downloadSet({urls:files.map(file=>'https://example.test/workout/island/'+file),
   cache:{match:async()=>undefined,put:async()=>{}},attempts:1,
   fetcher:async url=>{requested.push(url);return new Response('cached test bytes',{headers:{'content-type':'application/octet-stream'}});}
  });
  assert.deepEqual(result.failed,[]);assert.equal(result.fresh,files.length);
  assert.ok(requested.some(url=>url.endsWith('/vendor/draco/draco_decoder.js')));
  assert.ok(requested.some(url=>url.endsWith('/minigames/soccer-draco-js-worker.mjs')));
  assert.ok(!requested.some(url=>/\.wasm$|draco_wasm_wrapper\.js$/.test(url)));
 });
});
